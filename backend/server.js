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

// ================= DB =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= INIT DB =================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id SERIAL PRIMARY KEY,
      pair TEXT,
      entry_price FLOAT,
      amount FLOAT DEFAULT 1,
      status TEXT DEFAULT 'OPEN',
      pnl FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id SERIAL PRIMARY KEY,
      pair TEXT,
      price FLOAT,
      score FLOAT,
      signal TEXT,
      whale_score FLOAT,
      momentum_score FLOAT,
      liquidity_score FLOAT,
      confidence FLOAT,
      risk_score FLOAT,
      tp1 FLOAT,
      tp2 FLOAT,
      sl FLOAT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("DB READY");
}

initDB();

// ================= INDODAX =================
const BASE = "https://indodax.com/api";

async function getTickers() {
  try {
    const res = await axios.get(`${BASE}/tickers`, { timeout: 5000 });
    return res.data?.tickers || {};
  } catch (e) {
    return {};
  }
}

// ================= CACHE =================
let cache = { tickers: {}, lastUpdate: 0 };
let streamLock = false;

// ================= UTILS =================
const num = (v) => Number(v || 0);

// ================= FULL AI ENGINE =================
function analyzeCoin(t) {
  const price = num(t.last);
  const vol = num(t.vol_idr);
  const change = num(t.change);

  if (!price || vol < 100000000) return null;

  const whale = Math.log10(vol + 1);
  const momentum = change * 2;
  const liquidity = Math.log1p(vol) / 10;

  const score = whale * 2 + momentum * 1.5 + liquidity;

  const signal =
    score > 6 ? "BUY" :
    score < -6 ? "SELL" :
    "HOLD";

  return {
    pair: t.pair || "UNKNOWN",
    price,
    score,
    signal,

    // ENTRY SYSTEM
    entry: price,
    tp1: price * 1.03,
    tp2: price * 1.06,
    sl: price * 0.98,

    // SMART MONEY METRICS
    whale_score: whale,
    momentum_score: momentum,
    liquidity_score: liquidity,

    confidence: Math.min(100, 50 + Math.abs(score) * 5),
    risk_score: Math.abs(score),

    warning_level:
      score > 8 ? "EXTREME" :
      score > 6 ? "HIGH" :
      score > 3 ? "MEDIUM" : "LOW"
  };
}

// ================= MARKET CACHE =================
async function updateMarket() {
  const now = Date.now();
  if (now - cache.lastUpdate < 3000) return;

  cache.tickers = await getTickers();
  cache.lastUpdate = now;
}

// ================= PORTFOLIO =================
async function getPortfolio() {
  const res = await pool.query(
    "SELECT * FROM portfolio_positions WHERE status='OPEN'"
  );
  return res.rows;
}

async function updatePortfolio(market) {
  const portfolio = await getPortfolio();

  let equity = 0;
  const tasks = [];

  for (const p of portfolio) {
    const price = num(market?.[p.pair]?.last);
    if (!price) continue;

    const pnl = (price - p.entry_price) * p.amount;
    equity += pnl;

    tasks.push(
      pool.query(
        "UPDATE portfolio_positions SET pnl=$1 WHERE id=$2",
        [pnl, p.id]
      )
    );
  }

  await Promise.all(tasks);
  return equity;
}

// ================= BUY =================
app.post("/buy", async (req, res) => {
  try {
    const { pair, price, amount } = req.body;

    if (!pair || !price) {
      return res.status(400).json({ error: "INVALID DATA" });
    }

    const result = await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, status)
       VALUES ($1,$2,$3,'OPEN')
       RETURNING *`,
      [pair, price, amount || 1]
    );

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================= SELL =================
app.post("/sell", async (req, res) => {
  try {
    const { id } = req.body;

    await pool.query(
      "UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1",
      [id]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================= STREAM ENGINE =================
async function stream(socket) {
  if (streamLock) return;
  streamLock = true;

  try {
    await updateMarket();

    const tickers = cache.tickers;
    const results = [];

    for (const k of Object.keys(tickers)) {
      const r = analyzeCoin(tickers[k]);
      if (r) results.push(r);
    }

    const top = results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // batch insert snapshot
    if (top.length > 0) {
      const values = [];
      const params = [];

      top.forEach((t, i) => {
        values.push(`($${i*10+1},$${i*10+2},$${i*10+3},$${i*10+4},$${i*10+5},$${i*10+6},$${i*10+7},$${i*10+8},$${i*10+9},$${i*10+10})`);

        params.push(
          t.pair,
          t.price,
          t.score,
          t.signal,
          t.whale_score,
          t.momentum_score,
          t.liquidity_score,
          t.confidence,
          t.risk_score,
          t.tp1
        );
      });

      await pool.query(
        `INSERT INTO market_snapshots 
        (pair,price,score,s

ignal,whale_score,momentum_score,liquidity_score,confidence,risk_score,tp1)
        VALUES ${values.join(",")}`,
        params
      );
    }

    const equity = await updatePortfolio(tickers);

    socket.emit("v12_fixed", {
      btc: cache.tickers.btc_idr?.last,
      btcChange: cache.tickers.btc_idr?.change,
      top,
      equity,
      timestamp: Date.now()
    });

  } catch (e) {
    console.log("STREAM ERROR:", e.message);
  } finally {
    streamLock = false;
  }
}

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("CLIENT CONNECTED");

  const interval = setInterval(() => stream(socket), 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.json({ status: "OK", system: "V12 FULL INSTITUTIONAL FIXED" });
});

server.listen(process.env.PORT || 3000);
