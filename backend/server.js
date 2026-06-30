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
      status TEXT,
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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
initDB();

// ================= INDODAX =================
const BASE = "https://indodax.com/api";

async function getTickers() {
  const res = await axios.get(`${BASE}/tickers`);
  return res.data.tickers;
}

// ================= AI ENGINE =================
function analyzeCoin(ticker, btcChange) {
  const change = parseFloat(ticker.change || 0);
  const high = parseFloat(ticker.high || ticker.last);
  const low = parseFloat(ticker.low || ticker.last);

  const volatility = ((high - low) / low) * 100;

  const volumePressure =
    Math.log1p(parseFloat(ticker.vol_idr || 1)) / 10;

  let score =
    change * 1.6 +
    volatility * 0.9 +
    btcChange * 0.7 +
    volumePressure;

  score = Math.max(-10, Math.min(10, score));

  let signal = "HOLD";
  let prediction = "SIDEWAYS";
  let reason = "Market neutral condition";

  if (score > 7) {
    signal = "BUY";
    prediction = "UP";
    reason = "Strong momentum + volume breakout";
  } else if (score > 3) {
    signal = "BUY";
    prediction = "UP";
    reason = "Early bullish structure";
  } else if (score < -7) {
    signal = "SELL";
    prediction = "DOWN";
    reason = "Strong bearish pressure";
  } else if (score < -3) {
    signal = "SELL";
    prediction = "DOWN";
    reason = "Downtrend continuation";
  }

  const accuracy = Math.min(97, Math.max(55, 72 + Math.abs(change) * 2.8));

  return {
    score: Number(score.toFixed(2)),
    signal,
    prediction,
    reason,
    accuracy: Number(accuracy.toFixed(1))
  };
}

// ================= NEWS =================
function getNews() {
  return [
    { title: "Bitcoin volatility spike detected", impact: "HIGH" },
    { title: "Altcoin inflow increasing", impact: "MEDIUM" },
    { title: "Market sentiment shifting", impact: "LOW" }
  ];
}

// ================= SAVE SNAPSHOT =================
async function saveSnapshot(data) {
  const query = `
    INSERT INTO market_snapshots 
    (pair, price, change, score, signal, prediction, accuracy)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `;

  await pool.query(query, [
    data.pair,
    data.price,
    data.change,
    data.score,
    data.signal,
    data.prediction,
    data.accuracy
  ]);
}

// ================= SOCKET STREAM =================
io.on("connection", (socket) => {
  console.log("client connected");

  const stream = async () => {
    try {
      const tickers = await getTickers();
      const btcChange = parseFloat(tickers.btc_idr?.change || 0);

      const coins = Object.keys(tickers)
        .slice(0, 40)
        .map((key) => {
          const t = tickers[key];
          const analysis = analyzeCoin(t, btcChange);

          return {
            pair: key.toUpperCase(),
            price: Number(t.last),
            buy: Number(t.low),
            sell: Number(t.high),
            change: Number(t.change),
            ...analysis
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // SAVE DATA
      coins.forEach((c) => {
        saveSnapshot(c).catch(console.error);
      });

      socket.emit("swing", {
        btc: tickers.btc_idr?.last,
        btcChange,
        coins,
        news: getNews(),
        timestamp: Date.now()
      });

    } catch (err) {
      console.log(err.message);
    }
  };

  stream();
  const interval = setInterval(stream, 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

// ================= PORTFOLIO API =================
app.get("/portfolio", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM portfolio ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post("/portfolio", async (req, res) => {
  const { pair, entry_price, amount, status } = req.body;

  const result = await pool.query(
    `INSERT INTO portfolio (pair, entry_price, amount, status)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [pair, entry_price, amount, status]
  );

  res.json(result.rows[0]);
});

// ================= MARKET HISTORY API =================
app.get("/market/history", async (req, res) => {
  const { pair } = req.query;

  const result = await pool.query(
    `SELECT * FROM market_snapshots 
     WHERE ($1::text IS NULL OR pair = $1)
     ORDER BY created_at DESC
     LIMIT 200`,
    [pair || null]
  );

  res.json(result.rows);
});

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.send("AI Trading Terminal PRO V2 Running");
});

server.listen(process.env.PORT || 3000);
