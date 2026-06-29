"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // handler harus named biar bisa di-off
    const onConnect = () => {
      console.log("socket connected");
      setConnected(true);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onSwing = (res: any) => {
      console.log("DATA RECEIVED:", res);

      setData({
        btc: res?.btc ?? "-",
        btcChange: res?.btcChange ?? 0,
        regime: res?.regime ?? "UNKNOWN",
        coins: Array.isArray(res?.coins) ? res.coins : []
      });
    };

    // register event
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("swing", onSwing);

    // CLEANUP WAJIB VOID (INI FIX ERROR KAMU)
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("swing", onSwing);
    };
  }, []);

  return (
    <div style={{ padding: 20, background: "#0a0f1c", minHeight: "100vh", color: "#fff" }}>
      
      <h2>🚀 AI SWING SYSTEM</h2>

      <p>
        Status:{" "}
        <b style={{ color: connected ? "lime" : "red" }}>
          {connected ? "CONNECTED" : "OFFLINE"}
        </b>
      </p>

      <hr />

      <h3>BTC: {data?.btc ?? "-"}</h3>
      <p>Market: {data?.regime ?? "-"}</p>

      <hr />

      <h3>📊 COINS</h3>

      {!data?.coins?.length && (
        <p style={{ opacity: 0.5 }}>Waiting data...</p>
      )}

      {data?.coins?.map((c: any, i: number) => (
        <div
          key={i}
          style={{
            padding: 10,
            margin: 10,
            border: "1px solid #333",
            borderRadius: 6,
            background: c.score > 5 ? "#0f3d1f" : c.score < -5 ? "#3d0f0f" : "#111827"
          }}
        >
          <b>{i + 1}. {c.pair}</b>

          <div>Price: {c.price}</div>
          <div>Change: {c.change}%</div>

          <div>
            Score:{" "}
            <b style={{ color: c.score > 0 ? "#22c55e" : "#ef4444" }}>
              {c.score ?? c.probability}
            </b>
          </div>

          <div>
            Signal:{" "}
            <b>
              {c.signal}
            </b>
          </div>
        </div>
      ))}
    </div>
  );
}
