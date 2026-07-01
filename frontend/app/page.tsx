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

  // ================= NEWS ENGINE =================
  const newsEngine = useMemo(() => {
    const news = [
      { impact: "HIGH", type: "BULLISH" },
      { impact: "HIGH", type: "BEARISH" },
      { impact: "MEDIUM", type: "BULLISH" }
    ];

    const bullish = news.filter(n => n.type === "BULLISH").length / news.length;
    const bearish = news.filter(n => n.type === "BEARISH").length / news.length;

    const bias = bullish - bearish;

    return {
      bullish,
      bearish,
      bias,
      risk: Math.abs(bias) * 100
    };
  }, []);

  // ================= MARKET PREDICTION =================
  const marketPrediction = useMemo(() => {
    if (newsEngine.bias > 0.2) return "BULLISH";
    if (newsEngine.bias < -0.2) return "BEARISH";
    return "SIDEWAYS";
  }, [newsEngine]);

  // ================= ENRICH COINS =================
  const enrichedCoins = useMemo(() => {
    return coins.map((c: any) => {
      const entry = c.price;

      const tp1 = entry * 1.02;
      const tp2 = entry * 1.05;
      const tp3 = entry * 1.09;
      const sl = entry * 0.965;

      const newsBoost = newsEngine.bullish * 25;

      const confidence = Math.min(
        100,
        (c.momentum_score || 0) * 8 +
        (c.whale_score || 0) * 10 +
        newsBoost
      );

      let decision = "HOLD";
      if (confidence > 75 && c.signal === "BUY") decision = "BUY STRONG";
      if (confidence < 40) decision = "EXIT NOW";
      if (confidence > 60 && c.signal === "SELL") decision = "TAKE PROFIT";

      const reasons = [];
      if (c.whale_score > 7) reasons.push("Whale accumulation detected");
      if (c.momentum_score > 7) reasons.push("Strong momentum trend");
      if (newsEngine.bullish > 0.6) reasons.push("Positive news dominance");
      if (c.risk_score > 7) reasons.push("High risk condition");

      if (!reasons.length) reasons.push("Market neutral, wait confirmation");

      return {
        ...c,
        entry,
        tp1,
        tp2,
        tp3,
        sl,
        confidence: confidence.toFixed(0),
        decision,
        reasons,
        newsImpact: newsBoost.toFixed(2)
      };
    });
  }, [coins, newsEngine]);

  // ================= FILTER =================
  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return enrichedCoins;
    return enrichedCoins.filter((c: any) => c.signal === filter);
  }, [enrichedCoins, filter]);

  // ================= PORTFOLIO RE-EVALUATION =================
  const evaluatedPortfolio = useMemo(() => {
    return portfolio.map((p: any) => {
      const pnl = p.pnl || 0;

      const score =
        pnl +
        newsEngine.bullish * 10 -
        newsEngine.bearish * 10;

      let status = "HOLD";
      if (score > 10) status = "STRONG HOLD";
      if (score < 0) status = "WEAK HOLD";
      if (score < -10) status = "EXIT NOW";

      return {
        ...p,
        status
      };
    });
  }, [portfolio, newsEngine]);

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
          <h1>INSTITUTIONAL AI TRADING ENGINE</h1>
          <p>News + Market Prediction + Portfolio AI Rebalancer</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      {/* MARKET PREDICTION DASHBOARD */}
      <section className="dashboard">
        <div>
          <h2>Market Prediction: {marketPrediction}</h2>
          <p>News-driven probabilistic forecasting</p>
        </div>

        <div>
          <h2>Risk Index</h2>
          <p>{newsEngine.risk.toFixed(2)}%</p>
        </div>
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

      {/* COINS */}
      <main className="grid">
        {filteredCoins.map((c: any) => (
          <div className="card" key={c.pair}>

            <div className="head">
              <h3>{c.pair}</h3>
              <span>{c.decision}</span>
            </div>

            <div className="entry">
              <b>ENTRY: {c.entry}</b>
              <span>Confidence: {c.confidence}%</span>
              <span>News Impact: {c.newsImpact}</span>
            </div>

            <div className="levels">
              <div>TP1: {c.tp1.toFixed(2)}</div>
              <div>TP2: {c.tp2.toFixed(2)}</div>
              <div>TP3: {c.tp3.toFixed(2)}</div>
              <div>SL: {c.sl.toFixed(2)}</div>
            </div>

            <ul>
              {c.reasons.map((r: string, i: number) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>

            <button
              disabled={loadingPair === c.pair}
              onClick={() => buy(c)}
            >
              EXECUTE BUY
            </button>

          </div>
        ))}
      </main>

      {/* PORTFOLIO */}
      <section className="panel">
        <h2>Portfolio AI Re-Evaluation</h2>

        {evaluatedPortfolio.map((p: any) => (
          <div key={p.id} className="row">
            <div>
              <b>{p.pair}</b>
              <small>PNL: {p.pnl}</small>
              <small>Status: {p.status}</small>
            </div>
            <button onClick={() => sell(p.id)}>SELL</button>
          </div>
        ))}
      </section>

      {/* STYLE */}
      <style jsx>{`
        .app { background:#0b1020; color:white; padding:24px; font-family:system-ui; }

        .topbar {
          display:flex;
          justify-content:space-between;
          border-bottom:1px solid #1f2937;
        }

        .status.on { background:#16a34a; padding:6px 12px; border-radius:999px; }
        .status.off { background:#dc2626; padding:6px 12px; border-radius:999px; }

        .dashboard {
          display:flex;
          justify-content:space-between;
          padding:16px;
          background:#111827;
          margin-top:16px;
          border-radius:12px;
        }

        .grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
          gap:12px;
          margin-top:16px;
        }

        .card {
          background:#111827;
          padding:14px;
          border-radius:12px;
        }

        .filter {
          display:flex;
          gap:8px;
          margin:16px 0;
        }

        .filter button {
          padding:8px 12px;
          background:#1f2937;
          border:none;
          color:white;
          border-radius:8px;
        }

        .filter .active { background:#2563eb; }

        .panel { margin-top:24px; }

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
