"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "http://localhost:3000";

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

  // ================= LOAD DATA =================
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    setHistory(await res.json());
  };

  // NEWS SIMPLE MOCK (bisa diganti API crypto news nanti)
  const loadNews = async () => {
    setNews([
      {
        title: "Market volatility meningkat",
        impact: "HIGH",
        direction: "BEARISH"
      },
      {
        title: "Bitcoin dominan naik",
        impact: "MEDIUM",
        direction: "BULLISH"
      },
      {
        title: "Altcoin mulai akumulasi whale",
        impact: "HIGH",
        direction: "BULLISH"
      }
    ]);
  };

  useEffect(() => {
    loadPortfolio();
    loadHistory();
    loadNews();
  }, []);

  // ================= SAFE DATA =================
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
        entry_price: coin.price,
        amount: 1
      };

      const res = await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("FAILED TO BUY");

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
          <h2>INSTITUTIONAL TRADING DASHBOARD</h2>
          <p>Real-time Quant Engine Monitor</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* WARNING PANEL */}
      <div className={`warning ${marketDirection}`}>
        ⚠ MARKET DIRECTION: {marketDirection}  
        <br />
        Risk Notice: High volatility detected, gunakan manajemen risiko.
      </div>

      {/* BTC PANEL */}
      <div className="card">
        <h3>BITCOIN</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <p>24H CHANGE: {data?.btcChange ?? 0}%</p>
      </div>

      {/* NEWS */}
      <div className="news">
        <h3>MARKET NEWS</h3>
        {news.map((n, i) => (
          <div key={i} className={`news-item ${n.direction}`}>
            <b>{n.title}</b>
            <span>{n.impact} IMPACT</span>
          </div>
        ))}
      </div>

      {/* FILTER */}
      <div className="row">
        <button onClick={() => setFilter("ALL")}>ALL</button>
        <button onClick={() => setFilter("BUY")}>BUY</button>
        <button onClick={() => setFilter("SELL")}>SELL</button>
        <button onClick={loadPortfolio}>PORTFOLIO</button>
        <button onClick={loadHistory}>HISTORY</button>
      </div>

      {/* MARKET GRID */}
      <div className="grid">
        {filteredCoins.map((c: any, i: number) => (
          <div className="coin" key={i}>

            <div className="coin-head">
              <b>{c.pair}</b>
              <span className={c.signal}>{c.signal}</span>
            </div>

            <div className="price">
              PRICE: {c.price}
            </div>

            <div className="metrics">
              <div>WHALE SCORE: {c.whale_score}</div>
              <div>MOMENTUM: {c.momentum_score}</div>
              <div>CONFIDENCE: {c.confidence}%</div>
              <div>RISK: {c.risk_score}</div>
            </div>

            <button
              disabled={loading}
              onClick={() => addPortfolio(c)}
              className="buy"
            >
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

            <button onClick={() => sellPortfolio(p.id)}>
              SELL
            </button>

          </div>
        ))}
      </div>

      {/* HISTORY */}
      <h3>HISTORY</h3>
      <div className="history">
        {history.slice(0, 10).map((h: any, i: number) => (
          <div key={i}>
            {h.pair} | {h.signal} | SCORE: {h.score}
          </div>
        ))}
      </div>

      {/* STYLE */}
      <style jsx>{`
        .dashboard {
          background: #0b1020;
          color: white;
          min-height: 100vh;
          padding: 20px;
          font-family: sans-serif;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
        }

        .status.on { background: #16a34a; padding:6px 10px; border-radius:20px; }
        .status.off { background: #dc2626; padding:6px 10px; border-radius:20px; }

        .warning {
          margin-top: 15px;
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
        }

        .warning.BULLISH { background: #052e16; }
        .warning.BEARISH { background: #450a0a; }
        .warning.SIDEWAYS { background: #1e293b; }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .coin {
          background: #111827;
          padding: 14px;
          border-radius: 10px;
        }

        .coin-head {
          display: flex;
          justify-content: space-between;
        }

        .BUY { color: #22c55e; }
        .SELL { color: #ef4444; }

        .list .item {
          display: flex;
          justify-content: space-between;
          background: #0f172a;
          padding: 10px;
          margin-top: 8px;
          border-radius: 8px;
        }

        .news-item {
          padding: 8px;
          margin-top: 6px;
          background: #111827;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
        }

        .BULLISH { border-left: 4px solid #22c55e; }
        .BEARISH { border-left: 4px solid #ef4444; }
      `}</style>

    </div>
  );
}
