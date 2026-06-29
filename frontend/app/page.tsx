"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>({
    coins: [],
    btc: "-",
    btcChange: 0,
    regime: "UNKNOWN"
  });

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () => {
      console.log("socket connected");
      setConnected(true);
    });

    socket.on("swing", (res) => {
      console.log("DATA:", res);

      // SAFE GUARD (ANTI NULL CRASH)
      setData({
        btc: res?.btc ?? "-",
        btcChange: res?.btcChange ?? 0,
        regime: res?.regime ?? "UNKNOWN",
        coins: Array.isArray(res?.coins) ? res.coins : []
      });
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    return () => {
      socket.off("connect");
      socket.off("swing");
      socket.off("disconnect");
    };
  }, []);

  return (
    <div style={{ padding: 20, background: "#0a0f1c", minHeight: "100vh", color: "#fff" }}>
      
      <h2>🚀 AI SWING V3</h2>

      <p>
        Status:{" "}
        <b style={{ color: connected ? "lime" : "red" }}>
          {connected ? "LIVE" : "OFFLINE"}
        </b>
      </p>

      <hr />

      <h3>BTC: {data.btc}</h3>
      <p>Market: {data.regime}</p>

      <hr />

      <h3>📊 COIN LIST</h3>

      {data.coins.length === 0 && (
        <p style={{ opacity: 0.6 }}>Waiting data...</p>
      )}

      {data.coins.map((c: any, i: number) => (
        <div key={i} style={{ margin: 10, padding: 10, border: "1px solid #333" }}>
          <b>{c.pair}</b>
          <div>Price: {c.price}</div>
          <div>Prob: {c.probability ?? c.score}</div>
          <div>Signal: {c.signal}</div>
        </div>
      ))}
    </div>
  );
}
