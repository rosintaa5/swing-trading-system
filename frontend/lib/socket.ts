import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://confident-tranquility-production-ceaa.up.railway.app";

export const socket = io(API_URL, {
  transports: ["websocket", "polling"],
  withCredentials: true,
  autoConnect: false,
});
