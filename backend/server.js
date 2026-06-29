const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  },
  transports: ["websocket", "polling"]
});

io.on("connection", (socket) => {
  console.log("client connected");

  socket.emit("swing", {
    btc: 65000,
    coins: [
      { pair: "BTC/USDT", price: 65000, signal: "BUY" },
      { pair: "ETH/USDT", price: 3200, signal: "SELL" }
    ]
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("server running");
});
