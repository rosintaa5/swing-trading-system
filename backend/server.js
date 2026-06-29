const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();

app.use(cors({
  origin: "*"
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket"]
});

// =========================
// INDODAX DATA FETCH
// =========================
async function getTickers() {
  const res = await axios.get("https://indodax.com/api/tickers");
  return res.data.tickers;
}

// =========================
// AI SCORE V2 ENGINE
// =========================
function calculateAIScore(ticker, btcChange = 0) {
  const change = parseFloat(ticker.change || 0);
  const high = parseFloat(ticker.high || ticker.last);
  const low = parseFloat(ticker.low || ticker.last);

  const momentum = change;
  const volatility = ((high - low) / low) * 100;
  const btcFactor = btcChange * 0.8;
  const volumePressure = volatility * 0.6;
  const trendStability = change > 0 ? change * 0.5 : change * 0.5;

  const score =
    (momentum * 0.35) +
    (volatility * 0.20) +
    (btcFactor * 0.20) +
    (volumePressure * 0.15) +
    (trendStability * 0.10);

  return Number(score.toFixed(2));
}

// =========================
// SIGNAL ENGINE
// =========================
function getSignal(score) {
  if (score >= 7) return "🔥 STRONG BUY";
  if (score >= 3) return "BUY";
  if (score <= -7) return "🚨 STRONG SELL";
  if (score <= -3) return "SELL";
  return "NEUTRAL";
}

// =========================
// SOCKET ENGINE
// =========================
io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  const sendData = async () => {
    try {
      const tickers = await getTickers();

      const btcChange = parseFloat(tickers.btc_idr?.change || 0);

      const coins = Object.keys(tickers)
        .slice(0, 20)
        .map((key) => {
          const t = tickers[key];

          const score = calculateAIScore(t, btcChange);

          return {
            pair: key.toUpperCase(),
            price: parseFloat(t.last),
            change: parseFloat(t.change),
            score,
            signal: getSignal(score)
          };
        })
        .sort((a, b) => b.score - a.score);

      socket.emit("swing", {
        btc: tickers.btc_idr?.last,
        coins
      });

    } catch (err) {
      console.log("error:", err.message);
    }
  };

  sendData();
  const interval = setInterval(sendData, 5000);

  socket.on("disconnect", () => clearInterval(interval));
});

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.send("AI Swing Engine V2 Running");
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("server running on", PORT);
});
