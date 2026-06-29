const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["polling", "websocket"]
});

// =========================
// INDODAX API LAYER
// =========================
const BASE = "https://indodax.com/api";

async function getTickers() {
  return (await axios.get(`${BASE}/tickers`)).data.tickers;
}

async function getSummaries() {
  return (await axios.get(`${BASE}/summaries`)).data.tickers;
}

// =========================
// ADVANCED MARKET ANALYSIS
// =========================
function computeScore(t, btcChange) {
  const change = parseFloat(t.change || 0);
  const high = parseFloat(t.high || t.last);
  const low = parseFloat(t.low || t.last);
  const last = parseFloat(t.last);

  const volatility = ((high - low) / low) * 100;

  // liquidity proxy
  const liquidityScore = volatility * 0.4;

  // momentum
  const momentum = change * 1.3;

  // BTC influence
  const btcImpact = btcChange * 0.9;

  // trend strength
  const trend = Math.tanh(change) * 10;

  // FINAL SCORE
  return (
    momentum +
    liquidityScore +
    btcImpact +
    trend
  );
}

// =========================
// SIGNAL ENGINE
// =========================
function signal(score) {
  if (score > 8) return "🔥 STRONG BUY";
  if (score > 3) return "BUY";
  if (score < -8) return "🚨 STRONG SELL";
  if (score < -3) return "SELL";
  return "NEUTRAL";
}

// =========================
// SOCKET STREAM
// =========================
io.on("connection", (socket) => {
  console.log("client connected");

  const stream = async () => {
    try {
      const tickers = await getTickers();
      const summaries = await getSummaries();

      const btc = tickers.btc_idr;
      const btcChange = parseFloat(btc?.change || 0);

      const coins = Object.keys(tickers)
        .slice(0, 30)
        .map((key) => {
          const t = tickers[key];

          const score = computeScore(t, btcChange);

          const summary = summaries[key];

          return {
            pair: key.toUpperCase(),
            price: parseFloat(t.last),
            high: parseFloat(t.high),
            low: parseFloat(t.low),
            change: parseFloat(t.change),
            volume: summary?.vol_idr || 0,
            score: Number(score.toFixed(2)),
            signal: signal(score)
          };
        })
        .sort((a, b) => b.score - a.score);

      socket.emit("swing", {
        btc: btc?.last,
        btcChange,
        marketCap: "INDODAX",
        coins
      });

    } catch (e) {
      console.log(e.message);
    }
  };

  stream();
  const interval = setInterval(stream, 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

app.get("/", (req, res) => {
  res.send("INDODAX PRO TRADING ENGINE ACTIVE");
});

server.listen(process.env.PORT || 3000);
