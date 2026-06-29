import { io } from "socket.io-client";

export const socket = io(
  "https://confident-tranquility-production-ceaa.up.railway.app",
  {
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true
  }
);
