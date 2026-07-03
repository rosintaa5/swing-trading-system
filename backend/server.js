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

// --- AUTO MIGRATION SYSTEM (Penyembuh Bug Gagal Beli) ---
async function initDB() {
  try {
    // 1. Buat tabel utama jika belum ada
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

    // 2. Suntikkan kolom baru secara paksa jika tabel lama sudah ada (Menghindari Error 500)
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS target_tp FLOAT DEFAULT 0;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS target_sl FLOAT DEFAULT 0;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS news_headline TEXT;`);
    await pool.query(`ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS news_impact TEXT;`);
    
    console.log("✅ Database System & Auto-Migration Berhasil Dijalankan!");
  } catch (err) {
    console.error("❌ Gagal Menginisialisasi Database:", err.message);
  }
}
initDB();

const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0, isFetching: false };

// Global Cache untuk melayani user secara instan saat membuka web
let latestMarketData = {
  btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data..." },
  top: [],
  portfolio: [],
  watchlist: []
};

// --- GLOBAL MARKET INTELLIGENCE (BTC TRACKER) ---
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
        const price = parseFloat(btc.last);
        const change = btc.change ? parseFloat(btc.change) : 0;
        let bias = "SIDEWAYS";
        let news = "⚖️ Hati-hati, pergerakan BTC terpantau sideways/konsolidasi. Aliran dana condong masuk ke Altcoin potensial. Ini saatnya selektif memilih koin bagus!";

        if (change <= -2.0) {
          bias = "BEARISH";
          news = `⚠️ AWAS! BTC sedang ambruk (${change.toFixed(2)}%). Seluruh pasar dalam zona bahaya tinggi koin-koin berisiko terseret ke bawah. Disarankan amankan profit dulu atau ketatkan Stop Loss Anda!`;
        } else if (change >= 2.0) {
          bias = "BULLISH";
          news = `🚀 LUAR BIASA! BTC terbang tinggi (${change.toFixed(2)}%). Tren pasar sangat sehat (Bullish Mode). Hasil hitungan mendeteksi ini momentum terbaik koin-koin untuk breakout!`;
        }
        
        latestMarketData.btc = { price, change, bias, news };
      }
    }
  } catch (error) {
    console.error("⚠️ Gagal mengambil data market:", error.message);
  } finally {
    cache.isFetching = false;
  }
}

// --- COIN ANALYZER ENGINE ---
function analyzeCoin(t, pairName, btcBias) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  
  if (!price || vol < 150000000 || high === low) return null; // Filter Likuiditas mini 150 Juta IDR

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  let volatility = ((high - low) / low) * 100;
  if (volatility <= 0) volatility = 0.5;

  const buying_pressure = ((price - low) / (high - low)) * 100;

  // Rumus Volatilitas Dinamis Aman Server (Bebas dari Bug NaN)
  const safeVolatility = Math.min(volatility, 12); 
  const target_tp = price * (1 + (safeVolatility * 1.6) / 100);
  const target_sl = price * (1 - (safeVolatility * 1.0) / 100);

  // Kalkulasi Tambahan Berharga: Risk-to-Reward Ratio (RRR)
  const rrr = ((target_tp - price) / (price - target_sl || 1)).toFixed(1);

  // Penyesuaian Skor Akhir Berdasarkan Kondisi Pasar Global
  let btc_adjustment = btcBias === "BULLISH" ? 2 : btcBias === "BEARISH" ? -4 : 0;
  const score = (whale_score * 2) + momentum_score + btc_adjustment;
  let signal = score >= 17 ? "STRONG BUY" : score > 11 ? "BUY" : score < 6 ? "SELL" : "HOLD";

  // Kalimat Informasi Interaktif Berbasis Kondisi Riil Matematika Koin
  let news_headline = "Kombinasi volume dan volatilitas koin ini bergerak seimbang dalam batas wajar.";
  let news_impact = "NEUTRAL";
  let capital_advice = "Alokasi Normal (Maksimal 5% dari Modal total)";

  if (btcBias === "BEARISH") {
    news_headline = "⚠️ Hati-hati koin ini terancam koreksi imbas dari penurunan harga Bitcoin global!";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Dilarang Masuk! Simpan dana tunai Anda.";
  } else if (score >= 17 && btcBias === "BULLISH") {
    news_headline = "🔥 SANGAT BAGUS! Tekanan beli koin ini masif disokong pasar yang sedang meroket tinggi.";
    news_impact = "BULLISH";
    capital_advice = "Rekomendasi kuat: Tambah Posisi lagi! (Gunakan hingga 15% modal)";
  } else if (buying_pressure > 85 && change > 3) {
    news_headline = "📈 Dari hasil hitungan algoritma, koin ini sedang mengalami fase breakout akumulasi!";
    news_impact = "BULLISH";
    capital_advice = "Koin ini bagus untuk diikuti, segera buka posisi cicil beli.";
  } else if (change < -8) {
    news_headline = "🚨 WASPADA! Terjadi aksi buang barang massal. Menjauh dari koin ini sekarang juga.";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Bahaya tinggi, jangan tangkap pisau jatuh!";
  } else if (change < -4 && buying_pressure < 20) {
    news_headline = "📉 Mengalami pelemahan teknikal sementara, tunggu konfirmasi di area support bawah.";
    news_impact = "NEUTRAL";
    signal = "HOLD";
    capital_advice = "Wait & See dulu, pasang pantauan.";
  }

  return { 
    price, vol, change, score, signal, news_headline, news_impact, capital_advice, rrr,
    target_tp: parseFloat(target_tp.toFixed(2)),
    target_sl: parseFloat(target_sl.toFixed(2)),
    technicals: { buying_pressure: buying_pressure.toFixed(0), volatility: volatility.toFixed(2) }
  };
}

// --- API ENDPOINTS ---
app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat daftar portofolio" });
  }
});

app.post("/buy", async (req, res) => {
  const { pair, entry_price, target_tp, target_sl, news_headline, news_impact } = req.body;
  
  if (!pair || !entry_price || isNaN(entry_price) || isNaN(target_tp) || isNaN(target_sl)) {
    return res.status(400).json({ error: "Gagal validasi: Data angka cacat atau kosong." });
  }

  try {
    const capital_per_trade = 100000; // Simulasi Rp 100.000 per klik transaksi
    const amount = capital_per_trade / entry_price; 

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')`,
      [pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact]
    );
    res.json({ success: true, message: `Berhasil menyimpan posisi ${pair.toUpperCase()}!` });
  } catch (err) {
    console.error("❌ Error INSERT SQL Database:", err.message);
    res.status(500).json({ error: `Gagal menyimpan ke DB: ${err.message}` });
  }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1", [id]);
    res.json({ success: true, message: "Posisi berhasil ditutup dan direalisasikan." });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengeksekusi penutupan posisi." });
  }
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

// --- ENGINE LIVE SYNC BACKGROUND WORKER ---
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
      if (k === "btc_idr") return; 
      const r = analyzeCoin(tickers[k], k, latestMarketData.btc.bias);
      if (r) {
        results.push({ pair: k, isWatched: watchPairs.includes(k), ...r });
      }
    });

    const top = results.sort((a, b) => b.score - a.score).slice(0, 20);

    // Pembaruan Real-time PnL Posisi Terbuka
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

    // Update Global Cache Data
    latestMarketData.top = top;
    latestMarketData.portfolio = portfolio.rows;
    latestMarketData.watchlist = watchlistData;

    // Pancarkan ke seluruh frontend klien yang tersambung
    io.emit("market_data", latestMarketData);
  } catch (e) {
    console.error("⚠️ Kesalahan Sinkronisasi Live Stream Worker:", e.message);
  } {
    isWorkerRunning = false;
  }
}

// Menjalankan mesin kalkulasi berkala tiap 8 detik
setInterval(streamWorker, 8000);

io.on("connection", (socket) => {
  // Kirim data cache secara instan kepada user yang baru buka website (Anti Menunggu/Blank)
  socket.emit("market_data", latestMarketData);
});

server.listen(PORT, () => console.log(`🚀 QUANT ENGINE VERSI STABIL ONLINE - PORT ${PORT}`));
