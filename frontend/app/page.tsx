"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

const socket = io(API, {
  transports: ["websocket", "polling"]
});

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  // ================= SOCKET =================
  useEffect(() => {
    socket.on("connect", () => {
      console.log("SOCKET CONNECTED");
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("v14_engine", (res) => {
      console.log("DATA MASUK:", res);
      setData(res);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("v14_engine");
    };
  }, []);

  // ================= SAFE DATA =================
  const coins = useMemo(() => {
    return Array.isArray(data?.top) ? data.top : [];
  }, [data]);

  return (
    <div style={{ padding: 20, background: "#0b1220", color: "white", minHeight: "100vh" }}>

      <h2>AI TRADING TERMINAL</h2>

      {/* STATUS */}
      <div style={{ marginBottom: 20 }}>
        STATUS: {connected ? "LIVE" : "OFFLINE"}
      </div>

      {/* DEBUG INFO */}
      <div style={{ marginBottom: 20 }}>
        COINS LOADED: {coins.length}
      </div>

      {/* EMPTY STATE FIX */}
      {coins.length === 0 && (
        <div style={{ padding: 20, background: "#111827" }}>
          NO DATA RECEIVED - CHECK SOCKET / BACKEND
        </div>
      )}

      {/* MARKET LIST */}
      <div style={{ display: "grid", gap: 10 }}>
        {coins.map((c: any, i: number) => (
          <div key={i} style={{ background: "#111827", padding: 10 }}>
            <b>{c.pair}</b>
            <div>PRICE: {c.price}</div>
            <div>SCORE: {c.score?.toFixed?.(2)}</div>
            <div>SIGNAL: {c.signal}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
