const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://crypto-sintaa.vercel.app";

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

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id SERIAL PRIMARY KEY,
        pair TEXT NOT NULL,
        entry_price FLOAT DEFAULT 0,
        amount FLOAT DEFAULT 0,
        target_tp FLOAT DEFAULT 0,
        target_sl FLOAT DEFAULT 0,
        news_headline TEXT,
        news_impact TEXT,
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
    console.log("✅ Database System Siap (Portfolio & Watchlist Active)");
  } catch (err) {
    console.error("❌ Gagal Menginisialisasi Database:", err.message);
  }
}
initDB();

const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0, isFetching: false };

// --- GLOBAL MARKET INTELLIGENCE (BTC TRACKER) ---
let btcTrend = {
  price: 0,
  change: 0,
  bias: "NEUTRAL",
  news: "Menunggu aliran data Bitcoin..."
};

async function updateMarket() {
  const now = Date.now();
  if (now - cache.lastUpdate < 8000 || cache.isFetching) return;

  cache.isFetching = true;
  try {
    const res = await axios.get(`${BASE}/tickers`, { timeout: 5000 });
    if (res.data && res.data.tickers) {
      cache.tickers = res.data.tickers;
      cache.lastUpdate = Date.now();

      // Analisis Arah Angin Bitcoin (Market Bias)
      const btc = cache.tickers["btc_idr"];
      if (btc) {
        btcTrend.price = parseFloat(btc.last);
        btcTrend.change = btc.change ? parseFloat(btc.change) : 0;
        
        if (btcTrend.change <= -2.5) {
          btcTrend.bias = "BEARISH";
          btcTrend.news = "⚠️ HATI-HATI! BTC sedang mengalami koreksi tajam. Risiko koin alternatif (Altcoin) terseret turun sangat besar. Sangat disarankan untuk menahan posisi (Wait & See).";
        } else if (btcTrend.change >= 2.5) {
          btcTrend.bias = "BULLISH";
          btcTrend.news = "🚀 BTC Melaju Kuat! Sentimen pasar sangat positif. Ini adalah momentum terbaik untuk mencari koin-koin yang siap breakout (menembus resistensi).";
        } else {
          btcTrend.bias = "SIDEWAYS";
          btcTrend.news = "⚖️ BTC Terpantau Stabil. Masa konsolidasi ini adalah waktu yang pas bagi Altcoin berkapitalisasi kecil untuk unjuk gigi. Peluang scalping terbuka lebar.";
        }
      }
    }
  } catch (error) {
    console.error("⚠️ Gagal mengambil data market:", error.message);
  } finally {
    cache.isFetching = false;
  }
}

// --- ADVANCED AI METRIC ANALYSIS ENGINE ---
function analyzeCoin(t, pairName, btcBias) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  const buy_price = parseFloat(t.buy || price);
  const sell_price = parseFloat(t.sell || price);
  
  if (!price || vol < 150000000 || high === low) return null; // Filter volume lebih ketat (min 150 Juta IDR)

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  let volatility = ((high - low) / low) * 100;
  if (volatility <= 0) volatility = 0.5; // Pengaman agar tidak NaN saat dihitung
  const vola_score = Math.min(10, volatility / 2);

  const safe_buy_price = buy_price > 0 ? buy_price : price;
  const spread_pct = ((sell_price - safe_buy_price) / safe_buy_price) * 100;
  const spread_penalty = spread_pct > 2 ? 5 : spread_pct > 1 ? 2 : 0;

  const buying_pressure = ((price - low) / (high - low)) * 100;
  let pressure_score = buying_pressure > 80 ? 3 : buying_pressure < 20 ? 4 : 1;

  // --- INTERACTIVE SYSTEM CALCULATION ---
  // Perhitungan Stop Loss (SL) & Take Profit (TP) dilakukan di SERVER agar aman dari NaN
  const safeVolatility = Math.min(volatility, 15); // Batasi max volatilitas 15% untuk rumus
  const target_tp = price * (1 + (safeVolatility * 1.5) / 100);
  const target_sl = price * (1 - (safeVolatility * 1.0) / 100);

  // Penyesuaian Skor dengan Pengaruh Bitcoin
  let btc_adjustment = btcBias === "BULLISH" ? 2 : btcBias === "BEARISH" ? -3 : 0;
  const score = (whale_score * 2) + momentum_score + vola_score + pressure_score - spread_penalty + btc_adjustment;
  let signal = score >= 18 ? "STRONG BUY" : score > 12 ? "BUY" : score < 6 ? "SELL" : "HOLD";

  // Narasi interaktif berbasis kecerdasan komputasi
  let news_headline = "Kalkulasi standar. Volume jual-beli terpantau cukup imbang. Cocok untuk diamati terlebih dahulu.";
  let news_impact = "NEUTRAL";
  let impact_desc = "Indikator volatilitas berada di ambang batas wajar. Tidak ada pergerakan institusi (Whale) yang mencolok.";

  if (spread_penalty >= 5) {
    news_headline = "🚨 PERINGATAN KERAS! Jarak harga Beli-Jual (Spread) terlalu besar!";
    news_impact = "BEARISH";
    impact_desc = "Jangan masuk! Risiko Anda terjebak harga (nyangkut) sangat tinggi. Likuiditas koin ini sangat buruk.";
    signal = "SELL"; 
  } else if (score >= 18 && btcBias === "BULLISH") {
    news_headline = "🔥 LUAR BIASA! Hasil hitungan algoritma mendeteksi tekanan beli masif dibantu dorongan tren BTC.";
    news_impact = "BULLISH";
    impact_desc = "Bagus sekali! Institusi besar sedang melakukan akumulasi. Momentum penembusan resistensi sangat kuat. Silakan eksekusi beli dengan berpedoman pada Target TP di atas!";
  } else if (score >= 15 && buying_pressure > 80) {
    news_headline = "📈 Peluang Emas! Koin ini sedang mengalami tren naik mandiri terlepas dari pergerakan pasar.";
    news_impact = "BULLISH";
    impact_desc = "Tekanan pembeli berhasil mendominasi. Potensi lonjakan harga lanjutan terlihat sangat rasional. Boleh tambah posisi jika sudah punya.";
  } else if (score > 10 && buying_pressure < 20 && change < -5) {
    news_headline = "📉 FASE OVERSOLD! Harga sudah ditekan sangat murah oleh para penjual panik (Panic Seller).";
    news_impact = "BULLISH";
    impact_desc = "Dari hasil hitungan, koin ini berada di dasar (support) harian. Sangat menarik untuk mulai mencicil beli (akumulasi) demi mengambil keuntungan dari pantulan (rebound) harga.";
  } else if (change < -7) {
    news_headline = "⚠️ DISTRIBUSI BESAR! Terjadi aksi lepas barang secara brutal oleh para cukong.";
    news_impact = "BEARISH";
    impact_desc = "Harga telah menembus zona aman ke bawah. Sangat disarankan untuk segera menutup posisi jika punya, atau menjauh sepenuhnya dari koin ini.";
  }

  return { 
    price, vol, change, score, signal, news_headline, news_impact, impact_desc,
    target_tp: parseFloat(target_tp.toFixed(2)),
    target_sl: parseFloat(target_sl.toFixed(2)),
    technicals: {
      spread: spread_pct.toFixed(2),
      buying_pressure: buying_pressure.toFixed(0),
      volatility: volatility.toFixed(2)
    }
  };
}

// --- API ENDPOINTS ---
app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil portofolio" });
  }
});

app.post("/buy", async (req, res) => {
  const { pair, entry_price, target_tp, target_sl, news_headline, news_impact } = req.body;
  
  // Keamanan ketat untuk memastikan tidak ada nilai "NaN" yang menyelinap ke PostgreSQL
  if (!pair || !entry_price || isNaN(entry_price) || isNaN(target_tp) || isNaN(target_sl)) {
    console.error("Gagal Beli - Data Ditolak:", req.body);
    return res.status(400).json({ error: "Data kalkulasi tidak valid atau tidak lengkap." });
  }

  try {
    // Kita asumsikan pengguna bertransaksi dengan alokasi simulasi konstan (Misal: 100.000 IDR per posisi)
    const mock_capital = 100000;
    const amount = mock_capital / entry_price; 

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')`,
      [pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact]
    );
    res.json({ success: true, message: `Berhasil mengeksekusi pembelian ${pair.toUpperCase()}!` });
  } catch (err) {
    console.error("❌ Error Eksekusi Buy Database:", err);
    res.status(500).json({ error: "Gagal menyimpan posisi trading ke dalam server." });
  }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID posisi tidak ditemukan" });

  try {
    await pool.query("UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1", [id]);
    res.json({ success: true, message: "Posisi berhasil ditutup." });
  } catch (err) {
    console.error("❌ Error Eksekusi Sell Database:", err);
    res.status(500).json({ error: "Gagal menutup posisi trading" });
  }
});

app.get("/watchlist", async (req, res) => {
  try {
    const result = await pool.query("SELECT pair FROM watchlist ORDER BY id DESC");
    res.json(result.rows.map(row => row.pair));
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil watchlist" });
  }
});

app.post("/watchlist", async (req, res) => {
  const { pair } = req.body;
  if (!pair) return res.status(400).json({ error: "Pair diperlukan" });
  try {
    await pool.query("INSERT INTO watchlist (pair) VALUES ($1) ON CONFLICT DO NOTHING", [pair]);
    res.json({ success: true, message: "Koin berhasil dipantau" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan pantauan" });
  }
});

app.delete("/watchlist/:pair", async (req, res) => {
  const { pair } = req.params;
  try {
    await pool.query("DELETE FROM watchlist WHERE pair = $1", [pair]);
    res.json({ success: true, message: "Koin dihapus dari pantauan" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghapus pantauan" });
  }
});

// --- WORKER SOCKET SINKRONISASI PASAR ---
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
    Object.keys(tickers).forEach((k) => {
      // Kita tidak mengirim btc_idr ke dalam daftar koin Altcoin biasa
      if(k === "btc_idr") return; 

      const r = analyzeCoin(tickers[k], k, btcTrend.bias);
      if (r) {
        results.push({ 
          pair: k, 
          isWatched: watchPairs.includes(k),
          ...r 
        });
      }
    });

    const top = results.sort((a, b) => b.score - a.score).slice(0, 15);

    const openPositions = await pool.query("SELECT id, pair, entry_price, amount FROM portfolio_positions WHERE status='OPEN'");
    for (const p of openPositions.rows) {
      const t = tickers[p.pair];
      if (t) {
        const pnl = (parseFloat(t.last) - p.entry_price) * p.amount;
        await pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]);
      }
    }

    const portfolio = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    const watchlistData = results.filter(r => watchPairs.includes(r.pair));

    io.emit("market_data", {
      btc: btcTrend, // Mengirim objek tren BTC secara utuh
      top,
      portfolio: portfolio.rows,
      watchlist: watchlistData
    });
  } catch (e) {
    console.error("Kesalahan Sinkronisasi Live Stream:", e.message);
  } finally {
    isWorkerRunning = false;
  }
}

setInterval(streamWorker, 10000);

io.on("connection", (socket) => {
  console.log(`📡 Koneksi terminal baru: ${socket.id}`);
  socket.emit("market_data", { btc: btcTrend, top: [], portfolio: [], watchlist: [], initial: true });
});

server.listen(PORT, () => console.log(`🚀 AI QUANT ENGINE ONLINE - PORT ${PORT}`));
