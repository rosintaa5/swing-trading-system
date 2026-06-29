import { io } from "socket.io-client";

export const socket = io(
  "https://confident-tranquility-production-ceaa.up.railway.app",
  {
    transports: ["polling", "websocket"],
    withCredentials: false
  }
);
