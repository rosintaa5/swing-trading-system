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
// 💎 BUKU PINTAR V3.4 (DIAMOND HANDS & INFINITE TRAILING)
// Solusi Mutlak Anti-Whipsaw (Stop Hunt) & Mengejar Profit Pucuk Tanpa Batas
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
    console.log("✅ Database System V3.4 Berhasil Dijalankan!");
  } catch (err) {
    console.error("❌ Gagal Menginisialisasi Database:", err.message);
  }
}
initDB();

const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0, isFetching: false };

let prevDataCache = {}; 
let tickHistory = {}; 
let latestMarketData = {
  btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data...", newsList: [] },
  stats: { bullPct: 50, bearPct: 50, health: "NEUTRAL" },
  top: [],
  portfolio: [],
  watchlist: []
};

let isExecutingTrade = {}; 

function exactNum(num) {
  return Number(num).toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 10 });
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
  
  if (response.data.success === 1) return parseFloat(response.data.return.balance[coinName] || 0);
  throw new Error(response.data.error);
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
         console.log(`⚠️ Saldo riil ${coinName} (${realBalance}) lebih kecil dari target. Kalibrasi...`);
         finalAmount = realBalance; 
      }
      if (finalAmount <= 0) throw new Error(`Ditolak sistem: Saldo riil ${coinName} kosong.`);
    } catch(e) { console.log(`Peringatan sinkronisasi: ${e.message}`); }
  }

  const exactPrice = exactNum(price); 
  const data = { method: 'trade', timestamp: Date.now(), pair: pair, type: type, price: exactPrice };
  
  if (type === 'buy') data['idr'] = exactNum(finalAmount); 
  else if (type === 'sell') data[coinName] = exactNum(isRetry ? Math.floor(finalAmount) : finalAmount); 

  const postData = querystring.stringify(data);
  const signature = crypto.createHmac('sha512', secretKey).update(postData).digest('hex');

  try {
    const response = await axios.post('https://indodax.com/tapi', postData, {
      headers: { 'Key': apiKey, 'Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
    });
    if (response.data.success === 1) {
      console.log(`✅ INSTANT KILL/BUY: [${type.toUpperCase()}] ${pair} sukses dieksekusi di harga Rp ${exactPrice}!`);
      return response.data;
    } else {
      throw new Error(`Ditolak Indodax: ${response.data.error}`);
    }
  } catch (error) {
    if (!isRetry && type === 'sell' && error.message && error.message.includes("amount can't be in decimal")) {
      console.log(`⚠️ Peringatan Desimal Indodax tertangkap pada ${pair}. Auto-Fix membulatkan ke bawah...`);
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
          news = `⚠️ BADAI BTC! Bitcoin turun tajam. Market penuh risiko.`;
        } else if (change >= 2.0) {
          bias = "BULLISH";
          news = `🚀 BTC BULLISH (${change.toFixed(2)}%). Altcoin Party Siap Dimulai.`;
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

// =========================================================================
// 🧮 RUMUS KALKULUS MIKRO V3.4 (DIAMOND HANDS - KALIBRASI VOL 3M)
// =========================================================================
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
  if (tickHistory[pairName].length > 36) tickHistory[pairName].shift(); 
  
  let gains = 0, losses = 0;
  for(let i = 1; i < tickHistory[pairName].length; i++) {
     let diff = tickHistory[pairName][i] - tickHistory[pairName][i-1];
     if (diff > 0) gains += diff;
     else losses -= diff;
  }
  let microRsi = 50; 
  if (gains + losses > 0) microRsi = 100 - (100 / (1 + (gains / (losses === 0 ? 1 : losses))));

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
  else if (vol < 3000000000) rejectReason = "Ditolak: Likuiditas Rendah (Vol < 3M IDR)"; 
  else if (spread > 1.2) rejectReason = `Ditolak: Spread Lebar (${spread.toFixed(2)}%)`; 
  else if (askPrice < vwap) rejectReason = "Ditolak: Harga di Bawah Rata-Rata (VWAP)";
  else if (askPrice > vwap * 1.03) rejectReason = "Ditolak: Anti-FOMO. Harga sudah menjauh >3% dari VWAP."; 
  else if (askPrice > maxRoomToBreathe) rejectReason = "Ditolak: Koin Berada di Pucuk Area Resistance";
  else if (microRsi < 40 || microRsi > 70) rejectReason = `Ditolak: Micro-RSI Tidak Ideal (${microRsi.toFixed(1)})`; 
  else if (vpa <= 0) rejectReason = "Ditolak: VPA Negatif (Distribusi Paus)";

  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  let score = (whale_score * 2) + momentum_score;
  
  // 🛡️ V3.4: SL Elastis & TP Dinamis Awal
  let target_tp = askPrice * 1.04; // Trigger awal untuk menarik SL (Bukan dijual)
  let target_sl = askPrice * 0.85; // RUANG NAPAS 15%! Anti-Whipsaw (Goyangan Bandar)
  
  let signal = "HOLD";
  let news_headline = rejectReason || "Koin bergerak wajar di bawah standar Sniper.";
  let watch_status = "KONSOLIDASI";

  if (!rejectReason) {
     signal = "🔥 WHALE SNIPER"; 
     news_headline = "🎯 KUNCI TARGET V3.4! Volume mantap, siap terbang. Hold kuat!";
     watch_status = "SIAP DITEMBAK";
  }

  return { 
    price: askPrice, bid: bidPrice, high, low, vol, change, score, signal, 
    news_headline, news_impact: rejectReason ? "NEUTRAL" : "BULLISH", 
    capital_advice: signal === "🔥 WHALE SNIPER" ? "ALL-IN / SNIPER READY!" : "Jangan Masuk.", 
    rrr: "INFINITE", watch_status, watch_desc: rejectReason || "Memenuhi syarat Kalkulus Mikro.",
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
  const { pair, entry_price, capital, news_headline, news_impact } = req.body;
  try {
    const amount = capital / entry_price; 
    await executeIndodaxTrade(pair, 'buy', entry_price, capital);
    
    let final_tp = entry_price * 1.04;
    let final_sl = entry_price * 0.85; // Toleransi drop 15% di awal

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
      [pair, entry_price, amount, final_tp, final_sl, news_headline, news_impact, capital]
    );
    res.json({ success: true, message: `Beli Manual Sukses! Ruang Napas SL Aktif.` });
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

// =========================================================================
// 🚀 SILENT WATCHER LOOP V3.4 (DIAMOND HANDS EXECUTION)
// =========================================================================
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

    const top = results.sort((a, b) => b.score - a.score).slice(0, 20);
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
        
        let virtual_tp = p.target_tp;
        let virtual_sl = p.target_sl;

        // 💎 DIAMOND HANDS & INFINITE TRAILING LOGIC
        if (current_bid >= p.target_tp) {
            // JANGAN JUAL! PUSH TP LEBIH TINGGI & KUNCI SL DI AREA PROFIT
            const new_tp = current_bid * 1.05; // Dorong TP 5% di atas harga sekarang
            const new_sl = current_bid * 0.96; // Tarik SL ketat 4% di bawah harga sekarang
            
            if (new_sl > p.target_sl) {
               console.log(`💎 INFINITE TRAILING: ${p.pair} TP Naik ke ${exactNum(new_tp)}. Profit SL terkunci di ${exactNum(new_sl)}`);
               await pool.query("UPDATE portfolio_positions SET target_tp=$1, target_sl=$2 WHERE id=$3 AND pair=$4", [new_tp, new_sl, p.id, p.pair]);
               virtual_tp = new_tp;
               virtual_sl = new_sl;
               attention_needed = true;
               attention_reason = `🚀 DIAMOND HANDS! Mengikuti roket naik. Profit terkunci aman.`;
            }
        } else if (livePnlPct >= 2.0 && p.target_sl < p.entry_price) {
            // Kunci modal secepatnya jika profit sudah +2% tapi belum sentuh TP
            const be_lock = p.entry_price * 1.005; // Lock tipis di atas modal (Bayar fee)
            if (be_lock > p.target_sl) {
               await pool.query("UPDATE portfolio_positions SET target_sl=$1 WHERE id=$2", [be_lock, p.id]);
               virtual_sl = be_lock;
               attention_needed = true;
               attention_reason = `🔒 MODAL AMAN! SL dinaikkan ke titik Impas.`;
            }
        } else if (livePnlPct < 0) {
           attention_needed = true;
           attention_reason = `🛡️ Sabar. Stop Loss Elastis (Batas bawah: Rp ${exactNum(virtual_sl)}) sedang menahan gocekan bandar.`;
        }

        pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]).catch(e => console.error(e));

        // ⚡ EKSEKUSI HANYA JIKA TERKENA SL (Bisa SL Loss, bisa SL Profit/Trailing)
        if (AUTO_TRADE_ENABLED && !isExecutingTrade[`sell_${p.id}`]) {
          if (current_bid <= virtual_sl) {
             isExecutingTrade[`sell_${p.id}`] = true;
             try {
                console.log(`🤖 CUT / TAKE PROFIT TRIGGERED: ${p.pair} menyentuh garis bawah di BID ${exactNum(current_bid)}`);
                await executeIndodaxTrade(p.pair, 'sell', current_bid, p.amount);
                const statusClose = current_bid >= p.entry_price ? 'CLOSED_TP' : 'CLOSED_SL';
                await pool.query("UPDATE portfolio_positions SET status=$1, pnl=$2, closed_at=NOW() WHERE id=$3 AND pair=$4", [statusClose, pnl, p.id, p.pair]);
             } catch (err) {
                console.error(`Gagal Auto-Sell ${p.pair}:`, err.message);
             } finally {
                delete isExecutingTrade[`sell_${p.id}`];
             }
          }
        }

        p.target_tp = virtual_tp;
        p.target_sl = virtual_sl;
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
        !isExecutingTrade[`buy_${r.pair}`]
      );
      
      if (bestCoin) {
        let availableIDR = 0;
        try { availableIDR = await getIndodaxCoinBalance('idr'); } catch (e) {}

        if (availableIDR >= CAPITAL_PER_TRADE) {
          isExecutingTrade[`buy_${bestCoin.pair}`] = true;
          try {
            console.log(`🤖 SILENT SNIPER Beli ${bestCoin.pair} di harga ASK Murni ${exactNum(bestCoin.price)}...`);
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
          }
        }
      }
    }

    latestMarketData.top = top;
    latestMarketData.portfolio = portfolioData;
    latestMarketData.watchlist = results.filter(r => watchPairs.includes(r.pair));
    
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

io.on("connection", (socket) => socket.emit("market_data", latestMarketData));

server.listen(PORT, () => console.log(`🚀 QUANT ENGINE V3.4 (DIAMOND HANDS) ONLINE - PORT ${PORT}`));
