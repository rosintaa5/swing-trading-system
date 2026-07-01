const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

const BASE = "https://indodax.com/api";

// ================= CACHE =================
let cache = { tickers: {} };
let lastEmit = 0;

// ================= FETCH TICKERS =================
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

// ================= SIMPLE ANALYSIS =================
function analyze(t) {
  const price = parseFloat(t.last || 0);
  const vol = parseFloat(t.vol_idr || 0);
  const change = parseFloat(t.change || 0);

  if (!price || !vol) return null;

  const score =
    Math.log10(vol + 1) * 2 +
    change * 2;

  let signal = "HOLD";
  if (score > 6) signal = "BUY";
  if (score < -6) signal = "SELL";

  return {
    price,
    vol,
    change,
    score,
    signal
  };
}

// ================= STREAM ENGINE =================
async function stream(socket) {
  try {
    const now = Date.now();

    // throttle 3 detik
    if (now - lastEmit < 3000) return;
    lastEmit = now;

    const tickers = await getTickers();

    const keys = Object.keys(tickers);

    const results = keys
      .map((k) => {
        const r = analyze(tickers[k]);
        if (!r) return null;
        return { pair: k, ...r };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // 🔴 DEBUG WAJIB
    console.log("EMIT TOP:", results.length);

    socket.emit("v14_engine", {
      top: results,
      time: Date.now()
    });

  } catch (e) {
    console.log("STREAM ERROR:", e.message);
  }
}

// ================= SOCKET =================
io.on("connection", (socket) => {
  console.log("CLIENT CONNECTED");

  const interval = setInterval(() => stream(socket), 3000);

  socket.on("disconnect", () => {
    clearInterval(interval);
  });
});

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.json({ ok: true });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("BACKEND READY");
});
