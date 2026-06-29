const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  },
  transports: ["polling", "websocket"]
});

// 🔥 AMBIL DATA INDODAX
async function getIndodaxTickers() {
  const res = await axios.get("https://indodax.com/api/tickers");
  return res.data.tickers;
}

// 🔥 SIMPLE SCORING ENGINE (SWING 1–3 HARI)
function calculateSignal(ticker) {
  const change = parseFloat(ticker.change);

  if (change > 5) return "STRONG BUY";
  if (change > 2) return "BUY";
  if (change < -5) return "STRONG SELL";
  if (change < -2) return "SELL";

  return "HOLD";
}

io.on("connection", (socket) => {
  console.log("client connected");

  const sendData = async () => {
    try {
      const tickers = await getIndodaxTickers();

      const coins = Object.keys(tickers)
        .slice(0, 10)
        .map((key) => {
          const t = tickers[key];

          return {
            pair: key.toUpperCase(),
            price: parseFloat(t.last),
            change: parseFloat(t.change),
            signal: calculateSignal(t)
          };
        });

      socket.emit("swing", {
        btc: tickers.btc_idr?.last,
        coins
      });
    } catch (err) {
      console.log(err.message);
    }
  };

  sendData();
  const interval = setInterval(sendData, 5000);

  socket.on("disconnect", () => clearInterval(interval));
});

app.get("/", (req, res) => {
  res.send("Indodax Swing Engine Running");
});

server.listen(process.env.PORT || 3000, () => {
  console.log("server running");
});
