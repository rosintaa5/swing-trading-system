"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

const API = "http://localhost:3000";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loading, setLoading] = useState(false);

  // ================= SOCKET =================
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("swing", (res) => {
      setData(res);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("swing");
    };
  }, []);

  // ================= SAFE COINS =================
  const coins =
    data?.coins?.filter((c: any) => c && c.price > 0) || [];

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

  // ================= BUY (FIXED TOTAL) =================
  const addPortfolio = async (coin: any) => {
    try {
      setLoading(true);

      if (!coin?.pair || !coin?.price) {
        alert("INVALID DATA");
        return;
      }

      const payload = {
        pair: coin.pair,
        entry_price: coin.price, // ✔ FIX IMPORTANT
        amount: 1,
        tp1: coin.tp1 || coin.price * 1.03,
        tp2: coin.tp2 || coin.price * 1.06,
        sl: coin.sl || coin.price * 0.98
      };

      const res = await fetch(`${API}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "BUY FAILED");
      }

      await loadPortfolio();
      alert("ORDER CREATED");

    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ================= DELETE =================
  const deletePortfolio = async (id: number) => {
    await fetch(`${API}/portfolio/${id}`, {
      method: "DELETE"
    });

    loadPortfolio();
  };

  // ================= FILTER =================
  const filteredCoins =
    filter === "ALL"
      ? coins
      : coins.filter((c: any) => c.signal === filter);

  return (
    <div className="dashboard">

      {/* HEADER */}
      <div className="topbar">
        <div>
          <h2>SMART TRADING DASHBOARD</h2>
          <p className="sub">Realtime AI Market Engine</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* BTC */}
      <div className="card hero">
        <h3>BITCOIN</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <span>24H: {data?.btcChange ?? 0}%</span>
      </div>

      {/* FILTER */}
      <div className="row">
        <button onClick={() => setFilter("ALL")}>ALL</button>
        <button onClick={() => setFilter("BUY")}>BUY</button>
        <button onClick={() => setFilter("SELL")}>SELL</button>
        <button onClick={loadPortfolio}>PORTFOLIO</button>
        <button onClick={loadHistory}>HISTORY</button>
      </div>

      {/* MARKET */}
      <div className="grid">
        {filteredCoins.map((c: any, i: number) => (
          <div className="coin" key={i}>

            <div className="coin-head">
              <b>{c.pair || "UNKNOWN"}</b>
              <span className={c.signal}>{c.signal}</span>
            </div>

            <div>Price: {c.price}</div>

            <div className="tp">
              <div>TP1: {c.tp1}</div>
              <div>TP2: {c.tp2}</div>
              <div>SL: {c.sl}</div>
            </div>

            <div className="actions">
              <button
                className="buy"
                disabled={loading}
                onClick={() => addPortfolio(c)}
              >
                BUY
              </button>

              <button
                className="ghost"
                onClick={() =>
                  alert(
                    `${c.pair}\nPRICE:${c.price}\nTP1:${c.tp1}\nTP2:${c.tp2}\nSL:${c.sl}`
                  )
                }
              >
                DETAIL
              </button>
            </div>

          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <h3 className="section">PORTFOLIO</h3>

      <div className="list">
        {portfolio.map((p: any) => (
          <div className="item" key={p.id}>
            <div>
              <b>{p.pair}</b>
              <small>ENTRY: {p.entry_price}</small>
              <small>TP1: {p.tp1}</small>
              <small>SL: {p.sl}</small>
            </div>

            <button onClick={() => deletePortfolio(p.id)}>
              DELETE
            </button>
          </div>
        ))}
      </div>

      {/* HISTORY */}
      <h3 className="section">HISTORY</h3>

      <div className="history">
        {history.slice(0, 10).map((h: any, i: number) => (
          <div key={i}>
            {h.pair} | {h.signal} | {h.score}
          </div>
        ))}
      </div>

      {/* STYLE */}
      <style jsx>{`
        .dashboard {
          background: #050816;
          color: white;
          min-height: 100vh;
          padding: 20px;
          font-family: sans-serif;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
        }

        .status.on { background: #16a34a; padding:6px 12px; border-radius:20px; }
        .status.off { background: #dc2626; padding:6px 12px; border-radius:20px; }

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

        .actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }

        .buy {
          background: #16a34a;
          color: white;
        }

        .ghost {
          background: #334155;
          color: white;
        }

        .list .item {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding: 10px;
          background: #0f172a;
          border-radius: 8px;
        }
      `}</style>

    </div>
  );
}
