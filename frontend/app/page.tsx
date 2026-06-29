"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("swing", setData);

    return () => socket.off();
  }, []);

  return (
    <div style={{ background: "#070b14", minHeight: "100vh", padding: 20, color: "#fff" }}>

      {/* HEADER */}
      <h2>📊 AI TRADING TERMINAL PRO</h2>
      <p>Status: {connected ? "🟢 LIVE" : "🔴 OFFLINE"}</p>

      {/* BTC PANEL */}
      <div style={{ background: "#111827", padding: 15, borderRadius: 10 }}>
        <h3>BTC PRICE</h3>
        <h1>{data?.btc}</h1>
        <p>BTC Change: {data?.btcChange}%</p>
      </div>

      {/* NEWS */}
      <h3 style={{ marginTop: 20 }}>📰 NEWS</h3>
      {data?.news?.map((n: any, i: number) => (
        <div key={i} style={{ padding: 10, background: "#1f2937", marginTop: 5 }}>
          {n.title} ({n.impact})
        </div>
      ))}

      {/* TOP 5 COINS */}
      <h3 style={{ marginTop: 20 }}>🔥 TOP 5 COINS</h3>

      {data?.coins?.map((c: any, i: number) => (
        <div
          key={i}
          style={{
            marginTop: 10,
            padding: 15,
            borderRadius: 10,
            background:
              c.signal === "BUY"
                ? "#14532d"
                : c.signal === "SELL"
                ? "#3f0a0a"
                : "#1f2937"
          }}
        >
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <b>{i + 1}. {c.pair}</b>
            <span>Accuracy: {c.accuracy}%</span>
          </div>

          {/* PRICE */}
          <div>💰 Price: {c.price}</div>
          <div>📉 Buy: {c.buy} | 📈 Sell: {c.sell}</div>

          {/* SIGNAL */}
          <div>
            Signal: <b>{c.signal}</b> ({c.prediction})
          </div>

          {/* REASON */}
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {c.reason}
          </div>
        </div>
      ))}
    </div>
  );
}
