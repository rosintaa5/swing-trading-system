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
  }
});

io.on("connection", (socket) => {
  console.log("client connected");

  socket.emit("swing", {
    btc: 65000,
    coins: [
      { pair: "BTC/IDR", price: 1000000, signal: "BUY" },
      { pair: "ETH/IDR", price: 50000, signal: "SELL" }
    ]
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("server running on", PORT);
});
