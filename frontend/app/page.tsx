"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

// ================= BACKEND RAILWAY =================
const API = "https://confident-tranquility-production-ceaa.up.railway.app";

// socket harus connect ke backend railway, bukan localhost
const socket = io(API, {
  transports: ["websocket", "polling"]
});

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loading, setLoading] = useState(false);

  // ================= SOCKET CONNECTION =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // ⚠️ backend kamu emit ini: v14_engine (bukan v12_fixed)
    socket.on("v14_engine", (res) => {
      setData(res);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("v14_engine");
    };
  }, []);

  // ================= LOAD PORTFOLIO =================
  const loadPortfolio = async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      setPortfolio(await res.json());
    } catch {
      setPortfolio([]);
    }
  };

  // ================= LOAD HISTORY (SAFE FALLBACK) =================
  const loadHistory = async () => {
    try {
      const res = await fetch(`${API}/market/history`);

      // backend kamu belum punya endpoint ini → fallback safe
      if (!res.ok) {
        setHistory([]);
        return;
      }

      setHistory(await res.json());

    } catch {
      setHistory([]);
    }
  };

  // ================= STATIC NEWS =================
  const loadNews = () => {
    setNews([
      {
        title: "Market volatility meningkat signifikan",
        impact: "HIGH",
        direction: "BEARISH",
        warning: "Hindari entry agresif saat ini"
      },
      {
        title: "Whale accumulation terdeteksi",
        impact: "HIGH",
        direction: "BULLISH",
        warning: "Potensi breakout jangka pendek"
      },
      {
        title: "Bitcoin trend stabil",
        impact: "MEDIUM",
        direction: "BULLISH",
        warning: "Tunggu konfirmasi breakout"
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

      await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          price: coin.price,
          amount: 1
        })
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
          <h2>AI TRADING TERMINAL</h2>
          <p>Live Market System (Railway Connected)</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* MARKET STATUS */}
      <div className={`warning ${marketDirection}`}>
        MARKET: {marketDirection}
      </div>

      {/* COINS */}
      <div className="grid">
        {filteredCoins.map((c: any, i: number) => (
          <div className="coin" key={i}>
            <b>{c.pair}</b>
            <div>SIGNAL: {c.signal}</div>
            <div>PRICE: {c.price}</div>

            <div style={{ fontSize: 12, marginTop: 6 }}>
              SCORE: {c.score?.toFixed?.(2) || 0}
            </div>

            <button
              disabled={loading}
              onClick={() => addPortfolio(c)}
            >
              BUY
            </button>
          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3>PORTFOLIO</h3>
      {portfolio.map((p: any) => (
        <div key={p.id} className="item">
          <div>
            <b>{p.pair}</b>
            <div>ENTRY: {p.entry_price}</div>
            <div>PNL: {p.pnl}</div>
          </div>

          <button onClick={() => sellPortfolio(p.id)}>
            SELL
          </button>
        </div>
      ))}

      {/* STYLE */}
      <style jsx>{`
        .dashboard { background:#0b1220; color:#fff; padding:20px; min-height:100vh; }
        .topbar { display:flex; justify-content:space-between; }
        .status.on { background:green; padding:5px 10px; border-radius:10px; }
        .status.off { background:red; padding:5px 10px; border-radius:10px; }

        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-top:20px; }

        .coin { background:#111827; padding:10px; border-radius:10px; }

        .item { background:#111827; margin-top:10px; padding:10px; display:flex; justify-content:space-between; }
      `}</style>

    </div>
  );
}
