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
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

initDB();

// ================= API =================
const BASE = "https://indodax.com/api";

async function getTickers() {
  try {
    const res = await axios.get(`${BASE}/tickers`);
    return res.data.tickers || {};
  } catch {
    return {};
  }
}

// ================= CACHE =================
let cache = { tickers: {}, lastUpdate: 0 };

// ================= ANALYSIS =================
function analyzeCoin(t) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const change = parseFloat(t.change || 0);

  if (!price || vol < 100000000) return null;

  const whale = Math.log10(vol + 1);
  const momentum = change * 2;
  const liquidity = Math.log1p(vol) / 10;

  const score = whale * 2 + momentum + liquidity;

  let signal = "HOLD";
  if (score > 6) signal = "BUY";
  if (score < -6) signal = "SELL";

  return {
    price,
    vol,
    score,
    signal
  };
}

// ================= MARKET UPDATE =================
async function updateMarket() {
  if (Date.now() - cache.lastUpdate < 3000) return;

  cache.tickers = await getTickers();
  cache.lastUpdate = Date.now();
}

// ================= PORTFOLIO =================
async function getPortfolio() {
  const res = await pool.query(
    "SELECT * FROM portfolio_positions WHERE status='OPEN'"
  );
  return res.rows;
}

// FIX PNL
async function updatePortfolio(tickers) {
  const portfolio = await getPortfolio();

  for (const p of portfolio) {
    const t = tickers[p.pair.toLowerCase()];
    if (!t) continue;

    const price = parseFloat(t.last);
    const pnl = (price - p.entry_price) * p.amount;

    await pool.query(
      "UPDATE portfolio_positions SET pnl=$1 WHERE id=$2",
      [pnl, p.id]
    );
  }
}

// ================= BUY =================
app.post("/buy", async (req, res) => {
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
});

// ================= SELL =================
app.post("/sell", async (req, res) => {
  const { id } = req.body;

  await pool.query(
    "UPDATE portfolio_positions SET status='CLOSED' WHERE id=$1",
    [id]
  );

  res.json({ success: true });
});

// ================= STREAM =================
async function stream(socket) {
  try {
    await updateMarket();

    const tickers = cache.tickers;
    const results = [];

    Object.keys(tickers).forEach((k) => {
      const r = analyzeCoin(tickers[k]);
      if (r) results.push({ pair: k, ...r });
    });

    const top = results.sort((a, b) => b.score - a.score).slice(0, 10);

    if (top.length) {
      const values = [];
      const params = [];

      top.forEach((t, i) => {
        values.push(`($${i * 2 + 1},$${i * 2 + 2})`);
        params.push(t.pair, t.price);
      });

      await pool.query(
        `INSERT INTO market_snapshots (pair, price)
         VALUES ${values.join(",")}`,
        params
      );
    }

    await updatePortfolio(tickers);

    const btc = tickers["btc_idr"];

    socket.emit("v12_fixed", {
      btc: btc?.last || 0,
      btcChange: btc?.change || 0,
      top,
      portfolio: await getPortfolio(),
      timestamp: Date.now()
    });

  } catch (e) {
    console.log(e.message);
  }
}

// ================= SOCKET =================
io.on("connection", (socket) => {
  const interval = setInterval(() => stream(socket), 4000);
  socket.on("disconnect", () => clearInterval(interval));
});

// ================= SERVER =================
app.get("/", (req, res) => {
  res.json({ status: "OK" });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("RUNNING");
});
