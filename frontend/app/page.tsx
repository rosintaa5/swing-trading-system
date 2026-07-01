"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "http://localhost:3000";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("v12_fixed", (res) => setData(res));

    return () => socket.off("v12_fixed");
  }, []);

  const coins = useMemo(() => data?.top || [], [data]);

  const filtered =
    filter === "ALL"
      ? coins
      : coins.filter((c: any) => c.signal === filter);

  const buy = async (c: any) => {
    await fetch(`${API}/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair: c.pair,
        price: c.price,
        amount: 1
      })
    });

    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const sell = async (id: number) => {
    await fetch(`${API}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const direction =
    coins.filter((c: any) => c.signal === "BUY").length >
    coins.filter((c: any) => c.signal === "SELL").length
      ? "BULLISH"
      : "BEARISH";

  return (
    <div className="app">

      <h2>INSTITUTIONAL TRADING DASHBOARD</h2>
      <p>{connected ? "🟢 LIVE" : "🔴 OFFLINE"}</p>

      {/* WARNING MULTILAYER */}
      <div className={`warning ${direction}`}>
        ⚠ MARKET: {direction}  
        ⚠ HIGH VOLATILITY DETECTED  
        ⚠ ALWAYS USE TP & SL  
        ⚠ DO NOT OVERLEVERAGE  
        ⚠ ENTRY WITHOUT CONFIRMATION IS RISKY
      </div>

      <div className="btc">
        BTC: {data?.btc} | CHANGE: {data?.btcChange}%
      </div>

      <div className="grid">
        {filtered.map((c: any, i: number) => (
          <div className="card" key={i}>

            <h3>{c.pair} ({c.signal})</h3>

            <div>ENTRY: {c.entry}</div>
            <div>TP1: {c.tp1}</div>
            <div>TP2: {c.tp2}</div>
            <div>SL: {c.sl}</div>

            <hr />

            <div>WHALE: {c.whale_score?.toFixed(2)}</div>
            <div>MOMENTUM: {c.momentum_score?.toFixed(2)}</div>
            <div>CONFIDENCE: {c.confidence?.toFixed(1)}%</div>
            <div>RISK: {c.risk_score?.toFixed(2)}</div>

            <div className={`warn ${c.warning_level}`}>
              ⚠ LEVEL: {c.warning_level}
            </div>

            <button onClick={() => buy(c)}>BUY</button>
          </div>
        ))}
      </div>

      <h3>PORTFOLIO</h3>

      {portfolio.map((p) => (
        <div key={p.id} className="p">
          {p.pair} | ENTRY: {p.entry_price} | PNL: {p.pnl}
          <button onClick={() => sell(p.id)}>SELL</button>
        </div>
      ))}

      <style jsx>{`
        .app { background:#0b0f1a; color:white; padding:20px; }

        .warning { padding:10px; margin:10px 0; background:#1f2937; }

        .BULLISH { border-left:4px solid #22c55e; }
        .BEARISH { border-left:4px solid #ef4444; }

        .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }

        .card { background:#111827; padding:10px; border-radius:8px; }

        .warn { margin-top:5px; font-size:11px; }
        .EXTREME { color:red; }
        .HIGH { color:orange; }
        .MEDIUM { color:yellow; }
        .LOW { color:green; }

        .p { background:#1f2937; margin-top:8px; padding:8px; }
      `}</style>

    </div>
  );
}
