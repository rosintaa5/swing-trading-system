"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loadingPair, setLoadingPair] = useState<string | null>(null);

  // ================= SOCKET =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("v12_fixed", (res) => setData(res));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("v12_fixed");
    };
  }, []);

  // ================= DATA LOAD =================
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    const json = await res.json();
    setPortfolio(json);
  };

  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    const json = await res.json();
    setHistory(json);
  };

  useEffect(() => {
    loadPortfolio();
    loadHistory();
  }, []);

  // ================= COINS =================
  const coins = useMemo(() => {
    if (!data?.top) return [];
    return data.top.filter((c: any) => c?.price > 0);
  }, [data]);

  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return coins;
    return coins.filter((c: any) => c.signal === filter);
  }, [coins, filter]);

  const marketStatus = useMemo(() => {
    if (!coins.length) return "NEUTRAL";

    const buy = coins.filter((c: any) => c.signal === "BUY").length;
    const sell = coins.filter((c: any) => c.signal === "SELL").length;

    if (buy > sell + 2) return "BULLISH";
    if (sell > buy + 2) return "BEARISH";
    return "SIDEWAYS";
  }, [coins]);

  // ================= BUY =================
  const buy = async (coin: any) => {
    try {
      setLoadingPair(coin.pair);

      const res = await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          price: coin.price,
          amount: 1
        })
      });

      if (!res.ok) throw new Error("BUY FAILED");

      await loadPortfolio();
    } finally {
      setLoadingPair(null);
    }
  };

  const sell = async (id: number) => {
    await fetch(`${API}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    loadPortfolio();
  };

  // ================= UI =================
  return (
    <div className="app">

      {/* TOP NAV */}
      <header className="topbar">
        <div className="brand">
          <h1>TRADING TERMINAL</h1>
          <p>AI-driven market monitoring system</p>
        </div>

        <div className={`status ${connected ? "live" : "down"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      {/* MARKET STATUS */}
      <section className={`statusCard ${marketStatus}`}>
        <div>
          <h2>Market Status: {marketStatus}</h2>
          <p>Real-time sentiment aggregation from signal engine</p>
        </div>

        <div className="btc">
          <h3>BTC</h3>
          <strong>{data?.btc ?? "-"}</strong>
          <span>{data?.btcChange ?? 0}%</span>
        </div>
      </section>

      {/* FILTER BAR */}
      <div className="filterBar">
        {["ALL", "BUY", "SELL"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={filter === f ? "active" : ""}
          >
            {f}
          </button>
        ))}
      </div>

      {/* MAIN GRID */}
      <main className="grid">
        {filteredCoins.map((c: any) => (
          <div className="card" key={c.pair}>

            <div className="cardHead">
              <h3>{c.pair}</h3>
              <span className={`badge ${c.signal}`}>{c.signal}</span>
            </div>

            <div className="price">
              <div><span>Price</span><b>{c.price}</b></div>
              <div><span>TP1</span><b>{c.tp1}</b></div>
              <div><span>TP2</span><b>{c.tp2}</b></div>
              <div><span>SL</span><b>{c.sl}</b></div>
            </div>

            <div className="metrics">
              <div>Whale <b>{c.whale_score}</b></div>
              <div>Momentum <b>{c.momentum_score}</b></div>
              <div>Risk <b>{c.risk_score}</b></div>
              <div>Confidence <b>{c.confidence}%</b></div>
            </div>

            <button
              className="buyBtn"
              disabled={loadingPair === c.pair}
              onClick={() => buy(c)}
            >
              {loadingPair === c.pair ? "PROCESSING..." : "BUY"}
            </button>

          </div>
        ))}
      </main>

      {/* PORTFOLIO */}
      <section className="panel">
        <h2>Portfolio</h2>

        <div className="list">
          {portfolio.map((p: any) => (
            <div className="rowItem" key={p.id}>
              <div>
                <b>{p.pair}</b>
                <small>Entry {p.entry_price}</small>
                <small>PNL {p.pnl}</small>
              </div>

              <button onClick={() => sell(p.id)}>SELL</button>
            </div>
          ))}
        </div>
      </section>

      {/* HISTORY */}
      <section className="panel">
        <h2>History</h2>
        <div className="history">
          {history.slice(0, 8).map((h: any, i: number) => (
            <div key={i}>
              {h.pair} · {h.signal} · {h.score}
            </div>
          ))}
        </div>
      </section>

      {/* STYLE */}
      <style jsx>{`
        .app {
          background: #0b1220;
          color: #e5e7eb;
          min-height: 100vh;
          padding: 24px;
          font-family: system-ui;
        }

        /* TOPBAR */
        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #1f2937;
        }

        .brand h1 {
          font-size: 18px;
          margin: 0;
        }

        .brand p {
          font-size: 12px;
          opacity: 0.7;
        }

        .status.live {
          background: #16a34a;
          padding: 6px 12px;
          border-radius: 999px;
        }

        .status.down {
          background: #dc2626;
          padding: 6px 12px;
          border-radius: 999px;
        }

        /* STATUS CARD */
        .statusCard {
          margin-top: 16px;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          justify-content: space-between;
          background: #111827;
        }

        .BULLISH { border-left: 4px solid #22c55e; }
        .BEARISH { border-left: 4px solid #ef4444; }
        .SIDEWAYS { border-left: 4px solid #64748b; }

        /* FILTER */
        .filterBar {
          display: flex;
          gap: 8px;
          margin: 16px 0;
        }

        .filterBar button {
          padding: 8px 14px;
          border-radius: 8px;
          border: none;
          background: #1f2937;
          color: white;
          cursor: pointer;
        }

        .filterBar .active {
          background: #2563eb;
        }

        /* GRID */
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 12px;
        }

        /* CARD */
        .card {
          background: #111827;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid #1f2937;
        }

        .cardHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .badge {
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 12px;
        }

        .BUY { background: #14532d; color: #22c55e; }
        .SELL { background: #450a0a; color: #ef4444; }

        .price {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.9;
        }

        .metrics {
          margin-top: 10px;
          font-size: 12px;
          opacity: 0.8;
          display: grid;
          gap: 4px;
        }

        .buyBtn {
          margin-top: 12px;
          width: 100%;
          padding: 10px;
          border-radius: 10px;
          border: none;
          background: #2563eb;
          color: white;
          cursor: pointer;
        }

        /* PANEL */
        .panel {
          margin-top: 24px;
        }

        .list .rowItem {
          display: flex;
          justify-content: space-between;
          padding: 10px;
          background: #111827;
          border-radius: 10px;
          margin-top: 8px;
        }

        .history {
          font-size: 13px;
          opacity: 0.8;
          display: grid;
          gap: 6px;
        }
      `}</style>
    </div>
  );
}
