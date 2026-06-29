const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

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
  transports: ["polling", "websocket"],
  allowEIO3: true
});

io.on("connection", (socket) => {
  console.log("client connected:", socket.id);

  socket.emit("swing", {
    btc: 65000,
    coins: [
      { pair: "BTC/USDT", price: 65000, signal: "BUY" },
      { pair: "ETH/USDT", price: 3200, signal: "SELL" }
    ]
  });
});

app.get("/", (req, res) => {
  res.send("Socket server running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("server running on", PORT);
});
