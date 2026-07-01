"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

// ================= TYPES (FIX NEXT JS STRICT MODE) =================
type Coin = {
  pair: string;
  price: number;
  signal: "BUY" | "SELL" | "HOLD";
  score: number;

  entry: number;
  tp1: number;
  tp2: number;
  sl: number;

  whale_score: number;
  momentum_score: number;
  liquidity_score: number;

  confidence: number;
  risk_score: number;
  warning_level: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
};

type Portfolio = {
  id: number;
  pair: string;
  entry_price: number;
  pnl: number;
};

type MarketData = {
  btc?: number;
  btcChange?: number;
  top?: Coin[];
};

const API = "http://localhost:3000";

export default function Page() {
  const [data, setData] = useState<MarketData | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  // ================= SOCKET SAFE =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("v12_fixed", (res: MarketData) => {
      setData(res);
    });

    return () => {
      socket.off("v12_fixed");
    };
  }, []);

  // ================= SAFE COINS =================
  const coins: Coin[] = useMemo(() => {
    return data?.top ?? [];
  }, [data]);

  const filtered: Coin[] = useMemo(() => {
    if (filter === "ALL") return coins;
    return coins.filter((c) => c.signal === filter);
  }, [coins, filter]);

  // ================= BUY =================
  const buy = async (c: Coin) => {
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

  // ================= SELL =================
  const sell = async (id: number) => {
    await fetch(`${API}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  // ================= MARKET DIRECTION =================
  const direction = useMemo(() => {
    const buy = coins.filter((c) => c.signal === "BUY").length;
    const sell = coins.filter((c) => c.signal === "SELL").length;

    if (buy > sell + 2) return "BULLISH";
    if (sell > buy + 2) return "BEARISH";
    return "SIDEWAYS";
  }, [coins]);

  return (
    <div className="app">

      {/* HEADER */}
      <div className="header">
        <h2>INSTITUTIONAL TRADING DASHBOARD</h2>
        <span>{connected ? "🟢 LIVE" : "🔴 OFFLINE"}</span>
      </div>

      {/* WARNING SYSTEM */}
      <div className={`warning ${direction}`}>
        ⚠ MARKET: {direction}
        <br />
        ⚠ HIGH VOLATILITY DETECTED
        <br />
        ⚠ ENTRY WAJIB PAKAI SL
        <br />
        ⚠ HINDARI OVERLEVERAGE
        <br />
        ⚠ FOMO ENTRY DILARANG
      </div>

      {/* BTC */}
      <div className="btc">
        BTC: {data?.btc ?? "-"} | CHANGE: {data?.btcChange ?? 0}%
      </div>

      {/* FILTER */}
      <div className="filter">
        {(["ALL", "BUY", "SELL"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {/* MARKET GRID */}
      <div className="grid">
        {filtered.map((c) => (
          <div className="card" key={c.pair}>

            <h3>{c.pair}</h3>
            <b className={c.signal}>{c.signal}</b>

            {/* PRICE BLOCK */}
            <div className="price">
              <div>ENTRY: {c.entry}</div>
              <div>TP1: {c.tp1}</div>
              <div>TP2: {c.tp2}</div>
              <div>SL: {c.sl}</div>
            </div>

            {/* REASON */}
            <div className="reason">
              <b>REASON ENGINE</b>
              <div>Whale: {c.whale_score.toFixed(2)}</div>
              <div>Momentum: {c.momentum_score.toFixed(2)}</div>
              <div>Liquidity: {c.liquidity_score.toFixed(2)}</div>
              <div>Confidence: {c.confidence.toFixed(1)}%</div>
              <div>Risk: {c.risk_score.toFixed(2)}</div>
            </div>

            {/* WARNING LEVEL */}
            <div className={`level ${c.warning_level}`}>
              ⚠ {c.warning_level} RISK
            </div>

            <button onClick={() => buy(c)}>BUY</button>

          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3>PORTFOLIO</h3>

      {portfolio.map((p) => (
        <div key={p.id} className="portfolio">
          <b>{p.pair}</b>
          <div>ENTRY: {p.entry_price}</div>
          <div>PNL: {p.pnl}</div>
          <button onClick={() => sell(p.id)}>SELL</button>
        </div>
      ))}

      {/* STYLE */}
      <style jsx>{`
        .app { background:#0b0f1a; color:white; padding:20px; }

        .header { display:flex; justify-content:space-between; }

        .warning {
          background:#1f2937;
          padding:10px;
          margin:10px 0;
        }

        .BULLISH { border-left:4px solid #22c55e; }
        .BEARISH { border-left:4px solid #ef4444; }

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

        .price { font-size:12px; margin-top:8px; }

        .reason {
          font-size:12px;
          margin-top:8px;
          background:#0f172a;
          padding:6px;
        }

        .portfolio {
          background:#1f2937;
          margin-top:8px;
          padding:10px;
        }

        .level {
          font-size:11px;
          margin-top:6px;
        }

        .LOW { color:green; }
        .MEDIUM { color:yellow; }
        .HIGH { color:orange; }
        .EXTREME { color:red; }
      `}</style>

    </div>
  );
}
