"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loading, setLoading] = useState(false);

  // ================= SOCKET =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("v12_fixed", (res) => {
      setData(res);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("v12_fixed");
    };
  }, []);

  // ================= LOAD =================
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    setHistory(await res.json());
  };

  const loadNews = async () => {
    setNews([
      {
        title: "Market volatility meningkat signifikan",
        impact: "HIGH",
        direction: "BEARISH",
        warning: "Hindari entry agresif saat ini"
      },
      {
        title: "Whale accumulation terdeteksi di altcoin",
        impact: "HIGH",
        direction: "BULLISH",
        warning: "Potensi breakout jangka pendek"
      },
      {
        title: "Bitcoin dominan naik perlahan",
        impact: "MEDIUM",
        direction: "BULLISH",
        warning: "Trend belum kuat, tunggu konfirmasi"
      }
    ]);
  };

  useEffect(() => {
    loadPortfolio();
    loadHistory();
    loadNews();
  }, []);

  // ================= SAFE COINS =================
  const coins = useMemo(() => {
    return data?.top?.filter((c: any) => c?.price > 0) || [];
  }, [data]);

  // ================= FILTER =================
  const filteredCoins =
    filter === "ALL"
      ? coins
      : coins.filter((c: any) => c.signal === filter);

  // ================= MARKET DIRECTION =================
  const marketDirection = useMemo(() => {
    if (!coins.length) return "UNKNOWN";

    const buy = coins.filter((c: any) => c.signal === "BUY").length;
    const sell = coins.filter((c: any) => c.signal === "SELL").length;

    if (buy > sell + 2) return "BULLISH";
    if (sell > buy + 2) return "BEARISH";
    return "SIDEWAYS";
  }, [coins]);

  // ================= BUY =================
  const addPortfolio = async (coin: any) => {
    try {
      setLoading(true);

      const payload = {
        pair: coin.pair,
        price: coin.price, // FIXED
        amount: 1
      };

      await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      await loadPortfolio();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ================= SELL =================
  const sellPortfolio = async (id: number) => {
    await fetch(`${API}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    loadPortfolio();
  };

  return (
    <div className="dashboard">

      {/* HEADER */}
      <div className="topbar">
        <div>
          <h2>INSTITUTIONAL AI TRADING TERMINAL</h2>
          <p>Real-time Quant Hedge Fund Monitoring System</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* WARNING */}
      <div className={`warning ${marketDirection}`}>
        ⚠ MARKET STATUS: {marketDirection}
        <br />
        ⚠ HIGH RISK ENVIRONMENT DETECTED
      </div>

      {/* BTC PANEL */}
      <div className="card">
        <h3>BITCOIN PRICE</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <p>24H CHANGE: {data?.btcChange ?? 0}%</p>
      </div>

      {/* NEWS */}
      <div className="news">
        <h3>MARKET NEWS</h3>
        {news.map((n, i) => (
          <div key={i} className={`news-item ${n.direction}`}>
            <div>
              <b>{n.title}</b>
              <p>{n.warning}</p>
            </div>
            <span>{n.impact}</span>
          </div>
        ))}
      </div>

      {/* FILTER */}
      <div className="row">
        <button onClick={() => setFilter("ALL")}>ALL</button>
        <button onClick={() => setFilter("BUY")}>BUY</button>
        <button onClick={() => setFilter("SELL")}>SELL</button>
      </div>

      {/* GRID */}
      <div className="grid">
        {filteredCoins.map((c: any, i: number) => (
          <div className="coin" key={i}>
            <div className="coin-head">
              <b>{c.pair}</b>
              <span className={c.signal}>{c.signal}</span>
            </div>

            <div className="price">
              <div>PRICE: {c.price}</div>
              <div>TP1: {c.tp1}</div>
              <div>TP2: {c.tp2}</div>
              <div>SL: {c.sl}</div>
            </div>

            <div className="reason">
              <b>ALASAN ENTRY</b>
              <ul>
                <li>Whale: {c.whale_score}</li>
                <li>Momentum: {c.momentum_score}</li>
                <li>Liquidity: {c.liquidity_score}</li>
                <li>Confidence: {c.confidence}%</li>
                <li>Risk: {c.risk_score}</li>
              </ul>
            </div>

            <button disabled={loading} onClick={() => addPortfolio(c)}>
              BUY
            </button>
          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3>PORTFOLIO</h3>
      <div className="list">
        {portfolio.map((p: any) => (
          <div key={p.id} className="item">
            <div>
              <b>{p.pair}</b>
              <small>ENTRY: {p.entry_price}</small>
              <small>PNL: {p.pnl}</small>
            </div>
            <button onClick={() => sellPortfolio(p.id)}>SELL</button>
          </div>
        ))}
      </div>

      {/* HISTORY */}
      <h3>HISTORY</h3>
      <div className="history">
        {history.slice(0, 10).map((h: any, i: number) => (
          <div key={i}>{h.pair} | {h.signal}</div>
        ))}
      </div>

      {/* STYLE FIXED */}
      <style jsx>{`
        .dashboard { background:#070b1a; color:white; padding:20px; }
        .topbar { display:flex; justify-content:space-between; }
        .status.on { background:green; padding:5px 10px; border-radius:10px; }
        .status.off { background:red; padding:5px 10px; border-radius:10px; }

        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }

        .coin { background:#111827; padding:10px; border-radius:10px; }

        .BUY { color:green; }
        .SELL { color:red; }

        .BULLISH { background:#052e16; border-left:4px solid green; }
        .BEARISH { background:#450a0a; border-left:4px solid red; }
        .SIDEWAYS { background:#1e293b; border-left:4px solid gray; }
      `}</style>

    </div>
  );
}
