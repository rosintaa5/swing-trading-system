"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("swing", (res) => setData(res));

    return () => {
      socket.off("connect");
      socket.off("swing");
    };
  }, []);

  return (
    <div style={{
      padding: 20,
      background: "#0a0f1c",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "Arial"
    }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>📊 AI SWING SCANNER V2</h2>
        <span style={{ color: connected ? "#22c55e" : "#ef4444" }}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* BTC */}
      <div style={{
        marginTop: 20,
        padding: 15,
        background: "#111827",
        borderRadius: 10
      }}>
        <h3>BTC PRICE</h3>
        <h1>{data?.btc ?? "-"}</h1>
      </div>

      {/* RANKING */}
      <div style={{ marginTop: 20 }}>
        <h3>🔥 TOP RANKING SIGNAL</h3>

        {data?.coins?.map((c: any, i: number) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: 12,
              marginTop: 10,
              borderRadius: 8,
              background:
                c.score > 5
                  ? "#14532d"
                  : c.score < -5
                  ? "#450a0a"
                  : "#1f2937"
            }}
          >
            <div>
              <b>{i + 1}. {c.pair}</b>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {c.signal}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div>{c.price}</div>
              <div style={{ color: c.score > 0 ? "#22c55e" : "#ef4444" }}>
                SCORE: {c.score}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
