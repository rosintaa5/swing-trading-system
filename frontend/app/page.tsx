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

    socket.on("v12_fixed", (res) => {
      setData(res);
    });

    return () => socket.off("v12_fixed");
  }, []);

  const coins = useMemo(() => data?.top || [], [data]);

  const filtered =
    filter === "ALL"
      ? coins
      : coins.filter((c: any) => c.signal === filter);

  const warning = data?.warning;

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

  return (
    <div className="app">

      {/* HEADER */}
      <div className="header">
        <h2>INSTITUTIONAL TRADING DASHBOARD</h2>
        <span>{connected ? "LIVE" : "OFFLINE"}</span>
      </div>

      {/* REAL MARKET WARNING (NO HARDCODE) */}
      <div className={`warning ${warning?.level}`}>
        ⚠ STATUS: {warning?.level || "UNKNOWN"}
        <br />
        ⚠ {warning?.message || "Menunggu data market"}
      </div>

      {/* BTC */}
      <div className="btc">
        BTC: {data?.btc || "-"} | CHANGE: {data?.btcChange || 0}%
      </div>

      {/* FILTER */}
      <div className="filter">
        {["ALL", "BUY", "SELL"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {/* MARKET */}
      <div className="grid">
        {filtered.map((c: any, i: number) => (
          <div key={i} className="card">

            <h3>{c.pair}</h3>
            <b>{c.signal}</b>

            {/* PRICE */}
            <div>ENTRY: {c.entry}</div>
            <div>TP1: {c.tp1}</div>
            <div>TP2: {c.tp2}</div>
            <div>SL: {c.sl}</div>

            {/* REASON */}
            <div className="reason">
              <div>Whale: {c.whale_score?.toFixed?.(2)}</div>
              <div>Momentum: {c.momentum_score?.toFixed?.(2)}</div>
              <div>Liquidity: {c.liquidity_score?.toFixed?.(2)}</div>
              <div>Confidence: {c.confidence?.toFixed?.(1)}%</div>
              <div>Risk: {c.risk_score?.toFixed?.(2)}</div>
            </div>

            <button onClick={() => buy(c)}>BUY</button>

          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3>PORTFOLIO</h3>

      {portfolio.map((p) => (
        <div key={p.id} className="p">
          {p.pair} | ENTRY: {p.entry_price} | PNL: {p.pnl}
          <button onClick={() => sell(p.id)}>SELL</button>
        </div>
      ))}

      <style jsx>{`
        .app { background:#0b0f1a; color:white; padding:20px; }

        .warning {
          padding:10px;
          margin:10px 0;
          background:#1f2937;
        }

        .HIGH_VOLATILITY { border-left:4px solid orange; }
        .BEARISH_PRESSURE { border-left:4px solid red; }
        .BULLISH_MOMENTUM { border-left:4px solid green; }
        .DISTRIBUTION { border-left:4px solid purple; }

        .grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
          gap:10px;
        }

        .card {
          background:#111827;
          padding:10px;
          border-radius:10px;
        }

        .reason {
          font-size:12px;
          margin-top:8px;
        }

        .p {
          background:#1f2937;
          margin-top:8px;
          padding:10px;
        }
      `}</style>

    </div>
  );
}
