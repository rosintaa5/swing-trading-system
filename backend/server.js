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
// 🤖 KONFIGURASI BOT AUTO-PILOT (AGRESIF) 🤖
// =========================================================================
const AUTO_TRADE_ENABLED = true; // Ubah ke 'false' jika ingin manual saja
const CAPITAL_PER_TRADE = 100000; // Modal otomatis per koin (contoh: Rp 20.000)
// =========================================================================

// Middleware & Security CORS
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

// Koneksi PostgreSQL Pool
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

// --- AUTO MIGRATION SYSTEM ---
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
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        pair TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS target_tp FLOAT DEFAULT 0;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS target_sl FLOAT DEFAULT 0;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS news_headline TEXT;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS news_impact TEXT;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS initial_capital FLOAT DEFAULT 0;`);
    
    console.log("✅ Database System & Auto-Migration Berhasil Dijalankan!");
  } catch (err) {
    console.error("❌ Gagal Menginisialisasi Database:", err.message);
  }
}
initDB();

const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0, isFetching: false };

let latestMarketData = {
  btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data...", newsList: [] },
  stats: { bullPct: 50, bearPct: 50, health: "NEUTRAL" },
  top: [],
  portfolio: [],
  watchlist: []
};

let isExecutingTrade = {}; 

// --- FUNGSI BARU: CEK SALDO IDR INDODAX SECARA LIVE ---
async function getIndodaxBalance() {
  const apiKey = process.env.INDODAX_API_KEY;
  const secretKey = process.env.INDODAX_SECRET_KEY;
  if (!apiKey || !secretKey) return 0;

  const data = { method: 'getInfo', timestamp: Date.now() };
  const postData = querystring.stringify(data);
  const signature = crypto.createHmac('sha512', secretKey).update(postData).digest('hex');

  try {
    const response = await axios.post('https://indodax.com/tapi', postData, {
      headers: { 'Key': apiKey, 'Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000
    });
    if (response.data.success === 1) {
      return parseFloat(response.data.return.balance.idr || 0);
    }
  } catch (error) {
    console.error("⚠️ Gagal mengecek saldo Indodax:", error.message);
  }
  return 0;
}

// --- MESIN EKSEKUSI INDODAX PRIVATE API (SMART EXECUTION & AUTO-RETRY) ---
async function executeIndodaxTrade(pair, type, price, amount, isRetry = false) {
  const apiKey = process.env.INDODAX_API_KEY;
  const secretKey = process.env.INDODAX_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("API/Secret Key belum diatur di .env");

  const data = { method: 'trade', timestamp: Date.now(), pair: pair, type: type, price: price };
  if (type === 'buy') data['idr'] = amount; 
  else if (type === 'sell') {
    // PROTEKSI: Jika ini adalah tembakan ulang (retry), potong habis desimalnya.
    data[pair.split('_')[0]] = isRetry ? Math.floor(amount) : amount;
  }

  const postData = querystring.stringify(data);
  const signature = crypto.createHmac('sha512', secretKey).update(postData).digest('hex');

  try {
    const response = await axios.post('https://indodax.com/tapi', postData, {
      headers: { 'Key': apiKey, 'Sign': signature, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
    });
    if (response.data.success === 1) {
      console.log(`✅ AUTO-TRADE: [${type.toUpperCase()}] ${pair} sukses dieksekusi di bursa!`);
      return response.data;
    } else {
      throw new Error(`Ditolak Indodax: ${response.data.error}`);
    }
  } catch (error) {
    // 🧠 SISTEM AUTO-RETRY ANTI-GAGAL
    if (!isRetry && type === 'sell' && error.message && error.message.includes("amount can't be in decimal")) {
      console.log(`⚠️ Peringatan Desimal Indodax tertangkap pada ${pair}. Membulatkan angka dan menembak ulang...`);
      return await executeIndodaxTrade(pair, type, price, amount, true); // Tembak ulang!
    }
    throw error;
  }
}

// --- GLOBAL MARKET INTELLIGENCE (BTC TRACKER) ---
async function updateMarket() {
  const now = Date.now();
  if (now - cache.lastUpdate < 5000 || cache.isFetching) return; // Dipercepat 5 detik!

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
        let news = "⚖️ Hati-hati, pergerakan BTC terpantau sideways/konsolidasi. Aliran dana condong masuk ke Altcoin potensial. Selektif memilih koin!";

        if (change <= -2.0) {
          bias = "BEARISH";
          news = `⚠️ AWAS! BTC sedang ambruk (${change.toFixed(2)}%). Seluruh pasar berisiko terseret. Amankan profit atau ketatkan Stop Loss!`;
        } else if (change >= 2.0) {
          bias = "BULLISH";
          news = `🚀 LUAR BIASA! BTC terbang tinggi (${change.toFixed(2)}%). Tren pasar sangat sehat. Momentum terbaik untuk breakout koin pilihan!`;
        }
        
        const newsList = [
          { time: new Date().toLocaleTimeString('id-ID'), title: change >= 0 ? "Analisis Algoritma: Terjadi peningkatan aktivitas dompet institusi (Whale) di pasar Spot." : "Peringatan Makro: Arus keluar dana raksasa (Outflow) menekan batas support psikologis pasar.", impact: bias },
          { time: new Date(Date.now() - 1200000).toLocaleTimeString('id-ID'), title: change > 3.0 ? "FOMO Retail mulai memuncak. Tetap waspada terhadap titik Overbought (Jenuh Beli)." : change < -3.0 ? "Kepanikan pasar (Panic Selling) memicu rentetan likuidasi massal di derivatif." : "Aliran dana perlahan berotasi dari Bitcoin menuju aset koin kapitalisasi menengah (Mid-Cap).", impact: bias === "SIDEWAYS" ? "NEUTRAL" : bias },
          { time: new Date(Date.now() - 3600000).toLocaleTimeString('id-ID'), title: "Indikator volatilitas harian (ATR) global menunjukkan pasar berada dalam fase " + (Math.abs(change) > 2 ? "EKSPANSI." : "KONSOLIDASI (Merapat)."), impact: "NEUTRAL" }
        ];

        latestMarketData.btc = { price, change, bias, news, newsList };
      }
    }
  } catch (error) {
    console.error("⚠️ Gagal mengambil data market:", error.message);
  } finally {
    cache.isFetching = false;
  }
}

// --- COIN ANALYZER ENGINE (Dengan Metode SCALPING ATR CEPAT) ---
function analyzeCoin(t, pairName, btcBias) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  
  if (!price || vol < 150000000 || high === low) return null;

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  
  let volatility = ((high - low) / low) * 100;
  if (volatility <= 0) volatility = 0.5;
  const buying_pressure = ((price - low) / (high - low)) * 100;

  // --- PERHITUNGAN SCALPING CEPAT (ATR Diperketat) ---
  let dailyRange = high - low;
  if (dailyRange <= 0) dailyRange = price * 0.05;

  const target_tp = price + (dailyRange * 0.7); // TP Sangat Cepat
  const target_sl = Math.max(0.0001, price - (dailyRange * 0.4)); // SL Sangat Ketat
  const rrr = ((target_tp - price) / (price - target_sl || 1)).toFixed(1);

  let btc_adjustment = btcBias === "BULLISH" ? 2 : btcBias === "BEARISH" ? -4 : 0;
  const score = (whale_score * 2) + momentum_score + btc_adjustment;
  let signal = score >= 17 ? "STRONG BUY" : score > 11 ? "BUY" : score < 6 ? "SELL" : "HOLD";

  let news_headline = "Pergerakan harga wajar. Keseimbangan antara pembeli dan penjual cukup stabil.";
  let news_impact = "NEUTRAL";
  let capital_advice = "Gunakan maksimal 5% dari modal portofolio Anda.";
  let watch_status = "TAHAN DULU (FASE KONSOLIDASI)";
  let watch_desc = "Koin bergerak tanpa arah tren yang jelas. Belum ideal untuk masuk dalam waktu dekat.";

  if (btcBias === "BEARISH" && score < 10) {
    news_headline = "🚨 TINGGALKAN SEKARANG! Koin ini terseret deras oleh ambruknya BTC.";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Dilarang Masuk! Risiko Likuidasi Tinggi.";
    watch_status = "HATI-HATI (RISIKO KOREKSI MASIF)";
    watch_desc = "Sangat berbahaya untuk dibeli sekarang. Tren makro sedang menghancurkan batas support.";
  } else if (score >= 17 && btcBias === "BULLISH") {
    news_headline = "🚀 PELUANG EMAS! Tekanan beli koin ini meluap. Terdeteksi akumulasi paus.";
    news_impact = "BULLISH";
    capital_advice = "Sangat disarankan: Tambah Posisi Bertahap! (Alokasi 10-15% modal)";
    watch_status = "SANGAT LAYAK ENTRY SEKARANG";
    watch_desc = "Terjadi anomali akumulasi raksasa (Whale) dan penembusan harga atas.";
  } else if (buying_pressure > 85 && change > 2) {
    news_headline = "🔥 MOMENTUM BREAKOUT! Banteng (Bulls) berhasil menguasai order book.";
    news_impact = "BULLISH";
    capital_advice = "Bagus untuk cicil beli (Dollar Cost Averaging).";
    watch_status = "BISA MULAI DICICIL (AKUMULASI)";
    watch_desc = "Tekanan beli terus meningkat tajam. Momentum positif mendominasi transaksi.";
  } else if (change < -7 || buying_pressure < 20) {
    news_headline = "⚠️ DISTRIBUSI PAUS TERDETEKSI! Investor besar sedang membuang barang.";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Amankan kas Anda. Jangan eksekusi beli di sini.";
    watch_status = "HINDARI SEMENTARA (DUMPING MASSAL)";
    watch_desc = "Aset ini sedang dijauhi institusi. Tunggu hingga harga menemukan lantai barunya.";
  } else if (rrr < 1.2 && signal === "BUY") {
    news_headline = "⚖️ Sinyal beli terdeteksi, namun rasio Reward terhadap Risiko (ATR) terlalu mepet.";
    capital_advice = "Kurangi ukuran posisi (Position Size) 50% untuk keamanan.";
  }

  return { 
    price, high, low, vol, change, score, signal, news_headline, news_impact, capital_advice, rrr,
    watch_status, watch_desc,
    target_tp: parseFloat(target_tp.toFixed(4)),
    target_sl: parseFloat(target_sl.toFixed(4)),
    technicals: { buying_pressure: parseFloat(buying_pressure.toFixed(0)), volatility: parseFloat(volatility.toFixed(2)) }
  };
}

// --- API ENDPOINTS ---
app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    const rows = result.rows.map(p => {
      const t = cache.tickers[p.pair];
      return { ...p, current_price: t ? parseFloat(t.last) : p.entry_price };
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat daftar portofolio" });
  }
});

// ROUTE BELI MANUAL (Dari UI)
app.post("/buy", async (req, res) => {
  const { pair, entry_price, capital, high, low, news_headline, news_impact } = req.body;
  if (!pair || !entry_price || isNaN(entry_price) || !capital || isNaN(capital)) {
    return res.status(400).json({ error: "Gagal validasi: Data angka cacat atau kosong." });
  }
  try {
    const numEntry = parseFloat(entry_price);
    const numHigh = parseFloat(high) || numEntry;
    const numLow = parseFloat(low) || numEntry;
    let dailyRange = numHigh - numLow;
    if (dailyRange <= 0) dailyRange = numEntry * 0.05;

    // Rasio cepat terbaru
    const final_tp = numEntry + (dailyRange * 0.7);
    const final_sl = Math.max(0.0001, numEntry - (dailyRange * 0.4));
    const amount = capital / numEntry; 

    if (capital < 10000) throw new Error("Modal minimum Indodax Rp 10.000.");

    // Eksekusi Beli Asli ke Indodax
    await executeIndodaxTrade(pair, 'buy', numEntry, capital);

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
      [pair, numEntry, amount, final_tp, final_sl, news_headline, news_impact, capital]
    );
    res.json({ success: true, message: `Berhasil mengalokasikan Rp ${capital.toLocaleString('id-ID')} ke posisi ${pair.toUpperCase()}!` });
  } catch (err) {
    res.status(500).json({ error: `Gagal transaksi: ${err.message}` });
  }
});

// ROUTE JUAL MANUAL (Dari UI)
app.post("/sell", async (req, res) => {
  const { id } = req.body;
  try {
    const position = await pool.query("SELECT * FROM portfolio_positions WHERE id=$1 AND status='OPEN'", [id]);
    if (position.rows.length === 0) throw new Error("Posisi tidak ditemukan.");
    const p = position.rows[0];
    const t = cache.tickers[p.pair];
    if (!t) throw new Error("Gagal mengambil harga terkini.");
    
    // Eksekusi Jual Asli ke Indodax
    await executeIndodaxTrade(p.pair, 'sell', parseFloat(t.last), p.amount);

    await pool.query("UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1", [id]);
    res.json({ success: true, message: "Posisi berhasil ditutup dan Profit/Loss direalisasikan." });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengeksekusi penutupan posisi: " + err.message });
  }
});

app.post("/watchlist", async (req, res) => {
  const { pair } = req.body;
  try {
    await pool.query("INSERT INTO watchlist (pair) VALUES ($1) ON CONFLICT DO NOTHING", [pair]);
    res.json({ success: true, message: "Koin ditambahkan ke Radar." });
  } catch (err) { res.status(500).json({ error: "Gagal" }); }
});

app.delete("/watchlist/:pair", async (req, res) => {
  try {
    await pool.query("DELETE FROM watchlist WHERE pair = $1", [req.params.pair]);
    res.json({ success: true, message: "Koin dihapus dari Radar." });
  } catch (err) { res.status(500).json({ error: "Gagal" }); }
});

// --- ENGINE LIVE SYNC BACKGROUND WORKER (CORE BOT ENGINE) ---
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
    let bullsCount = 0;
    let bearsCount = 0;

    Object.keys(tickers).forEach((k) => {
      if (k === "btc_idr") return; 
      const r = analyzeCoin(tickers[k], k, latestMarketData.btc.bias);
      if (r) {
        if (r.change >= 0) bullsCount++; else bearsCount++;
        results.push({ pair: k, isWatched: watchPairs.includes(k), ...r });
      }
    });

    const totalCoins = bullsCount + bearsCount || 1;
    const bullPct = Math.round((bullsCount / totalCoins) * 100);
    const bearPct = Math.round((bearsCount / totalCoins) * 100);
    let health = "KONSOLIDASI BERSAMA";
    if (bullPct >= 65) health = "BULLISH (OPTIMIS TINGGI)";
    else if (bullPct <= 35) health = "BEARISH (PESIMIS / TEKANAN JUAL)";
    
    latestMarketData.stats = { bullPct, bearPct, health };

    const top = results.sort((a, b) => b.score - a.score).slice(0, 20);
    const watchlistData = results.filter(r => watchPairs.includes(r.pair));

    const openPositions = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    const portfolioData = [];
    
    // --- EVALUASI BOT 1: CEK AUTO-SELL (TAKE PROFIT / STOP LOSS) & SMART HOLD ---
    for (const p of openPositions.rows) {
      const t = tickers[p.pair];
      let current_price = p.entry_price;
      let pnl = p.pnl;
      let attention_needed = false;
      let attention_reason = "";
      
      if (t) {
        current_price = parseFloat(t.last);
        pnl = (current_price - p.entry_price) * p.amount;
        pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]).catch(e => console.error(e));

        const analyzed = results.find(r => r.pair === p.pair);
        const buying_pressure = analyzed ? analyzed.technicals.buying_pressure : 50;

        if (analyzed) {
            if (analyzed.signal === "SELL") {
                attention_needed = true;
                attention_reason = "🚨 Sinyal berbalik drastis menjadi SELL. Waspada!";
            } else if (analyzed.technicals.buying_pressure < 25) {
                attention_needed = true;
                attention_reason = "⚠️ Tekanan beli menyusut tajam (Dumping Murni).";
            }
        }

        // 🚨 VIRTUAL OCO TRIGGER & SMART HOLD
        if (AUTO_TRADE_ENABLED && !isExecutingTrade[`sell_${p.id}`]) {
          if (current_price >= p.target_tp) {
            // 🧠 LOGIKA SMART HOLD (TRAILING PROFIT)
            if (buying_pressure > 65) {
              const numHigh = parseFloat(t.high) || current_price;
              const numLow = parseFloat(t.low) || current_price;
              let dailyRange = numHigh - numLow;
              if (dailyRange <= 0) dailyRange = current_price * 0.05;

              // Trailing naik pelan-pelan
              const new_tp = current_price + (dailyRange * 0.7);
              const new_sl = current_price - (dailyRange * 0.4);

              console.log(`🧠 SMART HOLD: ${p.pair} tembus TP tapi kekuatan beli tinggi (${buying_pressure}%). SL & TP dikerek naik!`);
              await pool.query("UPDATE portfolio_positions SET target_tp=$1, target_sl=$2 WHERE id=$3", [new_tp, new_sl, p.id]);
              
              p.target_tp = new_tp;
              p.target_sl = new_sl;
              attention_needed = true;
              attention_reason = `🚀 SMART HOLD AKTIF! Target cuan dinaikkan mengikuti reli!`;
            } else {
              isExecutingTrade[`sell_${p.id}`] = true;
              try {
                console.log(`🤖 BOT AUTO-SELL TRIGGERED! Kondisi: TAKE PROFIT 🎯 untuk ${p.pair}`);
                await executeIndodaxTrade(p.pair, 'sell', current_price, p.amount);
                await pool.query("UPDATE portfolio_positions SET status='CLOSED', pnl=$1 WHERE id=$2", [pnl, p.id]);
              } catch (err) {
                console.error(`Gagal Auto-Sell ${p.pair}:`, err.message);
              } finally {
                delete isExecutingTrade[`sell_${p.id}`];
              }
            }
          } else if (current_price <= p.target_sl) {
            isExecutingTrade[`sell_${p.id}`] = true;
            try {
              console.log(`🤖 BOT AUTO-SELL TRIGGERED! Kondisi: STOP LOSS ⚠️ untuk ${p.pair}`);
              await executeIndodaxTrade(p.pair, 'sell', current_price, p.amount);
              await pool.query("UPDATE portfolio_positions SET status='CLOSED', pnl=$1 WHERE id=$2", [pnl, p.id]);
            } catch (err) {
              console.error(`Gagal Auto-Sell ${p.pair}:`, err.message);
            } finally {
              delete isExecutingTrade[`sell_${p.id}`];
            }
          }
        }
      }
      portfolioData.push({ ...p, current_price, pnl, attention_needed, attention_reason });
    }

    // --- EVALUASI BOT 2: CEK AUTO-BUY BERDASARKAN KETERSEDIAAN SALDO ---
    if (AUTO_TRADE_ENABLED) {
      const availableIDR = await getIndodaxBalance();
      if (availableIDR >= CAPITAL_PER_TRADE) {
        const activePairs = openPositions.rows.map(p => p.pair);
        const bestCoin = results.find(r => r.signal === "STRONG BUY" && !activePairs.includes(r.pair) && !isExecutingTrade[`buy_${r.pair}`]);
        
        if (bestCoin) {
          isExecutingTrade[`buy_${bestCoin.pair}`] = true;
          try {
            console.log(`🤖 BOT AUTO-BUY TRIGGERED! Sniping ${bestCoin.pair} di harga ${bestCoin.price}... (Sisa Saldo: Rp ${availableIDR.toLocaleString()})`);
            const amount = CAPITAL_PER_TRADE / bestCoin.price;

            await executeIndodaxTrade(bestCoin.pair, 'buy', bestCoin.price, CAPITAL_PER_TRADE);
            
            await pool.query(
              `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
              [bestCoin.pair, bestCoin.price, amount, bestCoin.target_tp, bestCoin.target_sl, bestCoin.news_headline, bestCoin.news_impact, CAPITAL_PER_TRADE]
            );
          } catch (err) {
            console.error(`Gagal Auto-Buy ${bestCoin.pair}:`, err.message);
          } finally {
            delete isExecutingTrade[`buy_${bestCoin.pair}`];
          }
        }
      }
    }

    latestMarketData.top = top;
    latestMarketData.portfolio = portfolioData;
    latestMarketData.watchlist = watchlistData;

    io.emit("market_data", latestMarketData);
  } catch (e) {
    console.error("⚠️ Kesalahan Sinkronisasi Live Stream:", e.message);
  } finally {
    isWorkerRunning = false;
  }
}

// DIPERCEPAT MENJADI 5 DETIK! (Mode Agresif)
setInterval(streamWorker, 5000);

io.on("connection", (socket) => {
  socket.emit("market_data", latestMarketData);
});

server.listen(PORT, () => console.log(`🚀 QUANT ENGINE VERSI PREMIUM ONLINE - PORT ${PORT}`));
