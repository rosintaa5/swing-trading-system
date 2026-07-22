const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
const crypto = require("crypto"); 
const querystring = require("querystring"); 
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://crypto-sintaa.vercel.app";

// =========================================================================
// 🛡️ BUKU PINTAR V3.4 (ANTI-WHIPSAW & HARD COOLDOWN)
// Diperbarui: In-Memory Cooldown Mutlak 2 Jam, Anti-FOMO Buy Strikes,
// Stabilizer RSI (60 Ticks), dan Perpanjangan SL Guard.
// =========================================================================
const AUTO_TRADE_ENABLED = true;
const CAPITAL_PER_TRADE = 1000000; // Eksekusi Rp 1.000.000 per posisi
// =========================================================================

app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: FRONTEND_URL, 
    methods: ["GET", "POST", "DELETE"],
    credentials: true
  }, 
  transports: ["websocket", "polling"]
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('⚠️ Koneksi Database bermasalah secara tidak terduga:', err);
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id SERIAL PRIMARY KEY,
        pair TEXT NOT NULL,
        entry_price FLOAT DEFAULT 0,
        amount FLOAT DEFAULT 0,
        pnl FLOAT DEFAULT 0,
        status TEXT DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT NOW(),
        closed_at TIMESTAMP, 
        target_tp FLOAT DEFAULT 0,
        target_sl FLOAT DEFAULT 0,
        news_headline TEXT,
        news_impact TEXT,
        initial_capital FLOAT DEFAULT 0
      );
    `);
    
    await pool.query(`
      ALTER TABLE portfolio_positions 
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        pair TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ Database System & Auto-Migration V3.4 Berhasil Dijalankan!");
  } catch (err) {
    console.error("❌ Gagal Menginisialisasi Database:", err.message);
  }
}
initDB();

const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0, isFetching: false };

// Memori Bot (SOP V3.4)
let prevDataCache = {}; 
let tickHistory = {}; 
let sl_strikes = {}; 
let isExecutingTrade = {}; 

// [NEW V3.4] Pertahanan Ekstra terhadap Whipsaw & FOMO
let activeCooldowns = {}; // Hard-Cooldown di RAM agar tidak tembus bug timezone DB
let buy_strikes = {}; // Wajib stabil 4x strike sebelum beli

let latestMarketData = {
  btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data...", newsList: [] },
  stats: { bullPct: 50, bearPct: 50, health: "NEUTRAL" },
  top: [],
  portfolio: [],
  watchlist: []
};

function exactNum(num) {
  return Number(num).toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 10 });
}

function calculateRSI(historyArray) {
  if (!historyArray || historyArray.length < 2) return 50;
  let gains = 0, losses = 0;
  for(let i = 1; i < historyArray.length; i++) {
     let diff = historyArray[i] - historyArray[i-1];
     if (diff > 0) gains += diff;
     else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  return 100 - (100 / (1 + (gains / (losses === 0 ? 1 : losses))));
}

async function getIndodaxCoinBalance(coinName = 'idr') {
  const apiKey = process.env.INDODAX_API_KEY;
  const secretKey = process.env.INDODAX_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("API/Secret Key belum disetel");

  const data = { method: 'getInfo', timestamp: Date.now() };
  const postData = querystring.stringify(data);
  const signature = crypto.createHmac('sha512', secretKey).update(postData).digest('hex');

  const response = await axios.post('https://indodax.com/tapi', postData, {
    headers: { 'Key': apiKey, 'Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 5000
  });
  
  if (response.data.success === 1) {
    return parseFloat(response.data.return.balance[coinName] || 0);
  } else {
    throw new Error(response.data.error);
  }
}

async function executeIndodaxTrade(pair, type, price, amount, isRetry = false) {
  const apiKey = process.env.INDODAX_API_KEY;
  const secretKey = process.env.INDODAX_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("API/Secret Key belum diatur di .env");

  const coinName = pair.split('_')[0];
  let finalAmount = amount;

  if (type === 'sell' && !isRetry) {
    try {
      const realBalance = await getIndodaxCoinBalance(coinName);
      if (realBalance < finalAmount) {
         console.log(`⚠️ Saldo riil ${coinName} (${realBalance}) lebih kecil dari target (${finalAmount}). Kalibrasi otomatis...`);
         finalAmount = realBalance; 
      }
      if (finalAmount <= 0) {
         throw new Error(`Ditolak sistem: Saldo riil ${coinName} kosong.`);
      }
    } catch(e) {
      console.log(`Peringatan sinkronisasi saldo: ${e.message}`);
    }
  }

  const exactPrice = exactNum(price); 

  const data = { method: 'trade', timestamp: Date.now(), pair: pair, type: type, price: exactPrice };
  
  if (type === 'buy') {
    data['idr'] = exactNum(finalAmount); 
  } else if (type === 'sell') {
    let safeAmount = isRetry ? Math.floor(finalAmount) : finalAmount;
    data[coinName] = exactNum(safeAmount); 
  }

  const postData = querystring.stringify(data);
  const signature = crypto.createHmac('sha512', secretKey).update(postData).digest('hex');

  try {
    const response = await axios.post('https://indodax.com/tapi', postData, {
      headers: { 'Key': apiKey, 'Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
    });
    if (response.data.success === 1) {
      console.log(`✅ INSTANT KILL/BUY: [${type.toUpperCase()}] ${pair} sukses dieksekusi di harga Rp${exactPrice}!`);
      return response.data;
    } else {
      throw new Error(`Ditolak Indodax: ${response.data.error}`);
    }
  } catch (error) {
    if (!isRetry && type === 'sell' && error.message && error.message.includes("amount can't be in decimal")) {
      console.log(`⚠️ Peringatan Desimal Indodax tertangkap pada ${pair}. Membulatkan angka ke bawah dan menembak ulang (Auto-Fix)...`);
      return await executeIndodaxTrade(pair, type, price, amount, true); 
    }
    throw error;
  }
}

async function updateMarket() {
  const now = Date.now();
  if (now - cache.lastUpdate < 5000 || cache.isFetching) return; 

  cache.isFetching = true;
  try {
    const res = await axios.get(`${BASE}/tickers`, { timeout: 5000 });
    if (res.data && res.data.tickers) {
      cache.tickers = res.data.tickers;
      cache.lastUpdate = Date.now();

      const btc = cache.tickers["btc_idr"];
      if (btc) {
        const price = parseFloat(btc.last);
        const change = btc.change ? parseFloat(btc.change) : 0;
        let bias = "SIDEWAYS";
        let news = "⚖️ BTC Konsolidasi. Aliran dana condong masuk ke Altcoin.";

        if (change <= -3.0) {
          bias = "BEARISH";
          news = `⚠️ BADAI BTC! Bitcoin turun tajam (${change.toFixed(2)}%). Filter Anti-Badai aktif. Pembelian dihentikan.`;
        } else if (change >= 2.0) {
          bias = "BULLISH";
          news = `🚀 BTC BULLISH (${change.toFixed(2)}%). Momentum pasar sangat sehat untuk Sniper.`;
        }
        latestMarketData.btc = { price, change, bias, news, newsList: [] };
      }
    }
  } catch (error) {
    console.error("⚠️ Gagal mengambil data market:", error.message);
  } finally {
    cache.isFetching = false;
  }
}

function analyzeCoin(t, pairName, btcChange) {
  const price = parseFloat(t.last || 0);
  const bidPrice = parseFloat(t.buy || price); 
  const askPrice = parseFloat(t.sell || price); 
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  
  if (!price || high === low) return null;

  const spread = ((askPrice - bidPrice) / bidPrice) * 100;
  const vwap = (high + low + askPrice) / 3;

  if (!tickHistory[pairName]) tickHistory[pairName] = [];
  tickHistory[pairName].push(askPrice);
  
  // [FIX V3.4] Diperpanjang menjadi 60 Tick (~5 Menit) agar indikator tidak tertipu fake-pump 1 menit
  if (tickHistory[pairName].length > 60) tickHistory[pairName].shift(); 
  
  let microRsi = calculateRSI(tickHistory[pairName]);

  const prevVol = prevDataCache[pairName]?.vol || vol;
  const prevAsk = prevDataCache[pairName]?.ask || askPrice;
  const vpa = (vol - prevVol) * (askPrice - prevAsk);
  
  prevDataCache[pairName] = { vol, ask: askPrice }; 

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  let dailyRange = high - low;
  if (dailyRange <= 0) dailyRange = price * 0.05;

  let rejectReason = null;
  const maxRoomToBreathe = low + (0.8 * dailyRange);

  if (btcChange < -3.0) rejectReason = "Ditolak: Terkena Badai BTC (-3% Drop)";
  else if (vol < 2000000000) rejectReason = "Ditolak: Koin Sepi (Vol < 2M IDR)";
  else if (spread > 1.5) rejectReason = `Ditolak: Spread Lebar (${spread.toFixed(2)}%)`;
  else if (askPrice < vwap) rejectReason = "Ditolak: Harga di Bawah Rata-Rata (VWAP)";
  else if (askPrice > maxRoomToBreathe) rejectReason = "Ditolak: Koin Berada di Pucuk / FOMO";
  else if (microRsi < 45 || microRsi > 72) rejectReason = `Ditolak: Micro-RSI Tidak Sehat (${microRsi.toFixed(1)})`;
  else if (vpa <= 0) rejectReason = "Ditolak: VPA Negatif (Paus Sedang Distribusi/Buang Barang)";

  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  let score = (whale_score * 2) + momentum_score;
  
  let base_tp_pct = 0.05; 
  let base_sl_pct = 0.08; 
  
  if (btcChange >= 2.0) {
      base_sl_pct = 0.12; 
      base_tp_pct = 0.08; 
  } else if (btcChange <= -1.0) {
      base_sl_pct = 0.06; 
  }

  let target_tp = askPrice * (1 + base_tp_pct); 
  let target_sl = askPrice * (1 - base_sl_pct); 
  const rrr = ((target_tp - askPrice) / (askPrice - target_sl || 1)).toFixed(1);

  let signal = "HOLD";
  let news_headline = rejectReason || "Koin bergerak wajar di bawah standar Sniper.";
  let watch_status = "KONSOLIDASI";

  if (!rejectReason) {
     signal = "🔥 WHALE SNIPER"; 
     news_headline = "🎯 CEKLIS V3.4 TERPENUHI! VPA Positif & RSI Sehat. Paus terdeteksi mengakumulasi koin ini!";
     watch_status = "SIAP DITEMBAK";
  }

  return { 
    price: askPrice, bid: bidPrice, high, low, vol, change, score, signal, 
    news_headline, news_impact: rejectReason ? "NEUTRAL" : "BULLISH", 
    capital_advice: signal === "🔥 WHALE SNIPER" ? "ALL-IN / SNIPER READY!" : "Jangan Masuk.", 
    rrr, watch_status, watch_desc: rejectReason || "Memenuhi syarat Kalkulus Mikro.",
    target_tp: parseFloat(target_tp.toFixed(4)), target_sl: parseFloat(target_sl.toFixed(4)),
    technicals: { buying_pressure: parseFloat(microRsi.toFixed(0)), volatility: spread, vpa }
  };
}

app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    const rows = result.rows.map(p => {
      const t = cache.tickers[p.pair];
      const current_bid = t ? parseFloat(t.buy || t.last) : p.entry_price;
      const livePnlPct = ((current_bid - p.entry_price) / p.entry_price) * 100;
      return { ...p, current_price: current_bid, pnl_pct: livePnlPct };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat portofolio" });
  }
});

app.post("/buy", async (req, res) => {
  const { pair, entry_price, capital, high, low, news_headline, news_impact } = req.body;
  try {
    const amount = capital / entry_price; 
    await executeIndodaxTrade(pair, 'buy', entry_price, capital);
    
    let final_tp = entry_price * 1.05;
    let final_sl = entry_price * 0.92;

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
      [pair, entry_price, amount, final_tp, final_sl, news_headline, news_impact, capital]
    );
    res.json({ success: true, message: `Beli Manual Sukses!` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  try {
    const position = await pool.query("SELECT * FROM portfolio_positions WHERE id=$1 AND status='OPEN'", [id]);
    if (position.rows.length === 0) throw new Error("Posisi tidak ditemukan.");
    const p = position.rows[0];
    const t = cache.tickers[p.pair];
    
    await executeIndodaxTrade(p.pair, 'sell', parseFloat(t.buy || t.last), p.amount);
    await pool.query("UPDATE portfolio_positions SET status='CLOSED_MANUAL', closed_at=NOW() WHERE id=$1 AND pair=$2", [id, p.pair]);
    
    // [FIX V3.4] Mencegah pembelian ulang otomatis setelah jual manual
    activeCooldowns[p.pair] = Date.now() + (2 * 60 * 60 * 1000); 

    res.json({ success: true, message: "Manual Kill Sukses." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/watchlist", async (req, res) => {
  const { pair } = req.body;
  try {
    await pool.query("INSERT INTO watchlist (pair) VALUES ($1) ON CONFLICT DO NOTHING", [pair]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Gagal" }); }
});

app.delete("/watchlist/:pair", async (req, res) => {
  try {
    await pool.query("DELETE FROM watchlist WHERE pair = $1", [req.params.pair]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Gagal" }); }
});

let isWorkerRunning = false;
async function streamWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    await updateMarket();
    const tickers = cache.tickers;
    if (Object.keys(tickers).length === 0) return;

    const watchData = await pool.query("SELECT pair FROM watchlist");
    const watchPairs = watchData.rows.map(row => row.pair);
    const results = [];
    
    const btcChange = latestMarketData.btc.change;

    Object.keys(tickers).forEach((k) => {
      if (k === "btc_idr") return; 
      const r = analyzeCoin(tickers[k], k, btcChange);
      if (r) results.push({ pair: k, isWatched: watchPairs.includes(k), ...r });
    });

    // [FIX V3.4] Reset buy strikes untuk koin yang sinyalnya sudah hilang
    for (let key in buy_strikes) {
       const stillValid = results.find(r => r.pair === key && r.signal === "🔥 WHALE SNIPER");
       if (!stillValid) delete buy_strikes[key];
    }

    const top = results.sort((a, b) => b.score - a.score).slice(0, 20);
    const watchlistData = results.filter(r => watchPairs.includes(r.pair));

    const openPositions = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    const portfolioData = [];
    
    for (const p of openPositions.rows) {
      const t = tickers[p.pair];
      let current_bid = p.entry_price;
      let pnl = p.pnl;
      let attention_needed = false;
      let attention_reason = "";
      
      if (t) {
        current_bid = parseFloat(t.buy || t.last); 
        pnl = (current_bid - p.entry_price) * p.amount;
        
        const livePnlPct = ((current_bid - p.entry_price) / p.entry_price) * 100;
        let virtual_sl = p.target_sl;
        
        if (livePnlPct >= 4.0) {
           const breakEvenLock = p.entry_price * 1.015; 
           const trailingStop = current_bid * 0.96; 
           
           virtual_sl = Math.max(p.target_sl, breakEvenLock, trailingStop); 
           
           if (virtual_sl > p.target_sl) {
             console.log(`🔒 TRUE TRAILING AKTIF: ${p.pair} SL Naik ke${exactNum(virtual_sl)}`);
             await pool.query("UPDATE portfolio_positions SET target_sl=$1 WHERE id=$2 AND pair=$3", [virtual_sl, p.id, p.pair]);
             p.target_sl = virtual_sl;
             attention_needed = true;
             attention_reason = `🚀 RISK-FREE! SL Terkunci di Area Profit (+${((virtual_sl - p.entry_price)/p.entry_price*100).toFixed(1)}%).`;
           }
        } else if (livePnlPct < 0) {
           attention_needed = true;
           attention_reason = "⚠️ Menahan guncangan harga. Menunggu momentum pantulan.";
        }

        pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]).catch(e => console.error(e));

        if (AUTO_TRADE_ENABLED && !isExecutingTrade[`sell_${p.id}`]) {
          
          if (current_bid >= p.target_tp) {
            if (livePnlPct < 1.5) {
                console.log(`⏳ Menahan Jual TP untuk ${p.pair}, profit bersih masih di bawah 1.5%`);
            } else {
                isExecutingTrade[`sell_${p.id}`] = true;
                try {
                  console.log(`🤖 INSTANT KILL (TP) TRIGGERED untuk ${p.pair} di harga BID${exactNum(current_bid)}`);
                  await executeIndodaxTrade(p.pair, 'sell', current_bid, p.amount);
                  await pool.query("UPDATE portfolio_positions SET status='CLOSED_TP', pnl=$1, closed_at=NOW() WHERE id=$2 AND pair=$3", [pnl, p.id, p.pair]);
                  
                  activeCooldowns[p.pair] = Date.now() + (2 * 60 * 60 * 1000); // 2 Jam Cooldown
                } catch (err) {
                  console.error(`Gagal Instant Kill TP ${p.pair}:`, err.message);
                } finally {
                  delete isExecutingTrade[`sell_${p.id}`];
                }
            }
          }
          
          else if (current_bid <= p.target_sl) {
             const currentRSI = tickHistory[p.pair] ? calculateRSI(tickHistory[p.pair]) : 50;

             if (currentRSI < 35 && btcChange > -3.0) {
                 attention_needed = true;
                 attention_reason = `🛡️ ELASTIC SL AKTIF: Harga menyentuh SL tapi RSI Ekstrem Oversold (${currentRSI.toFixed(0)}). Menunda Cut-Loss menunggu pantulan!`;
                 console.log(attention_reason);
                 if (sl_strikes[p.id]) delete sl_strikes[p.id]; 
             } 
             else {
                 if (!sl_strikes[p.id]) sl_strikes[p.id] = 1;
                 else sl_strikes[p.id]++;

                 // [FIX V3.4] Mengubah konfirmasi dari 3 menjadi 5 (~25 detik konfirmasi nyungsep)
                 if (sl_strikes[p.id] >= 5) { 
                     isExecutingTrade[`sell_${p.id}`] = true;
                     try {
                         console.log(`❌ SL CONFIRMED: ${p.pair} tetap di bawah SL. Whipsaw Guard dilewati. Eksekusi Cut Loss di BID ${exactNum(current_bid)}`);
                         await executeIndodaxTrade(p.pair, 'sell', current_bid, p.amount);
                         await pool.query("UPDATE portfolio_positions SET status='CLOSED_SL', pnl=$1, closed_at=NOW() WHERE id=$2 AND pair=$3", [pnl, p.id, p.pair]);
                         
                         // [FIX V3.4] RAM Hard-Cooldown agar tidak beli lagi setelah jatuh (Re-buy bug fixed)
                         activeCooldowns[p.pair] = Date.now() + (2 * 60 * 60 * 1000); 
                     } catch (err) {
                         console.error(`Gagal Instant Kill SL ${p.pair}:`, err.message);
                     } finally {
                         delete isExecutingTrade[`sell_${p.id}`];
                         delete sl_strikes[p.id];
                     }
                 } else {
                     attention_needed = true;
                     attention_reason = `⚠️ Peringatan SL Strike ${sl_strikes[p.id]}/5: Mengonfirmasi apakah ini gocekan bandar...`;
                     console.log(attention_reason);
                 }
             }
          } 
          else {
              if (sl_strikes[p.id]) {
                  console.log(`✅ ${p.pair} lolos dari gocekan! Harga kembali naik di atas SL. Strike direset.`);
                  delete sl_strikes[p.id];
              }
          }
        }
      }
      portfolioData.push({ ...p, current_price: current_bid, pnl, pnl_pct: ((current_bid - p.entry_price) / p.entry_price) * 100, attention_needed, attention_reason });
    }

    if (AUTO_TRADE_ENABLED) {
      const activePairs = openPositions.rows.map(p => p.pair);
      const recentTrades = await pool.query("SELECT pair FROM portfolio_positions WHERE status LIKE 'CLOSED%' AND closed_at >= NOW() - INTERVAL '2 hours'");
      const cooldownPairs = recentTrades.rows.map(r => r.pair);
      
      const bestCoin = results.find(r => 
        r.signal === "🔥 WHALE SNIPER" && 
        !activePairs.includes(r.pair) && 
        !cooldownPairs.includes(r.pair) && 
        (!activeCooldowns[r.pair] || activeCooldowns[r.pair] <= Date.now()) && // [FIX V3.4] Pengecekan in-memory RAM
        !isExecutingTrade[`buy_${r.pair}`]
      );
      
      if (bestCoin) {
        // [FIX V3.4] Anti-FOMO Buy Strikes (Harus tahan di atas 4 tick = 20 Detik konfirmasi aman)
        if (!buy_strikes[bestCoin.pair]) buy_strikes[bestCoin.pair] = 1;
        else buy_strikes[bestCoin.pair]++;

        if (buy_strikes[bestCoin.pair] >= 4) {
          let availableIDR = 0;
          try { availableIDR = await getIndodaxCoinBalance('idr'); } catch (e) {}

          if (availableIDR >= CAPITAL_PER_TRADE) {
            isExecutingTrade[`buy_${bestCoin.pair}`] = true;
            try {
              console.log(`🤖 SILENT SNIPER TRIGGERED! Tren dikonfirmasi stabil. Menembak ${bestCoin.pair} di harga ASK Murni${exactNum(bestCoin.price)}...`);
              const amount = CAPITAL_PER_TRADE / bestCoin.price;

              await executeIndodaxTrade(bestCoin.pair, 'buy', bestCoin.price, CAPITAL_PER_TRADE);
              
              await pool.query(
                `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
                [bestCoin.pair, bestCoin.price, amount, bestCoin.target_tp, bestCoin.target_sl, bestCoin.news_headline, bestCoin.news_impact, CAPITAL_PER_TRADE]
              );
            } catch (err) {
              console.error(`Gagal Sniper Beli ${bestCoin.pair}:`, err.message);
            } finally {
              delete isExecutingTrade[`buy_${bestCoin.pair}`];
              delete buy_strikes[bestCoin.pair]; // Reset setelah sukses beli
            }
          }
        } else {
            console.log(`⏳ [ANTI-FOMO] Menunggu kestabilan tren ${bestCoin.pair} sebelum beli - Strike${buy_strikes[bestCoin.pair]}/4`);
        }
      }
    }

    latestMarketData.top = top;
    latestMarketData.portfolio = portfolioData;
    latestMarketData.watchlist = watchlistData;
    
    const bullsCount = top.filter(c => c.change > 0).length;
    latestMarketData.stats = { 
      bullPct: Math.round((bullsCount / (top.length || 1)) * 100), 
      bearPct: 100 - Math.round((bullsCount / (top.length || 1)) * 100), 
      health: btcChange < -3.0 ? "BEARISH (BADAI BTC)" : "BULLISH (OPTIMIS TINGGI)" 
    };

    io.emit("market_data", latestMarketData);
  } catch (e) {
    console.error("⚠️ Kesalahan Sinkronisasi Live Stream:", e.message);
  } finally {
    isWorkerRunning = false;
  }
}

streamWorker();
setInterval(streamWorker, 5000); 

io.on("connection", (socket) => {
  socket.emit("market_data", latestMarketData);
});

server.listen(PORT, () => console.log(`🚀 QUANT ENGINE V3.4 (ANTI-WHIPSAW) ONLINE - PORT ${PORT}`));
