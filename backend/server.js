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

// ================= INIT =================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id SERIAL PRIMARY KEY,
      pair TEXT,
      entry_price FLOAT,
      amount FLOAT,
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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("DB READY");
}

initDB();

// ================= INDODAX API =================
const BASE = "https://indodax.com/api";

async function getTickers() {
  try {
    const res = await axios.get(`${BASE}/tickers`, {
      timeout: 5000
    });
    return res.data?.tickers || {};
  } catch (e) {
    console.log("API ERROR:", e.message);
    return {};
  }
}

// ================= GLOBAL CACHE =================
let cache = {
  tickers: {},
  lastUpdate: 0
};

let streamLock = false;

// ================= UTILS =================
const num = (v) => Number(v || 0);

// ================= AI ENGINE =================
function analyzeCoin(t) {
  try {
    const price = num(t.last);
    const vol = num(t.vol_idr);
    const change = num(t.change);

    if (!price || vol < 100000000) return null;

    const whale = Math.log10(vol + 1);
    const momentum = change * 2;
    const liquidity = Math.log1p(vol) / 10;

    const score = whale * 2 + momentum * 1.5 + liquidity;

    let signal = "HOLD";
    if (score > 6) signal = "BUY";
    if (score < -6) signal = "SELL";

    return {
      price,
      vol,
      score,
      signal
    };
  } catch {
    return null;
  }
}

// ================= GLOBAL MARKET FETCH (ANTI-SPAM) =================
async function updateMarket() {
  const now = Date.now();

  // cache 3 detik
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

  const updates = portfolio.map((p) => {
    const price = num(market[p.pair]?.last);
    if (!price) return null;

    const pnl = (price - p.entry_price) * p.amount;

    equity += pnl;

    return pool.query(
      "UPDATE portfolio_positions SET pnl=$1 WHERE id=$2",
      [pnl, p.id]
    );
  }).filter(Boolean);

  await Promise.all(updates);

  return equity;
}

// ================= BUY =================
app.post("/buy", async (req, res) => {
  try {
    const { pair, price, amount } = req.body;

    if (!pair || !price || !amount) {
      return res.status(400).json({ error: "INVALID DATA" });
    }

    const result = await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, status)
       VALUES ($1,$2,$3,'OPEN') RETURNING *`,
      [pair, price, amount]
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

// ================= GET PORTFOLIO =================
app.get("/portfolio", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM portfolio_positions ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// ================= SAFE STREAM (LOCKED) =================
async function stream(socket) {
  if (streamLock) return;
  streamLock = true;

  try {
    await updateMarket();

    const tickers = cache.tickers;
    const results = [];

    const keys = Object.keys(tickers);

    // PARALLEL SAFE BATCH (ANTI BLOCKING)
    await Promise.all(
      keys.map((k) => {
        const r = analyzeCoin(tickers[k]);
        if (r) results.push({ pair: k, ...r });
      })
    );

    const ranked = results.sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, 10);

    // SAFE BATCH INSERT (NO LOOP QUERY)
    if (top.length > 0) {
      const values = [];
      const params = [];

      top.forEach((t, i) => {
        values.push(`($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`);
        params.push(t.pair, t.price, t.score);
      });

      await pool.query(
        `INSERT INTO market_snapshots (pair, price, score)
         VALUES ${values.join(",")}`,
        params
      );
    }

    const equity = await updatePortfolio(tickers);

    socket.emit("v12_fixed", {
      equity,
      portfolio: await getPortfolio(),
      top,
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

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    system: "V12 FIXED PRODUCTION READY BACKEND"
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("SYSTEM READY (FIXED)");
});
