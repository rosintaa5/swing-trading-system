const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

// ================= DB CONNECTION =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= DATABASE INITIALIZATION (CRUD READY) =================
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
        status TEXT DEFAULT 'OPEN', 
        pnl FLOAT DEFAULT 0,
        notes TEXT,
        news_bias TEXT DEFAULT 'NEUTRAL',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("Database Tables untuk Rekap & CRUD Siap.");
  } catch (err) {
    console.error("DB Init Error:", err.message);
  }
}
initDB();

// ================= INDODAX API TICKER =================
const BASE = "https://indodax.com/api";
let cache = { tickers: {}, lastUpdate: 0 };

async function updateMarket() {
  if (Date.now() - cache.lastUpdate < 3000) {
    try {
      const res = await axios.get(`${BASE}/tickers`);
      cache.tickers = res.data.tickers || {};
      cache.lastUpdate = Date.now();
    } catch (error) {
      console.error("Error fetching tickers:", error.message);
    }
  }
}

// ================= QUANT ENGINE + SIMULATED NEWS IMPACT =================
function analyzeCoin(t, pairName) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  const change = ((high - low) / (low || 1)) * 100;

  if (!price || vol < 100000000) return null;

  // Skor Teknis Standar
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));
  const liquidity_score = Math.min(10, Math.max(0, Math.log1p(vol) / 2.5));
  const risk_score = Math.min(10, Math.max(0, Math.abs(change) > 5 ? 8 : 3));

  // Simulasi Berita Otomatis Berdasarkan Karakteristik Data Pasar untuk Live Feed Scan
  let news_headline = "Konsolidasi volume pasar normal mendominasi pergerakan.";
  let news_direction = "NEUTRAL";
  let news_impact_score = 0;

  if (whale_score > 7 && momentum_score > 6) {
    news_headline = "Whale terpantau melakukan perpindahan aset skala besar masuk ke pasar.";
    news_direction = "BULLISH";
    news_impact_score = 2;
  } else if (risk_score > 7 && momentum_score < 4) {
    news_headline = "Sentimen makro memicu tekanan jual jangka pendek akibat ketidakpastian regulasi.";
    news_direction = "BEARISH";
    news_impact_score = -2;
  }

  const score = (whale_score * 2) + momentum_score + liquidity_score - (risk_score * 0.5) + news_impact_score;

  let signal = "HOLD";
  if (score > 12) signal = "BUY";
  if (score < 4) signal = "SELL";

  return {
    price,
    vol,
    score,
    signal,
    whale_score,
    momentum_score,
    liquidity_score,
    risk_score,
    news_headline,
    news_direction
  };
}

// Murni kalkulasi floating PnL tanpa eksekusi close posisi otomatis
async function calculateFloatingPnL(tickers) {
  const res = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN'");
  for (const p of res.rows) {
    const t = tickers[p.pair.toLowerCase()];
    if (!t) continue;
    const currentPrice = parseFloat(t.last);
    const pnl = (currentPrice - p.entry_price) * p.amount;
    await pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]);
  }
}

// ================= FULL CRUD API REST ENDPOINTS =================

// READ ALL (Membaca semua rekap pantauan)
app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE (Menambah koin pantauan/rekap entry baru)
app.post("/portfolio", async (req, res) => {
  const { pair, entry_price, amount, target_tp, target_sl, notes, news_bias } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, notes, news_bias, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN') RETURNING *`,
      [pair.toLowerCase(), entry_price, amount, target_tp, target_sl, notes, news_bias || 'NEUTRAL']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE (Mengedit data pantauan/catatan/mengubah status jadi CLOSED secara manual)
app.put("/portfolio/:id", async (req, res) => {
  const { id } = req.params;
  const { target_tp, target_sl, status, notes, news_bias } = req.body;
  try {
    const result = await pool.query(
      `UPDATE portfolio_positions 
       SET target_tp=$1, target_sl=$2, status=$3, notes=$4, news_bias=$5
       WHERE id=$6 RETURNING *`,
      [target_tp, target_sl, status, notes, news_bias, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (Menghapus rekap koin dari daftar pantauan)
app.delete("/portfolio/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM portfolio_positions WHERE id=$1", [id]);
    res.json({ success: true, message: "Rekap pantauan berhasil dihapus." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= WEBSOCKET REAL-TIME BROADCAST =================
async function streamWorker(socket) {
  try {
    await updateMarket();
    const tickers = cache.tickers;
    const results = [];

    Object.keys(tickers).forEach((k) => {
      const r = analyzeCoin(tickers[k], k);
      if (r) results.push({ pair: k, ...r });
    });

    const top = results.sort((a, b) => b.score - a.score).slice(0, 12);
    await calculateFloatingPnL(tickers);

    const allPositions = await pool.query("SELECT * FROM portfolio_positions ORDER BY id DESC");

    socket.emit("v12_fixed", {
      btc: tickers["btc_idr"]?.last || 0,
      btcChange: tickers["btc_idr"]?.change || 0,
      top,
      portfolio: allPositions.rows,
      timestamp: Date.now()
    });
  } catch (e) {
    console.error("Worker Error:", e.message);
  }
}

io.on("connection", (socket) => {
  console.log("Client terhubung untuk memantau data:", socket.id);
  const interval = setInterval(() => streamWorker(socket), 4000);
  socket.on("disconnect", () => clearInterval(interval));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MONITORING ENGINE ACTIVE ON PORT ${PORT}`));
