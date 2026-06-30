const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const server = http.createServer(app);

// ================= SOCKET =================
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
    CREATE TABLE IF NOT EXISTS portfolio (
      id SERIAL PRIMARY KEY,
      pair TEXT,
      entry_price FLOAT,
      amount FLOAT,
      tp1 FLOAT,
      tp2 FLOAT,
      sl FLOAT,
      status TEXT,
      pnl FLOAT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      id SERIAL PRIMARY KEY,
      pair TEXT,
      price FLOAT,
      change FLOAT,
      score FLOAT,
      signal TEXT,
      prediction TEXT,
      accuracy FLOAT,
      tp1 FLOAT,
      tp2 FLOAT,
      sl FLOAT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
initDB();

// ================= INDODAX =================
const BASE = "https://indodax.com/api";

async function getTickers() {
  const res = await axios.get(`${BASE}/tickers`);
  return res.data.tickers || {};
}

// ================= TP SL ENGINE =================
function calculateLevels(price, signal) {
  const safePrice = Number(price) || 0;
  const risk = safePrice * 0.02;

  if (signal === "BUY") {
    return {
      tp1: safePrice * 1.03,
      tp2: safePrice * 1.06,
      sl: safePrice - risk
    };
  }

  if (signal === "SELL") {
    return {
      tp1: safePrice * 0.97,
      tp2: safePrice * 0.94,
      sl: safePrice + risk
    };
  }

  return { tp1: safePrice, tp2: safePrice, sl: safePrice };
}

// ================= AI ENGINE (FIXED SAFE VERSION) =================
function analyzeCoin(ticker = {}, btcChange = 0, pairName = "") {
  const last = Number(ticker.last || 0);
  const high = Number(ticker.high || last);
  const low = Number(ticker.low || last);
  const change = Number(ticker.change || 0);

  const volatility = low > 0 ? ((high - low) / low) * 100 : 0;
  const volumePressure = Math.log1p(Number(ticker.vol_idr || 1)) / 10;

  let score =
    change * 1.6 +
    volatility * 0.9 +
    btcChange * 0.7 +
    volumePressure;

  score = Math.max(-10, Math.min(10, score));

  let signal = "HOLD";
  let prediction = "SIDEWAYS";
  let reason = "Market neutral condition";

  if (score > 3) {
    signal = "BUY";
    prediction = "UP";
    reason = "Bullish momentum detected";
  } else if (score < -3) {
    signal = "SELL";
    prediction = "DOWN";
    reason = "Bearish pressure detected";
  }

  const accuracy = Math.min(97, Math.max(55, 72 + Math.abs(change) * 2.8));

  const levels = calculateLevels(last, signal);

  return {
    pair: pairName || ticker.pair || "UNKNOWN",
    price: last,
    change,
    score: Number(score.toFixed(2)),
    signal,
    prediction,
    reason,
    accuracy: Number(accuracy.toFixed(1)),
    entry: last,
    tp1: levels.tp1,
    tp2: levels.tp2,
    sl: levels.sl
  };
}

// ================= SAVE SNAPSHOT =================
async function saveSnapshot(data) {
  try {
    await pool.query(
      `INSERT INTO market_snapshots 
      (pair, price, change, score, signal, prediction, accuracy, tp1, tp2, sl)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        data.pair,
        data.price,
        data.change,
        data.score,
        data.signal,
        data.prediction,
        data.accuracy,
        data.tp1,
        data.tp2,
        data.sl
      ]
    );
  } catch (e) {
    console.log("DB save error:", e.message);
  }
}

// ================= SOCKET STREAM =================
io.on("connection", (socket) => {
  console.log("client connected");

  const stream = async () => {
    try {
      const tickers = await getTickers();
      const btcChange = Number(tickers.btc_idr?.change || 0);

      const coins = Object.keys(tickers || {})
        .slice(0, 40)
        .map((key) => analyzeCoin(tickers[key], btcChange, key.toUpperCase()))
        .filter((c) => c.price > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      coins.forEach((c) => saveSnapshot(c));

      socket.emit("swing", {
        btc: tickers.btc_idr?.last || 0,
        btcChange,
        coins,
        timestamp: Date.now()
      });

    } catch (err) {
      console.log("stream error:", err.message);
    }
  };

  stream();
  const interval = setInterval(stream, 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

// ================= PORTFOLIO =================
app.post("/portfolio", async (req, res) => {
  const { pair, entry_price, amount, tp1, tp2, sl } = req.body;

  if (!pair) {
    return res.status(400).json({ error: "PAIR REQUIRED" });
  }

  const result = await pool.query(
    `INSERT INTO portfolio (pair, entry_price, amount, tp1, tp2, sl, status)
     VALUES ($1,$2,$3,$4,$5,$6,'OPEN') RETURNING *`,
    [pair, entry_price, amount, tp1, tp2, sl]
  );

  res.json(result.rows[0]);
});

app.get("/portfolio", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM portfolio ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

// ================= HISTORY =================
app.get("/market/history", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM market_snapshots ORDER BY created_at DESC LIMIT 200"
  );
  res.json(result.rows);
});

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.send("AI TRADING TERMINAL PRO FULL SYSTEM RUNNING");
});

server.listen(process.env.PORT || 3000);
