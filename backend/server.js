//////////////////////////////
// CORE DEPENDENCIES
//////////////////////////////
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

//////////////////////////////
// INIT APP
//////////////////////////////
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

//////////////////////////////
// SOCKET SETUP
//////////////////////////////
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

//////////////////////////////
// DATABASE
//////////////////////////////
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

//////////////////////////////
// INIT TABLES (SAFE)
//////////////////////////////
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

  console.log("DB READY");
}

initDB();

//////////////////////////////
// INDODAX BASE
//////////////////////////////
const BASE = "https://indodax.com/api";

//////////////////////////////
// GLOBAL CACHE SYSTEM
//////////////////////////////
let cache = {
  tickers: {},
  lastUpdate: 0
};

// cache order book (biar tidak spam API)
const ORDER_BOOK_CACHE = {};

// cache trades flow
const TRADES_CACHE = {};

// lock stream agar tidak overlap
let streamLock = false;

//////////////////////////////
// UTILS SAFE
//////////////////////////////

// convert aman ke number
const num = (v) => parseFloat(v || 0);

// normalisasi pair (btc_idr format wajib)
const normalizePair = (p) => {
  if (!p) return null;
  return p.toLowerCase().replace("/", "_").replace("-", "_").trim();
};

//////////////////////////////
// FETCH TICKERS
//////////////////////////////
async function getTickers() {
  try {
    const res = await axios.get(`${BASE}/tickers`, { timeout: 8000 });

    if (!res.data?.tickers) return {};

    return res.data.tickers;

  } catch (e) {
    console.log("TICKER ERROR:", e.message);
    return {};
  }
}

//////////////////////////////
// FETCH ORDER BOOK (DEPTH)
//////////////////////////////
async function getOrderBook(pair) {
  try {
    const norm = normalizePair(pair);

    const res = await axios.get(`${BASE}/depth/${norm}`, {
      timeout: 8000
    });

    return res.data || null;

  } catch {
    return null;
  }
}

//////////////////////////////
// FETCH TRADES (NEW IMPORTANT API)
//////////////////////////////
async function getTrades(pair) {
  try {
    const norm = normalizePair(pair);

    const res = await axios.get(`${BASE}/trades/${norm}`, {
      timeout: 8000
    });

    if (!Array.isArray(res.data)) return [];

    return res.data;

  } catch {
    return [];
  }
}

//////////////////////////////
// ORDER BOOK ANALYSIS
//////////////////////////////
function analyzeOrderBook(depth) {
  try {
    if (!depth?.buy || !depth?.sell) return null;

    const buyVolume = depth.buy.reduce((a, v) => a + num(v[1]), 0);
    const sellVolume = depth.sell.reduce((a, v) => a + num(v[1]), 0);

    const total = buyVolume + sellVolume;
    if (!total) return null;

    const imbalance = (buyVolume - sellVolume) / total;

    let signal = "NEUTRAL";
    if (imbalance > 0.25) signal = "BUY_PRESSURE";
    if (imbalance < -0.25) signal = "SELL_PRESSURE";

    return {
      buyVolume,
      sellVolume,
      imbalance,
      signal
    };

  } catch {
    return null;
  }
}

//////////////////////////////
// TRADES FLOW ANALYSIS
//////////////////////////////
function analyzeTrades(trades = []) {
  try {
    let buy = 0;
    let sell = 0;

    for (const t of trades) {
      const amount = num(t.amount);

      if (t.type === "buy") buy += amount;
      else sell += amount;
    }

    const total = buy + sell;
    if (!total) return null;

    const imbalance = (buy - sell) / total;

    let signal = "NEUTRAL";
    if (imbalance > 0.2) signal = "BUY_FLOW";
    if (imbalance < -0.2) signal = "SELL_FLOW";

    return {
      buy,
      sell,
      imbalance,
      signal
    };

  } catch {
    return null;
  }
}

//////////////////////////////
// MAIN MARKET ENGINE
//////////////////////////////
function analyzeCoin(t, ob, tf) {
  try {
    const price = num(t.last);
    const vol = num(t.vol_idr);
    const change = num(t.change);

    if (!price || !vol || vol < 100000000) return null;

    // MARKET STRUCTURE SCORE
    const whale = Math.log10(vol + 1);
    const momentum = change * 2;
    const liquidity = Math.log1p(vol) / 10;

    // ORDER BOOK CONTRIBUTION
    let obScore = ob?.imbalance ? ob.imbalance * 5 : 0;

    // TRADES FLOW CONTRIBUTION
    let tfScore = tf?.imbalance ? tf.imbalance * 5 : 0;

    const score =
      whale * 2 +
      momentum * 1.5 +
      liquidity +
      obScore +
      tfScore;

    let signal = "HOLD";

    if (score > 6 || ob?.signal === "BUY_PRESSURE" || tf?.signal === "BUY_FLOW") {
      signal = "BUY";
    }

    if (score < -6 || ob?.signal === "SELL_PRESSURE" || tf?.signal === "SELL_FLOW") {
      signal = "SELL";
    }

    return {
      price,
      vol,
      change,
      score,
      signal,
      orderBook: ob,
      tradesFlow: tf
    };

  } catch {
    return null;
  }
}

//////////////////////////////
// MARKET CACHE UPDATE
//////////////////////////////
async function updateMarket() {
  const now = Date.now();

  if (now - cache.lastUpdate < 3000) return;

  cache.tickers = await getTickers();
  cache.lastUpdate = now;
}

//////////////////////////////
// PORTFOLIO
//////////////////////////////
async function getPortfolio() {
  const res = await pool.query(
    "SELECT * FROM portfolio_positions WHERE status='OPEN'"
  );
  return res.rows;
}

async function updatePortfolio(market, portfolio) {
  let equity = 0;

  const updates = portfolio.map((p) => {
    const price = num(market[normalizePair(p.pair)]?.last);

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

//////////////////////////////
// STREAM ENGINE (CORE LOGIC)
//////////////////////////////
async function stream(socket) {
  if (streamLock) return;
  streamLock = true;

  try {
    await updateMarket();

    const tickers = cache.tickers;
    const keys = Object.keys(tickers || {});

    const results = await Promise.all(
      keys.map(async (k) => {

        const ticker = tickers[k];

        //////////////////////////////
        // ORDER BOOK CACHE (5 DETIK)
        //////////////////////////////
        let ob = ORDER_BOOK_CACHE[k];

        if (!ob || Date.now() - ob.time > 5000) {
          const depth = await getOrderBook(k);
          const obSignal = analyzeOrderBook(depth);

          ORDER_BOOK_CACHE[k] = {
            data: obSignal,
            time: Date.now()
          };
        }

        //////////////////////////////
        // TRADES CACHE (5 DETIK)
        //////////////////////////////
        let tf = TRADES_CACHE[k];

        if (!tf || Date.now() - tf.time > 5000) {
          const trades = await getTrades(k);
          const tfSignal = analyzeTrades(trades);

          TRADES_CACHE[k] = {
            data: tfSignal,
            time: Date.now()
          };
        }

        const r = analyzeCoin(
          ticker,
          ORDER_BOOK_CACHE[k]?.data,
          TRADES_CACHE[k]?.data
        );

        return r ? { pair: k, ...r } : null;
      })
    );

    const filtered = results.filter(Boolean);

    const ranked = filtered.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, 10);

    //////////////////////////////
    // SAVE SNAPSHOT SAFE
    //////////////////////////////
    if (top.length > 0) {
      const values = [];
      const params = [];

      top.forEach((t, i) => {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(t.pair, t.price);
      });

      await pool.query(
        `INSERT INTO market_snapshots (pair, price)
         VALUES ${values.join(",")}`,
        params
      );
    }

    const portfolio = await getPortfolio();
    const equity = await updatePortfolio(tickers, portfolio);

    socket.emit("v14_engine", {
      equity,
      portfolio,
      top,
      timestamp: Date.now()
    });

  } catch (e) {
    console.log("STREAM ERROR:", e.message);
  } finally {
    streamLock = false;
  }
}

//////////////////////////////
// SOCKET HANDLER
//////////////////////////////
io.on("connection", (socket) => {
  console.log("CLIENT CONNECTED");

  const interval = setInterval(() => stream(socket), 4000);

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

//////////////////////////////
// HEALTH CHECK
//////////////////////////////
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    system: "INDODAX V14 SMART FLOW ENGINE"
  });
});

//////////////////////////////
// START SERVER
//////////////////////////////
server.listen(process.env.PORT || 3000, () => {
  console.log("SYSTEM READY");
});
