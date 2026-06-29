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
    <div style={{
      background: "#05070f",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "monospace",
      padding: 20
    }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>📊 INDODAX PRO TERMINAL</h2>
        <span style={{ color: connected ? "#00ff88" : "red" }}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* MARKET INFO */}
      <div style={{
        marginTop: 15,
        padding: 10,
        background: "#0f172a",
        borderRadius: 6,
        display: "flex",
        gap: 20
      }}>
        <div>BTC: {data?.btc}</div>
        <div>BTC Δ: {data?.btcChange}%</div>
        <div>Market: INDODAX</div>
      </div>

      {/* TABLE HEADER */}
      <div style={{
        marginTop: 20,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
        fontWeight: "bold",
        borderBottom: "1px solid #333",
        paddingBottom: 10
      }}>
        <div>COIN</div>
        <div>PRICE</div>
        <div>CHANGE</div>
        <div>SCORE</div>
        <div>SIGNAL</div>
      </div>

      {/* DATA TABLE */}
      {data?.coins?.map((c: any, i: number) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
            padding: 10,
            borderBottom: "1px solid #111",
            background: c.score > 5 ? "#052e16" : c.score < -5 ? "#3f0a0a" : "transparent"
          }}
        >
          <div>{c.pair}</div>
          <div>{c.price}</div>
          <div style={{ color: c.change > 0 ? "#00ff88" : "#ff4444" }}>
            {c.change}%
          </div>
          <div style={{ color: c.score > 0 ? "#00ff88" : "#ff4444" }}>
            {c.score}
          </div>
          <div>{c.signal}</div>
        </div>
      ))}
    </div>
  );
}
