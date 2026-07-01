"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

// ================= BACKEND RAILWAY =================
const API = "https://confident-tranquility-production-ceaa.up.railway.app";

// socket connect ke backend
const socket = io(API, {
  transports: ["websocket", "polling"]
});

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  // ================= SOCKET =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    // ⚠️ HARUS SESUAI BACKEND: v14_engine
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
      const json = await res.json();
      setPortfolio(json || []);
    } catch {
      setPortfolio([]);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  // ================= SAFE COINS =================
  const coins = useMemo(() => {
    return Array.isArray(data?.top) ? data.top : [];
  }, [data]);

  // ================= FILTER COINS =================
  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return coins;
    return coins.filter((c: any) => c.signal === filter);
  }, [coins, filter]);

  // ================= MARKET DIRECTION (FIXED) =================
  const marketDirection = useMemo(() => {
    if (!coins.length) return "NO DATA";

    const buy = coins.filter((c: any) => c.signal === "BUY").length;
    const sell = coins.filter((c: any) => c.signal === "SELL").length;

    if (buy > sell) return "BULLISH";
    if (sell > buy) return "BEARISH";
    return "SIDEWAYS";
  }, [coins]);

  // ================= BUY =================
  const buyCoin = async (coin: any) => {
    await fetch(`${API}/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pair: coin.pair,
        price: coin.price,
        amount: 1
      })
    });

    loadPortfolio();
  };

  // ================= SELL =================
  const sellCoin = async (id: number) => {
    await fetch(`${API}/sell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });

    loadPortfolio();
  };

  return (
    <div className="wrap">

      {/* HEADER */}
      <div className="header">
        <div>
          <h2>AI TRADING TERMINAL</h2>
          <p>Railway Live System</p>
        </div>

        <div className={connected ? "live" : "off"}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* MARKET STATUS FIXED */}
      <div className={`market ${marketDirection}`}>
        MARKET: {marketDirection}
      </div>

      {/* COINS GRID */}
      <div className="grid">
        {filteredCoins.length === 0 && (
          <div className="empty">
            NO MARKET DATA - CHECK BACKEND SOCKET
          </div>
        )}

        {filteredCoins.map((c: any, i: number) => (
          <div className="card" key={i}>
            <b>{c.pair}</b>

            <div className={`signal ${c.signal}`}>
              {c.signal}
            </div>

            <div>PRICE: {c.price}</div>
            <div>SCORE: {c.score?.toFixed?.(2) || 0}</div>

            <button onClick={() => buyCoin(c)}>
              BUY
            </button>
          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3>PORTFOLIO</h3>

      {portfolio.length === 0 && (
        <div className="empty">NO PORTFOLIO</div>
      )}

      {portfolio.map((p: any) => (
        <div className="portfolio" key={p.id}>
          <div>
            <b>{p.pair}</b>
            <div>ENTRY: {p.entry_price}</div>
            <div>PNL: {p.pnl}</div>
          </div>

          <button onClick={() => sellCoin(p.id)}>
            SELL
          </button>
        </div>
      ))}

      {/* STYLE */}
      <style jsx>{`
        .wrap { background:#0b1220; color:white; min-height:100vh; padding:20px; }

        .header { display:flex; justify-content:space-between; }

        .live { background:green; padding:5px 10px; border-radius:10px; }
        .off { background:red; padding:5px 10px; border-radius:10px; }

        .market { margin-top:15px; padding:10px; border-radius:8px; }

        .BULLISH { background:#052e16; }
        .BEARISH { background:#450a0a; }
        .SIDEWAYS { background:#1e293b; }
        .NO\ DATA { background:#111827; }

        .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-top:20px; }

        .card { background:#111827; padding:10px; border-radius:10px; }

        .signal { font-size:12px; margin:5px 0; }

        .BUY { color:#22c55e; }
        .SELL { color:#ef4444; }

        .portfolio { display:flex; justify-content:space-between; background:#111827; padding:10px; margin-top:10px; }

        .empty { padding:20px; color:#9ca3af; }
      `}</style>

    </div>
  );
}
