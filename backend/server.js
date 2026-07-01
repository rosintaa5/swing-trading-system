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
const io = new Server(server, { cors: { origin: "*" }, transports: ["websocket", "polling"] });

// ================= DB CONNECTION =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= INITIALIZE DB =================
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
    console.log("Database Portfolio Ready!");
  } catch (err) {
    console.error("DB Init Error:", err.message);
  }
}
initDB();

// ================= MARKET CACHE =================
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

// ================= ADVANCED AI & QUANT ENGINE =================
function analyzeCoin(t, pairName) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const high = parseFloat(t.high || price);
  const low = parseFloat(t.low || price);
  const buy_price = parseFloat(t.buy || price);
  const sell_price = parseFloat(t.sell || price);
  const change = t.change ? parseFloat(t.change) : ((high - low) / (low || 1)) * 100;

  // Filter keras: Buang koin mati, volume di bawah 100 juta IDR, atau data tidak valid
  if (!price || vol < 100000000 || high === low) return null;

  // 1. Whale & Volume Score (Logaritmik)
  const whale_score = Math.min(10, Math.max(0, Math.log10(vol + 1) - 4));
  
  // 2. Momentum Score (Percepatan Perubahan)
  const momentum_score = Math.min(10, Math.max(0, (change * 2) + 5));

  // 3. Volatility Index (Rentang pergerakan Harian)
  const volatility = ((high - low) / low) * 100;
  const vola_score = Math.min(10, volatility / 2);

  // 4. Spread Analysis (Friksi Pasar / Slippage) - Semakin kecil semakin bagus
  const spread_pct = ((sell_price - buy_price) / buy_price) * 100;
  const spread_penalty = spread_pct > 2 ? 5 : spread_pct > 1 ? 2 : 0; // Penalti jika spread lebar

  // 5. Stochastic Proxy / Buying Pressure (Dimana harga closing relatif thd high-low hari ini)
  // 0% = Berada di titik terendah (Bearish kuat) | 100% = Berada di puncak tertinggi (Bullish kuat)
  const buying_pressure = ((price - low) / (high - low)) * 100;
  let pressure_score = 0;
  if (buying_pressure > 80) pressure_score = 3; // Breakout territory
  else if (buying_pressure < 20) pressure_score = 4; // Oversold (Potensi mantul)
  else pressure_score = 1; // Sideways

  // ================= DYNAMIC NARRATIVE ENGINE =================
  let news_headline = "Konsolidasi normal. Aksi beli dan jual seimbang.";
  let news_impact = "NEUTRAL";
  let impact_desc = "Harga bergerak stabil dalam rentang rata-rata.";

  if (spread_penalty >= 5) {
    news_headline = "Peringatan Likuiditas! Orderbook sangat tipis.";
    news_impact = "BEARISH";
    impact_desc = "Risiko slippage (kerugian instan saat beli) sangat tinggi. Hindari.";
  } else if (whale_score > 7 && buying_pressure > 85) {
    news_headline = "Breakout Alert: Institusi mendorong harga menembus resisten.";
    news_impact = "BULLISH";
    impact_desc = "Tekanan beli mendominasi di pucuk, potensi rally lanjutan sangat kuat.";
  } else if (whale_score > 6 && buying_pressure < 20 && change < -3) {
    news_headline = "Fase Oversold: Terjadi panic selling masif di pasar retail.";
    news_impact = "BULLISH";
    impact_desc = "Indikator oversold. Potensi pantulan (Dead Cat Bounce) atau reversal.";
  } else if (change < -7) {
    news_headline = "Aksi distribusi dan Take Profit besar-besaran berlangsung.";
    news_impact = "BEARISH";
    impact_desc = "Tekanan jual menembus batas support harian. Waspada koreksi dalam.";
  }

  // ================= SCORING FORMULA =================
  const score = (whale_score * 2) + momentum_score + vola_score + pressure_score - spread_penalty + (news_impact === "BULLISH" ? 2 : news_impact === "BEARISH" ? -3 : 0);
  
  let signal = "HOLD";
  if (score >= 18) signal = "STRONG BUY";
  else if (score > 12) signal = "BUY";
  else if (score < 6) signal = "SELL";

  return { 
    price, vol, change, score, signal, news_headline, news_impact, impact_desc,
    technicals: {
      spread: spread_pct.toFixed(2),
      buying_pressure: buying_pressure.toFixed(0),
      volatility: volatility.toFixed(1)
    }
  };
}

// ================= API ENDPOINTS =================
app.get("/portfolio", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/buy", async (req, res) => {
  const { pair, entry_price, target_tp, target_sl, news_headline, news_impact } = req.body;
  try {
    const amount = 1; 
    await pool.query(
      `INSERT INTO portfolio_positions (pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')`,
      [pair, entry_price, amount, target_tp, target_sl, news_headline, news_impact]
    );
    res.json({ success: true, message: "Berhasil masuk portofolio!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/sell", async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("DELETE FROM portfolio_positions WHERE id=$1", [id]);
    res.json({ success: true, message: "Koin terjual." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= WEBSOCKET WORKER =================
async function streamWorker(socket) {
  try {
    await updateMarket();
    const tickers = cache.tickers;
    const results = [];

    Object.keys(tickers).forEach((k) => {
      const r = analyzeCoin(tickers[k], k);
      if (r) results.push({ pair: k, ...r });
    });

    // Sortir berdasarkan skor kualitatif tertinggi
    const top = results.sort((a, b) => b.score - a.score).slice(0, 15); 

    const openPositions = await pool.query("SELECT id, pair, entry_price, amount FROM portfolio_positions WHERE status='OPEN'");
    for (const p of openPositions.rows) {
      const t = tickers[p.pair];
      if (t) {
        const pnl = (parseFloat(t.last) - p.entry_price) * p.amount;
        await pool.query("UPDATE portfolio_positions SET pnl=$1 WHERE id=$2", [pnl, p.id]);
      }
    }

    const portfolio = await pool.query("SELECT * FROM portfolio_positions WHERE status='OPEN' ORDER BY id DESC");

    socket.emit("market_data", {
      btc: tickers["btc_idr"]?.last || 0,
      top,
      portfolio: portfolio.rows
    });
  } catch (e) {
    console.error("Stream Error:", e.message);
  }
}

io.on("connection", (socket) => {
  const interval = setInterval(() => streamWorker(socket), 3000);
  socket.on("disconnect", () => clearInterval(interval));
});

server.listen(process.env.PORT || 3000, () => console.log("ADVANCED ENGINE READY"));
