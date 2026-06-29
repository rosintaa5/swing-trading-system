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
      padding: 20,
      background: "#070b14",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "Arial"
    }}>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>🚀 AI SWING V3 PREDICTION ENGINE</h2>
        <span style={{ color: connected ? "#22c55e" : "#ef4444" }}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* MARKET STATE */}
      <div style={{
        marginTop: 15,
        padding: 10,
        background: "#111827",
        borderRadius: 8
      }}>
        <b>Market Regime:</b> {data?.regime}
        <br />
        <b>BTC Change:</b> {data?.btcChange}%
      </div>

      {/* BTC */}
      <div style={{
        marginTop: 15,
        padding: 15,
        background: "#0f172a",
        borderRadius: 10
      }}>
        <h3>BTC PRICE</h3>
        <h1>{data?.btc}</h1>
      </div>

      {/* PREDICTION LIST */}
      <div style={{ marginTop: 20 }}>
        <h3>📊 TOP PREDICTIONS (1–3 DAYS)</h3>

        {data?.coins?.map((c: any, i: number) => (
          <div key={i}
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 10,
              background:
                c.probability > 50
                  ? "#14532d"
                  : c.probability < -50
                  ? "#450a0a"
                  : "#1f2937"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{i + 1}. {c.pair}</b>
              <span>{c.signal}</span>
            </div>

            <div>Price: {c.price}</div>

            <div>
              Probability:{" "}
              <b style={{ color: c.probability > 0 ? "#22c55e" : "#ef4444" }}>
                {c.probability}
              </b>
            </div>

            <div>Confidence: {c.confidence}%</div>

            <div>Market: {c.regime}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
