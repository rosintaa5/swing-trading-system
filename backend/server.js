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
  console.log("Client connected");

  setInterval(() => {
    socket.emit("swing", {
      btc: Math.random() * 100000,
      coins: [
        { pair: "BTC/IDR", price: 1000000, signal: "BUY" },
        { pair: "ETH/IDR", price: 50000, signal: "SELL" }
      ]
    });
  }, 3000);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
