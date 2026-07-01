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

  // ================= LOAD =================
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    setHistory(await res.json());
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

  // ================= NEWS IMPACT (SIMULATED ENGINE) =================
  const newsImpactScore = 0.7; 
  // (0 - bearish, 1 - bullish baseline)

  // ================= ENRICHED COINS ENGINE =================
  const enrichedCoins = useMemo(() => {
    return coins.map((c: any) => {
      const entry = c.price;

      const tp1 = entry * 1.02;
      const tp2 = entry * 1.05;
      const tp3 = entry * 1.08;

      const sl = entry * 0.97;

      const rr = ((tp2 - entry) / (entry - sl)).toFixed(2);

      const confidence =
        Math.min(
          100,
          (c.momentum_score || 0) * 10 +
          (c.whale_score || 0) * 10 +
          newsImpactScore * 20
        );

      let reason = [];

      if (c.whale_score > 7) reason.push("Whale accumulation detected");
      if (c.momentum_score > 7) reason.push("Strong momentum trend");
      if (c.liquidity_score > 7) reason.push("High liquidity zone");
      if (newsImpactScore > 0.6) reason.push("News sentiment bullish bias");

      if (reason.length === 0) reason.push("Market neutral / wait confirmation");

      return {
        ...c,
        entry,
        tp1,
        tp2,
        tp3,
        sl,
        rr,
        confidence: confidence.toFixed(0),
        reason
      };
    });
  }, [coins]);

  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return enrichedCoins;
    return enrichedCoins.filter((c: any) => c.signal === filter);
  }, [enrichedCoins, filter]);

  // ================= MARKET STATE =================
  const marketState = useMemo(() => {
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

      await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          price: coin.entry,
          amount: 1
        })
      });

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

      {/* HEADER */}
      <header className="topbar">
        <div>
          <h1>PRO TRADING INTELLIGENCE</h1>
          <p>AI + News + Market Flow Analysis System</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      {/* MARKET STATE */}
      <section className={`market ${marketState}`}>
        <h2>Market State: {marketState}</h2>
        <p>Integrated sentiment + technical + news flow</p>
      </section>

      {/* FILTER */}
      <div className="filter">
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

      {/* COIN GRID */}
      <main className="grid">
        {filteredCoins.map((c: any) => (
          <div className="card" key={c.pair}>

            <div className="head">
              <h3>{c.pair}</h3>
              <span className={`tag ${c.signal}`}>{c.signal}</span>
            </div>

            {/* ENTRY */}
            <div className="entry">
              <b>ENTRY: {c.entry}</b>
              <span>Confidence: {c.confidence}%</span>
              <span>R/R: {c.rr}</span>
            </div>

            {/* TP SL */}
            <div className="levels">
              <div>TP1: {c.tp1.toFixed(2)}</div>
              <div>TP2: {c.tp2.toFixed(2)}</div>
              <div>TP3: {c.tp3.toFixed(2)}</div>
              <div className="sl">SL: {c.sl.toFixed(2)}</div>
            </div>

            {/* REASON */}
            <div className="reason">
              <b>ENTRY REASON</b>
              <ul>
                {c.reason.map((r: string, i: number) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>

            <button
              disabled={loadingPair === c.pair}
              onClick={() => buy(c)}
            >
              {loadingPair === c.pair ? "Processing..." : "EXECUTE BUY"}
            </button>

          </div>
        ))}
      </main>

      {/* PORTFOLIO */}
      <section className="panel">
        <h2>Portfolio</h2>
        {portfolio.map((p: any) => (
          <div key={p.id} className="row">
            <div>
              <b>{p.pair}</b>
              <small>Entry: {p.entry_price}</small>
              <small>PNL: {p.pnl}</small>
            </div>
            <button onClick={() => sell(p.id)}>SELL</button>
          </div>
        ))}
      </section>

      {/* STYLE */}
      <style jsx>{`
        .app {
          background:#0b1020;
          color:#e5e7eb;
          min-height:100vh;
          padding:24px;
          font-family:system-ui;
        }

        .topbar {
          display:flex;
          justify-content:space-between;
          border-bottom:1px solid #1f2937;
          padding-bottom:16px;
        }

        .status.on { background:#16a34a; padding:6px 12px; border-radius:999px; }
        .status.off { background:#dc2626; padding:6px 12px; border-radius:999px; }

        .market {
          margin-top:16px;
          padding:16px;
          border-radius:12px;
          background:#111827;
        }

        .BULLISH { border-left:4px solid #22c55e; }
        .BEARISH { border-left:4px solid #ef4444; }
        .SIDEWAYS { border-left:4px solid #64748b; }

        .filter {
          display:flex;
          gap:8px;
          margin:16px 0;
        }

        .filter button {
          padding:8px 12px;
          border-radius:8px;
          background:#1f2937;
          border:none;
          color:white;
        }

        .filter .active {
          background:#2563eb;
        }

        .grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
          gap:12px;
        }

        .card {
          background:#111827;
          padding:14px;
          border-radius:14px;
        }

        .head {
          display:flex;
          justify-content:space-between;
        }

        .tag.BUY { color:#22c55e; }
        .tag.SELL { color:#ef4444; }

        .entry {
          display:flex;
          flex-direction:column;
          margin-top:8px;
          font-size:13px;
        }

        .levels {
          margin-top:10px;
          font-size:12px;
          display:grid;
          gap:4px;
        }

        .sl {
          color:#ef4444;
        }

        .reason {
          margin-top:10px;
          font-size:12px;
          opacity:0.9;
        }

        button {
          width:100%;
          margin-top:10px;
          padding:10px;
          border:none;
          border-radius:10px;
          background:#2563eb;
          color:white;
        }

        .panel {
          margin-top:24px;
        }

        .row {
          display:flex;
          justify-content:space-between;
          padding:10px;
          background:#111827;
          margin-top:8px;
          border-radius:10px;
        }
      `}</style>

    </div>
  );
}
