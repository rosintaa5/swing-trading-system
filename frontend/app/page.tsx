"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  // ================= SOCKET =================
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

  // ================= PORTFOLIO =================
  const addPortfolio = async (coin: any) => {
    await fetch("http://localhost:3000/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair: coin.pair,
        entry_price: coin.entry,
        amount: 1,
        tp1: coin.tp1,
        tp2: coin.tp2,
        sl: coin.sl
      })
    });
  };

  // ================= HISTORY =================
  const loadHistory = async () => {
    const res = await fetch("http://localhost:3000/market/history");
    const json = await res.json();
    setHistory(json);
  };

  // ================= FILTER =================
  const coins =
    data?.coins?.filter((c: any) => {
      if (filter === "ALL") return true;
      return c.signal === filter;
    }) || [];

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <h2>⚡ AI TRADING TERMINAL V4</h2>

        <div style={{
          ...styles.badge,
          background: connected ? "#16a34a" : "#dc2626"
        }}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* BTC PANEL */}
      <div style={styles.card}>
        <h3>BITCOIN</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <p>24H Change: {data?.btcChange ?? 0}%</p>
      </div>

      {/* FILTER BUTTONS */}
      <div style={styles.row}>
        <button style={styles.btn} onClick={() => setFilter("ALL")}>ALL</button>
        <button style={styles.btn} onClick={() => setFilter("BUY")}>BUY</button>
        <button style={styles.btn} onClick={() => setFilter("SELL")}>SELL</button>
        <button style={styles.btn} onClick={loadHistory}>LOAD HISTORY</button>
      </div>

      {/* COINS */}
      <h3 style={{ marginTop: 20 }}>TOP SIGNALS</h3>

      {coins.map((c: any, i: number) => (
        <div key={i} style={styles.coinCard}>

          <div style={styles.coinHeader}>
            <b>{c.pair}</b>

            <span style={{
              color:
                c.signal === "BUY"
                  ? "#22c55e"
                  : c.signal === "SELL"
                  ? "#ef4444"
                  : "#94a3b8"
            }}>
              {c.signal}
            </span>
          </div>

          <div>💰 Price: {c.price}</div>
          <div>📊 Entry: {c.entry}</div>

          <div style={{ marginTop: 8 }}>
            🎯 TP1: {c.tp1?.toFixed?.(2)}
          </div>
          <div>
            🎯 TP2: {c.tp2?.toFixed?.(2)}
          </div>
          <div>
            🛑 SL: {c.sl?.toFixed?.(2)}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {c.reason}
          </div>

          <div style={{ marginTop: 8 }}>
            Accuracy: {c.accuracy}%
          </div>

          {/* ACTION BUTTONS */}
          <div style={styles.row}>
            <button style={styles.buyBtn} onClick={() => addPortfolio(c)}>
              BUY / SAVE
            </button>

            <button
              style={styles.detailBtn}
              onClick={() =>
                alert(
                  `PAIR: ${c.pair}\nENTRY: ${c.entry}\nTP1: ${c.tp1}\nTP2: ${c.tp2}\nSL: ${c.sl}`
                )
              }
            >
              DETAILS
            </button>
          </div>

        </div>
      ))}

      {/* HISTORY */}
      <h3 style={{ marginTop: 30 }}>HISTORY</h3>

      {history.slice(0, 10).map((h, i) => (
        <div key={i} style={styles.historyCard}>
          <b>{h.pair}</b> | {h.signal} | score: {h.score}
        </div>
      ))}

    </div>
  );
}

// ================= STYLES =================
const styles: any = {
  container: {
    background: "#050816",
    minHeight: "100vh",
    color: "#fff",
    padding: 20,
    fontFamily: "sans-serif"
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
    marginTop: 15,
    padding: 15,
    background: "#0f172a",
    borderRadius: 10
  },
  coinCard: {
    marginTop: 12,
    padding: 14,
    background: "#111827",
    borderRadius: 10,
    border: "1px solid #1f2937"
  },
  coinHeader: {
    display: "flex",
    justifyContent: "space-between"
  },
  row: {
    display: "flex",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap"
  },
  btn: {
    padding: "6px 10px",
    background: "#1f2937",
    border: "1px solid #334155",
    color: "white",
    borderRadius: 6,
    cursor: "pointer"
  },
  buyBtn: {
    padding: "6px 10px",
    background: "#16a34a",
    border: "none",
    color: "white",
    borderRadius: 6,
    cursor: "pointer"
  },
  detailBtn: {
    padding: "6px 10px",
    background: "#334155",
    border: "none",
    color: "white",
    borderRadius: 6,
    cursor: "pointer"
  },
  historyCard: {
    marginTop: 8,
    padding: 10,
    background: "#0f172a",
    borderRadius: 8,
    border: "1px solid #1f2937"
  }
};
