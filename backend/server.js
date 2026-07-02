const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = "https://crypto-sintaa.vercel.app";

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
  console.error('Koneksi Database bermasalah secara tidak terduga:', err);
});

// Inisialisasi Database (Portofolio + Watchlist)
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

async function updateMarket() {
  const now = Date.now();
  if (now - cache.lastUpdate < 8000 || cache.isFetching) return;

  cache.isFetching = true;
  try {
    const res = await axios.get(`${BASE}/tickers`, { timeout: 5000 });
    if (res.data && res.data.tickers) {
      cache.tickers = res.data.tickers;
      cache.lastUpdate = Date.now();
    }
  } catch (error) {
    console.error("⚠️ Gagal mengambil data market dari Indodax:", error.message);
  } finally {
    cache.isFetching = false;
  }
}

// Advanced AI & Quantitative Metric Analysis Engine
function analyzeCoin(t, pairName) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  const buy_price = parseFloat(t.buy || price);
  const sell_price = parseFloat(t.sell || price);
  
  if (!price || vol < 100000000 || high === low) return null;

  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  const volatility = ((high - low) / low) * 100;
  const vola_score = Math.min(10, volatility / 2);

  const safe_buy_price = buy_price > 0 ? buy_price : price;
  const spread_pct = ((sell_price - safe_buy_price) / safe_buy_price) * 100;
  const spread_penalty = spread_pct > 2 ? 5 : spread_pct > 1 ? 2 : 0;

  const buying_pressure = ((price - low) / (high - low)) * 100;
  let pressure_score = buying_pressure > 80 ? 3 : buying_pressure < 20 ? 4 : 1;

  let news_headline = "Konsolidasi normal. Aksi beli dan jual seimbang.";
  let news_impact = "NEUTRAL";
  let impact_desc = "Harga bergerak stabil dalam rentang rata-rata.";

  if (spread_penalty >= 5) {
    news_headline = "Peringatan Likuiditas! Orderbook sangat tipis.";
    news_impact = "BEARISH";
    impact_desc = "Risiko slippage sangat tinggi. Hindari.";
  } else if (whale_score > 7 && buying_pressure > 85) {
    news_headline = "Breakout Alert: Institusi mendorong harga menembus resisten.";
    news_impact = "BULLISH";
    impact_desc = "Tekanan beli mendominasi di pucuk, potensi rally lanjutan sangat kuat.";
  } else if (whale_score > 6 && buying_pressure < 20 && change < -3) {
    news_headline = "Fase Oversold: Terjadi panic selling masif di pasar retail.";
    news_impact = "BULLISH";
    impact_desc = "Indikator oversold. Potensi pantulan atau reversal.";
  } else if (change < -7) {
    news_headline = "Aksi distribusi dan Take Profit besar-besaran berlangsung.";
    news_impact = "BEARISH";
    impact_desc = "Tekanan jual menembus batas support harian. Waspada koreksi dalam.";
  }

  const score = (whale_score * 2) + momentum_score + vola_score + pressure_score - spread_penalty + (news_impact === "BULLISH" ? 2 : news_impact === "BEARISH" ? -3 : 0);
  let signal = score >= 18 ? "STRONG BUY" : score > 12 ? "BUY" : score < 6 ? "SELL" : "HOLD";

  return { 
    price, vol, change, score, signal, news_headline, news_impact, impact_desc,
    technicals: {
      spread: spread_pct.toFixed(2),
      buying_pressure: buying_pressure.toFixed(0),
      volatility: volatility.toFixed(2)
    }
  };
}

// API Endpoints
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
  if (!pair || !entry_price) return res.status(400).json({ error: "Data masukan tidak lengkap" });

  try {
    const amount = 1; 
    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')`,
      [pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact]
    );
    res.json({ success: true, message: "Berhasil menambahkan ke portofolio aktif!" });
  } catch (err) {
    res.status(500).json({ error: "Gagal menyimpan posisi trading" });
  }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID posisi tidak ditemukan" });

  try {
    await pool.query("UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1", [id]);
    res.json({ success: true, message: "Posisi berhasil ditutup." });
  } catch (err) {
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

// Global WebSocket Worker Thread Interval Engine
let isWorkerRunning = false;
async function streamWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    await updateMarket();
    const tickers = cache.tickers;
    if (Object.keys(tickers).length === 0) return;

    // Ambil daftar watchlist dari database untuk mapping status
    const watchData = await pool.query("SELECT pair FROM watchlist");
    const watchPairs = watchData.rows.map(row => row.pair);

    const results = [];
    Object.keys(tickers).forEach((k) => {
      const r = analyzeCoin(tickers[k], k);
      if (r) {
        results.push({ 
          pair: k, 
          isWatched: watchPairs.includes(k),
          ...r 
        });
      }
    });

    const top = results.sort((a, b) => b.score - a.score).slice(0, 15);

    // Update real-time Profit and Loss (PnL) portofolio aktif
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
      btc: tickers["btc_idr"]?.last || 0,
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

// Menjalankan streaming data pasar terpusat secara berkala (Aman dari Rate Limit)
setInterval(streamWorker, 10000);

io.on("connection", (socket) => {
  console.log(`Koneksi terminal baru terbentuk: ${socket.id}`);
  socket.emit("market_data", { btc: 0, top: [], portfolio: [], watchlist: [], initial: true });
});

server.listen(PORT, () => console.log(`🚀 TERMINAL QUANT ONLINE PADA PORT ${PORT}`));
