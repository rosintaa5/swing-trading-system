"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSwing = (res: any) => setData(res);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("swing", onSwing);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("swing", onSwing);
    };
  }, []);

  return (
    <div style={styles.container}>
      
      {/* HEADER */}
      <div style={styles.header}>
        <h2>⚡ AI TRADING TERMINAL V2</h2>

        <div style={{
          ...styles.badge,
          background: connected ? "#16a34a" : "#dc2626"
        }}>
          {connected ? "LIVE MARKET" : "OFFLINE"}
        </div>
      </div>

      {/* BTC PANEL */}
      <div style={styles.card}>
        <h3>₿ BITCOIN DASHBOARD</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <p>Change: {data?.btcChange ?? 0}%</p>
      </div>

      {/* NEWS */}
      <h3 style={{ marginTop: 20 }}>📰 MARKET NEWS</h3>

      <div style={styles.grid}>
        {(data?.news ?? []).map((n: any, i: number) => (
          <div key={i} style={styles.newsCard}>
            <b>{n.title}</b>
            <div style={{ opacity: 0.6 }}>Impact: {n.impact}</div>
          </div>
        ))}
      </div>

      {/* TOP COINS */}
      <h3 style={{ marginTop: 25 }}>🔥 TOP AI SIGNALS</h3>

      {(data?.coins ?? []).map((c: any, i: number) => (
        <div key={i} style={{
          ...styles.coinCard,
          borderColor:
            c.signal === "BUY" ? "#16a34a" :
            c.signal === "SELL" ? "#dc2626" : "#334155"
        }}>
          
          <div style={styles.coinHeader}>
            <b>{i + 1}. {c.pair}</b>

            <span style={{
              color:
                c.accuracy > 80 ? "#22c55e" :
                c.accuracy > 60 ? "#facc15" : "#ef4444"
            }}>
              {c.accuracy}% ACC
            </span>
          </div>

          <div>💰 Price: {c.price}</div>
          <div>📉 Low: {c.buy} | 📈 High: {c.sell}</div>

          <div style={{
            marginTop: 6,
            fontWeight: "bold",
            color:
              c.signal === "BUY" ? "#22c55e" :
              c.signal === "SELL" ? "#ef4444" : "#94a3b8"
          }}>
            {c.signal} → {c.prediction}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {c.reason}
          </div>

        </div>
      ))}
    </div>
  );
}

const styles: any = {
  container: {
    background: "#050816",
    minHeight: "100vh",
    color: "#fff",
    padding: 24,
    fontFamily: "Inter, sans-serif"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  badge: {
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12
  },
  card: {
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    background: "#0f172a",
    border: "1px solid #1f2937"
  },
  grid: {
    display: "grid",
    gap: 10
  },
  newsCard: {
    padding: 12,
    borderRadius: 10,
    background: "#111827",
    border: "1px solid #1f2937"
  },
  coinCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    background: "#0f172a",
    border: "1px solid #1f2937"
  },
  coinHeader: {
    display: "flex",
    justifyContent: "space-between"
  }
};
