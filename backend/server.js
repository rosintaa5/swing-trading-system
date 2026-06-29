const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket"]
});

// =========================
// INDODAX API
// =========================
const BASE = "https://indodax.com/api";

async function getTickers() {
  const res = await axios.get(`${BASE}/tickers`);
  return res.data.tickers;
}

// =========================
// AI ENGINE PRO
// =========================
function analyzeCoin(ticker, btcChange) {
  const change = parseFloat(ticker.change || 0);
  const high = parseFloat(ticker.high || ticker.last);
  const low = parseFloat(ticker.low || ticker.last);

  const volatility = ((high - low) / low) * 100;

  let score =
    change * 1.5 +
    volatility * 0.8 +
    btcChange * 0.7;

  let signal = "HOLD";
  let reason = "Market sideways, no strong momentum.";

  if (score > 6) {
    signal = "BUY";
    reason = "Strong bullish momentum + volume expansion.";
  } else if (score > 2) {
    signal = "BUY";
    reason = "Positive trend forming.";
  } else if (score < -6) {
    signal = "SELL";
    reason = "Strong bearish pressure.";
  } else if (score < -2) {
    signal = "SELL";
    reason = "Downtrend detected.";
  }

  const prediction = score > 2 ? "UP" : score < -2 ? "DOWN" : "SIDEWAYS";

  const accuracy = Math.min(95, Math.max(55, 70 + Math.abs(change) * 2));

  return {
    score: Number(score.toFixed(2)),
    signal,
    reason,
    prediction,
    accuracy: Number(accuracy.toFixed(1))
  };
}

// =========================
// NEWS SIMULATION
// =========================
function getNews() {
  return [
    {
      title: "Bitcoin volatility increasing in Asian market session",
      impact: "HIGH"
    },
    {
      title: "Altcoin volume rising on Indodax exchange",
      impact: "MEDIUM"
    }
  ];
}

// =========================
// SOCKET ENGINE
// =========================
io.on("connection", (socket) => {
  console.log("client connected");

  const stream = async () => {
    try {
      const tickers = await getTickers();

      const btcChange = parseFloat(tickers.btc_idr?.change || 0);

      const coins = Object.keys(tickers)
        .slice(0, 20)
        .map((key) => {
          const t = tickers[key];

          const analysis = analyzeCoin(t, btcChange);

          return {
            pair: key.toUpperCase(),
            price: parseFloat(t.last),
            buy: parseFloat(t.low),
            sell: parseFloat(t.high),
            change: parseFloat(t.change),
            ...analysis
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      socket.emit("swing", {
        btc: tickers.btc_idr?.last,
        btcChange,
        coins,
        news: getNews()
      });

    } catch (err) {
      console.log(err.message);
    }
  };

  stream();
  const interval = setInterval(stream, 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

// =========================
app.get("/", (req, res) => {
  res.send("AI Trading Terminal PRO Running");
});

server.listen(process.env.PORT || 3000);
