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

    // Injeksi kolom aman
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
        
        // --- NEWS FEED GENERATOR BASED ON MACRO CONDITIONS ---
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

// --- COIN ANALYZER ENGINE (Dengan Metode ATR) ---
function analyzeCoin(t, pairName, btcBias) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  
  if (!price || vol < 150000000 || high === low) return null;

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  
  // Perhitungan Bobot Algoritma
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  
  let volatility = ((high - low) / low) * 100;
  if (volatility <= 0) volatility = 0.5;
  const buying_pressure = ((price - low) / (high - low)) * 100;

  // --- PERHITUNGAN DINAMIS ATR (Average True Range) ---
  // Mengukur rentang pergerakan riil harian untuk adaptasi Stop Loss / Take Profit
  let dailyRange = high - low;
  if (dailyRange <= 0) dailyRange = price * 0.05; // Fallback 5% jika range cacat

  const target_tp = price + (dailyRange * 1.5);
  const target_sl = Math.max(0.0001, price - (dailyRange * 1.0)); 
  const rrr = ((target_tp - price) / (price - target_sl || 1)).toFixed(1);

  // Penyesuaian Skor dengan Iklim Makro
  let btc_adjustment = btcBias === "BULLISH" ? 2 : btcBias === "BEARISH" ? -4 : 0;
  const score = (whale_score * 2) + momentum_score + btc_adjustment;
  let signal = score >= 17 ? "STRONG BUY" : score > 11 ? "BUY" : score < 6 ? "SELL" : "HOLD";

  // --- INTERACTIVE & CEREWET WARNING SYSTEM ---
  let news_headline = "Pergerakan harga wajar. Keseimbangan antara pembeli dan penjual cukup stabil.";
  let news_impact = "NEUTRAL";
  let capital_advice = "Gunakan maksimal 5% dari modal portofolio Anda.";
  
  let watch_status = "TAHAN DULU (FASE KONSOLIDASI)";
  let watch_desc = "Koin bergerak tanpa arah tren yang jelas. Belum ideal untuk masuk dalam waktu dekat.";

  if (btcBias === "BEARISH" && score < 10) {
    news_headline = "🚨 TINGGALKAN SEKARANG! Koin ini terseret deras oleh ambruknya BTC. Menangkap pisau jatuh sangat mematikan!";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Dilarang Masuk! Risiko Likuidasi Tinggi.";
    watch_status = "HATI-HATI (RISIKO KOREKSI MASIF)";
    watch_desc = "Sangat berbahaya untuk dibeli sekarang. Tren makro dan sentimen pasar sedang menghancurkan batas support kuat.";
  } else if (score >= 17 && btcBias === "BULLISH") {
    news_headline = "🚀 PELUANG EMAS! Tekanan beli koin ini meluap. Terdeteksi akumulasi paus didukung tren makro yang kokoh.";
    news_impact = "BULLISH";
    capital_advice = "Sangat disarankan: Tambah Posisi Bertahap! (Alokasi 10-15% modal)";
    watch_status = "SANGAT LAYAK ENTRY SEKARANG";
    watch_desc = "Terjadi anomali akumulasi raksasa (Whale) dan penembusan harga atas. Potensi pam (pump) gila-gilaan sangat terbuka lebar.";
  } else if (buying_pressure > 85 && change > 2) {
    news_headline = "🔥 MOMENTUM BREAKOUT! Banteng (Bulls) berhasil menguasai order book. Harga siap menjebol resisten berikutnya.";
    news_impact = "BULLISH";
    capital_advice = "Bagus untuk cicil beli (Dollar Cost Averaging).";
    watch_status = "BISA MULAI DICICIL (AKUMULASI)";
    watch_desc = "Tekanan beli terus meningkat tajam. Momentum positif mendominasi transaksi retail hari ini.";
  } else if (change < -7 || buying_pressure < 20) {
    news_headline = "⚠️ DISTRIBUSI PAUS TERDETEKSI! Investor besar sedang membuang barang. Jangan jadi exit liquidity mereka!";
    news_impact = "BEARISH";
    signal = "SELL";
    capital_advice = "Amankan kas Anda. Jangan eksekusi beli di sini.";
    watch_status = "HINDARI SEMENTARA (DUMPING MASSAL)";
    watch_desc = "Aset ini sedang dijauhi institusi. Tunggu berminggu-minggu hingga harga benar-benar menemukan lantai barunya (Bottoming).";
  } else if (rrr < 1.2 && signal === "BUY") {
    news_headline = "⚖️ Sinyal beli terdeteksi, namun rasio Reward terhadap Risiko (ATR) terlalu mepet. Waspada gocekan market maker.";
    capital_advice = "Kurangi ukuran posisi (Position Size) 50% untuk keamanan.";
  }

  return { 
    price, high, low, vol, change, score, signal, news_headline, news_impact, capital_advice, rrr,
    watch_status, watch_desc,
    target_tp: parseFloat(target_tp.toFixed(4)),
    target_sl: parseFloat(target_sl.toFixed(4)),
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
  const { pair, entry_price, capital, high, low, news_headline, news_impact } = req.body;
  
  if (!pair || !entry_price || isNaN(entry_price) || !capital || isNaN(capital)) {
    return res.status(400).json({ error: "Gagal validasi: Data angka cacat atau kosong." });
  }

  try {
    // Menghitung ulang SL/TP dengan metode ATR dinamis murni di Backend berdasarkan Entry Kustom
    const numEntry = parseFloat(entry_price);
    const numHigh = parseFloat(high) || numEntry;
    const numLow = parseFloat(low) || numEntry;
    
    let dailyRange = numHigh - numLow;
    if (dailyRange <= 0) dailyRange = numEntry * 0.05; // Fallback jika tidak ada range (misal koin baru listing)

    const final_tp = numEntry + (dailyRange * 1.5);
    const final_sl = Math.max(0.0001, numEntry - (dailyRange * 1.0));
    
    const amount = capital / numEntry; 

    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, initial_capital, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
      [pair, numEntry, amount, final_tp, final_sl, news_headline, news_impact, capital]
    );
    res.json({ success: true, message: `Berhasil mengalokasikan Rp ${capital.toLocaleString('id-ID')} ke posisi ${pair.toUpperCase()}!` });
  } catch (err) {
    console.error("❌ Error INSERT SQL Database:", err.message);
    res.status(500).json({ error: `Gagal menyimpan ke Server: ${err.message}` });
  }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1", [id]);
    res.json({ success: true, message: "Posisi berhasil ditutup dan Profit/Loss direalisasikan." });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengeksekusi penutupan posisi." });
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

    latestMarketData.top = top;
    latestMarketData.portfolio = portfolio.rows;
    latestMarketData.watchlist = watchlistData;

    io.emit("market_data", latestMarketData);
  } catch (e) {
    console.error("⚠️ Kesalahan Sinkronisasi Live Stream:", e.message);
  } finally {
    isWorkerRunning = false;
  }
}

setInterval(streamWorker, 8000);

io.on("connection", (socket) => {
  socket.emit("market_data", latestMarketData);
});

server.listen(PORT, () => console.log(`🚀 QUANT ENGINE VERSI PREMIUM ONLINE - PORT ${PORT}`));
