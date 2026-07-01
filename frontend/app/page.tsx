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

  // ================= LOAD =================
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    if (res.ok) setHistory(await res.json());
  };

  const loadNews = async () => {
    setNews([
      { title: "Market volatility meningkat", impact: "HIGH", direction: "BEARISH" },
      { title: "Whale accumulation terdeteksi", impact: "HIGH", direction: "BULLISH" },
      { title: "BTC sideways dominan", impact: "MEDIUM", direction: "SIDEWAYS" }
    ]);
  };

  useEffect(() => {
    loadPortfolio();
    loadHistory();
    loadNews();
  }, []);

  // ================= SAFE COINS =================
  const coins = useMemo(() => {
    return (data?.top || []).map((c: any) => ({
      pair: c.pair,
      price: c.price,
      signal: c.signal,
      score: c.score,

      // fallback UI logic (karena backend tidak kirim detail)
      whale_score: Math.log10(c.price || 1),
      momentum_score: c.score * 0.6,
      liquidity_score: Math.log1p(c.price || 1),

      confidence: Math.min(100, 50 + (c.score || 0) * 5),
      risk_score: Math.abs(c.score || 0),

      tp1: (c.price || 0) * 1.03,
      tp2: (c.price || 0) * 1.06,
      sl: (c.price || 0) * 0.98
    }));
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
        price: coin.price,
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
          <p>Real-time Quant Monitoring System</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* WARNING */}
      <div className={`warning ${marketDirection}`}>
        ⚠ MARKET: {marketDirection}  
        ⚠ Jangan entry tanpa konfirmasi trend  
        ⚠ Gunakan TP & SL wajib  
        ⚠ Hindari over-leverage saat volatilitas tinggi
      </div>

      {/* BTC */}
      <div className="card">
        <h3>BTC PRICE</h3>
        <h1>{data?.btc ?? "-"}</h1>
      </div>

      {/* NEWS */}
      <div className="news">
        <h3>NEWS</h3>
        {news.map((n, i) => (
          <div key={i} className={`news-item ${n.direction}`}>
            <b>{n.title}</b>
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

      {/* MARKET */}
      <div className="grid">
        {filteredCoins.map((c: any, i: number) => (
          <div className="coin" key={i}>

            <div className="coin-head">
              <b>{c.pair}</b>
              <span className={c.signal}>{c.signal}</span>
            </div>

            <div>PRICE: {c.price}</div>

            <div className="tp">
              <div>ENTRY: {c.price}</div>
              <div>TP1: {c.tp1}</div>
              <div>TP2: {c.tp2}</div>
              <div>SL: {c.sl}</div>
            </div>

            <div className="reason">
              <b>REASON:</b>
              <ul>
                <li>Whale: {c.whale_score.toFixed(2)}</li>
                <li>Momentum: {c.momentum_score.toFixed(2)}</li>
                <li>Liquidity: {c.liquidity_score.toFixed(2)}</li>
                <li>Confidence: {c.confidence.toFixed(1)}%</li>
                <li>Risk: {c.risk_score.toFixed(2)}</li>
              </ul>
            </div>

            <button onClick={() => addPortfolio(c)} disabled={loading}>
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

    </div>
  );
}
