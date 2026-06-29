"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // ======================
    // HANDLERS (WAJIB NAMED)
    // ======================
    const onConnect = () => {
      setConnected(true);
      console.log("socket connected");
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onSwing = (res: any) => {
      setData(res);
    };

    // ======================
    // REGISTER EVENTS
    // ======================
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("swing", onSwing);

    // ======================
    // CLEANUP (FIX ERROR KAMU)
    // ======================
    return (): void => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("swing", onSwing);
    };
  }, []);

  return (
    <div style={{
      background: "#050816",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "Inter, sans-serif",
      padding: 24
    }}>

      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h2>⚡ AI TRADING TERMINAL V5</h2>

        <div style={{
          padding: "6px 12px",
          borderRadius: 20,
          background: connected ? "#16a34a" : "#dc2626",
          fontSize: 12
        }}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* BTC PANEL */}
      <div style={{
        marginTop: 20,
        padding: 16,
        borderRadius: 12,
        background: "#0f172a",
        border: "1px solid #1f2937"
      }}>
        <h3>₿ BTC MARKET</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <p>Change: {data?.btcChange ?? 0}%</p>
        <p>Regime: {data?.regime ?? "UNKNOWN"}</p>
      </div>

      {/* NEWS */}
      <h3 style={{ marginTop: 20 }}>📰 MARKET NEWS</h3>

      <div style={{ display: "grid", gap: 10 }}>
        {data?.news?.map((n: any, i: number) => (
          <div
            key={i}
            style={{
              padding: 12,
              borderRadius: 10,
              background: "#111827",
              border: "1px solid #1f2937"
            }}
          >
            <b>{n.title}</b>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Impact: {n.impact}
            </div>
          </div>
        ))}
      </div>

      {/* TOP COINS */}
      <h3 style={{ marginTop: 25 }}>🔥 TOP SIGNALS (AI RANKING)</h3>

      {data?.coins?.map((c: any, i: number) => (
        <div
          key={i}
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 12,
            background:
              c.signal === "BUY"
                ? "#052e16"
                : c.signal === "SELL"
                ? "#3f0a0a"
                : "#111827",
            border: "1px solid #1f2937"
          }}
        >

          {/* HEADER */}
          <div style={{
            display: "flex",
            justifyContent: "space-between"
          }}>
            <b>{i + 1}. {c.pair}</b>
            <span style={{
              color:
                c.accuracy > 80
                  ? "#22c55e"
                  : c.accuracy > 60
                  ? "#facc15"
                  : "#ef4444"
            }}>
              {c.accuracy}% ACC
            </span>
          </div>

          {/* PRICE */}
          <div>💰 Price: {c.price}</div>
          <div>📉 Buy: {c.buy} | 📈 Sell: {c.sell}</div>

          {/* SIGNAL */}
          <div style={{ marginTop: 6 }}>
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
