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

  // ================= ADVANCED SCORING ENGINE =================
  const enrichedCoins = useMemo(() => {
    return coins.map((c: any) => {
      const entry = c.price;

      // PRICE TARGETS
      const tp1 = entry * 1.015;
      const tp2 = entry * 1.04;
      const tp3 = entry * 1.08;

      const sl = entry * 0.97;

      // RAW FACTORS
      const momentum = c.momentum_score || 0;
      const whale = c.whale_score || 0;
      const liquidity = c.liquidity_score || 0;

      // NEWS BIAS SIMULATION
      const news_bias = 0.62;

      // RISK PENALTY FUNCTION
      const risk_penalty = (c.risk_score || 0) * 0.4;

      // FINAL SCORE FORMULA (REAL ENGINE)
      const finalScore =
        whale * 0.35 +
        momentum * 0.30 +
        liquidity * 0.15 +
        news_bias * 10 * 0.20 -
        risk_penalty;

      // CONFIDENCE
      const confidence = Math.min(100, finalScore * 10);

      // PRICE PREDICTION RANGE
      const predictedLow = entry * 0.97;
      const predictedMid = entry * 1.02;
      const predictedHigh = entry * 1.07;

      // DECISION ENGINE
      let decision = "HOLD";

      if (finalScore > 7 && c.signal === "BUY") decision = "STRONG BUY";
      else if (finalScore > 5) decision = "BUY SETUP";
      else if (finalScore < 3) decision = "EXIT NOW";
      else if (c.signal === "SELL") decision = "TAKE PROFIT";

      // NARRATIVE ANALYSIS ENGINE (MULTI SENTENCE)
      const analysis = [
        `Market menunjukkan momentum sebesar ${momentum.toFixed(2)} yang mengindikasikan ${momentum > 5 ? "trend kuat" : "trend lemah"}.`,
        `Aktivitas whale berada pada level ${whale.toFixed(2)} yang menandakan ${whale > 6 ? "akumulasi signifikan" : "aktivitas normal"}.`,
        `Likuiditas saat ini ${liquidity.toFixed(2)} yang menunjukkan ${liquidity > 6 ? "area perdagangan sehat" : "potensi slippage tinggi"}.`,
        `Sentimen news memberi bias ${news_bias > 0.6 ? "positif" : "netral hingga negatif"} terhadap market.`,
        `Risk score berada pada ${c.risk_score || 0}, sehingga kondisi ${(c.risk_score || 0) > 6 ? "cukup berbahaya" : "masih terkendali"}.`,
        `Kesimpulan sistem: coin ini berada pada fase ${decision}.`
      ];

      return {
        ...c,
        entry,
        tp1,
        tp2,
        tp3,
        sl,
        confidence: confidence.toFixed(0),
        finalScore: finalScore.toFixed(2),
        predictedLow,
        predictedMid,
        predictedHigh,
        decision,
        analysis
      };
    });
  }, [coins]);

  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return enrichedCoins;
    return enrichedCoins.filter((c: any) => c.signal === filter);
  }, [enrichedCoins, filter]);

  // ================= PORTFOLIO ENGINE =================
  const evaluatedPortfolio = useMemo(() => {
    return portfolio.map((p: any) => {
      const pnl = p.pnl || 0;

      const score = pnl + 5;

      let status = "HOLD";

      if (score > 10) status = "STRONG HOLD";
      else if (score > 3) status = "HOLD";
      else if (score < 0) status = "WEAK HOLD";
      else if (score < -5) status = "EXIT NOW";

      return {
        ...p,
        status
      };
    });
  }, [portfolio]);

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
          <h1>ULTRA AI TRADING INTELLIGENCE</h1>
          <p>Multi-factor scoring + narrative analysis engine</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </header>

      {/* GRID */}
      <div className="grid">
        {filteredCoins.map((c: any) => (
          <div className="card" key={c.pair}>

            <div className="head">
              <h3>{c.pair}</h3>
              <span>{c.decision}</span>
            </div>

            <div className="metrics">
              <b>Score: {c.finalScore}</b>
              <b>Confidence: {c.confidence}%</b>
            </div>

            <div className="price">
              <div>ENTRY: {c.entry}</div>
              <div>TP1: {c.tp1.toFixed(2)}</div>
              <div>TP2: {c.tp2.toFixed(2)}</div>
              <div>TP3: {c.tp3.toFixed(2)}</div>
              <div>SL: {c.sl.toFixed(2)}</div>
            </div>

            <div className="prediction">
              <b>Prediction Range</b>
              <p>Low: {c.predictedLow.toFixed(2)}</p>
              <p>Mid: {c.predictedMid.toFixed(2)}</p>
              <p>High: {c.predictedHigh.toFixed(2)}</p>
            </div>

            <div className="analysis">
              <b>AI Analysis</b>
              {c.analysis.map((a: string, i: number) => (
                <p key={i}>• {a}</p>
              ))}
            </div>

            <button
              disabled={loadingPair === c.pair}
              onClick={() => buy(c)}
            >
              EXECUTE BUY
            </button>

          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <div className="portfolio">
        <h2>Portfolio Intelligence</h2>

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
      </div>

      {/* STYLE */}
      <style jsx>{`
        .app {
          background:#0b0f1a;
          color:white;
          padding:24px;
          font-family:system-ui;
        }

        .topbar {
          display:flex;
          justify-content:space-between;
          border-bottom:1px solid #1f2937;
        }

        .status.on { background:#16a34a; padding:6px 12px; border-radius:999px; }
        .status.off { background:#dc2626; padding:6px 12px; border-radius:999px; }

        .grid {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
          gap:12px;
          margin-top:16px;
        }

        .card {
          background:#111827;
          padding:16px;
          border-radius:12px;
        }

        .analysis {
          font-size:12px;
          opacity:0.85;
          margin-top:10px;
        }

        .prediction {
          font-size:12px;
          margin-top:8px;
          color:#93c5fd;
        }

        .portfolio {
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

        button {
          width:100%;
          margin-top:10px;
          padding:10px;
          border:none;
          border-radius:10px;
          background:#2563eb;
          color:white;
        }
      `}</style>

    </div>
  );
}
