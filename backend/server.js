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
// FETCH MARKET DATA
// =========================
async function getTickers() {
  const res = await axios.get("https://indodax.com/api/tickers");
  return res.data.tickers;
}

// =========================
// BTC MARKET REGIME
// =========================
function getMarketRegime(btcChange) {
  if (btcChange > 2) return "BULLISH";
  if (btcChange < -2) return "BEARISH";
  return "SIDEWAYS";
}

// =========================
// AI V3 PREDICTION ENGINE
// =========================
function predictProbability(ticker, btcChange) {
  const change = parseFloat(ticker.change || 0);
  const high = parseFloat(ticker.high || ticker.last);
  const low = parseFloat(ticker.low || ticker.last);

  const volatility = ((high - low) / low) * 100;

  const trendMomentum = change;
  const breakoutPower = volatility * 0.7;
  const meanReversion = -change * 0.4;

  const btcInfluence = btcChange * 0.9;

  // FINAL PROBABILITY SCORE (-100 to +100)
  const rawScore =
    (trendMomentum * 1.5) +
    (breakoutPower * 0.8) +
    (meanReversion) +
    (btcInfluence);

  return Math.max(-100, Math.min(100, rawScore));
}

// =========================
// SIGNAL ENGINE V3
// =========================
function getSignalV3(score) {
  if (score >= 60) return "🔥 STRONG BUY";
  if (score >= 25) return "BUY";
  if (score <= -60) return "🚨 STRONG SELL";
  if (score <= -25) return "SELL";
  return "NEUTRAL";
}

// =========================
// CONFIDENCE LEVEL
// =========================
function getConfidence(score) {
  return Math.min(100, Math.abs(score)).toFixed(0);
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
      const regime = getMarketRegime(btcChange);

      const coins = Object.keys(tickers)
        .slice(0, 25)
        .map((key) => {
          const t = tickers[key];

          const score = predictProbability(t, btcChange);

          return {
            pair: key.toUpperCase(),
            price: parseFloat(t.last),
            change: parseFloat(t.change),
            probability: Number(score.toFixed(2)),
            confidence: getConfidence(score),
            signal: getSignalV3(score),
            regime
          };
        })
        .sort((a, b) => Math.abs(b.probability) - Math.abs(a.probability));

      socket.emit("swing", {
        btc: tickers.btc_idr?.last,
        btcChange,
        regime,
        coins
      });

    } catch (err) {
      console.log(err.message);
    }
  };

  sendData();
  const interval = setInterval(sendData, 4000);

  socket.on("disconnect", () => clearInterval(interval));
});

app.get("/", (req, res) => {
  res.send("AI Swing V3 Prediction Engine Running");
});

server.listen(process.env.PORT || 3000, () => {
  console.log("server running");
});
