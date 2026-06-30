"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

const API = "http://localhost:3000";

/**
 * =========================
 * DASHBOARD STATE
 * =========================
 */
export default function Page() {
  const [market, setMarket] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<"market" | "portfolio">("market");
  const [loading, setLoading] = useState(false);

  /**
   * =========================
   * SOCKET (REALTIME MARKET)
   * =========================
   */
  useEffect(() => {
    socket.on("swing", (res) => {
      setMarket(res);
    });

    return () => {
      socket.off("swing");
    };
  }, []);

  /**
   * =========================
   * LOAD PORTFOLIO
   * =========================
   */
  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    const json = await res.json();
    setPortfolio(json);
  };

  /**
   * =========================
   * DELETE PORTFOLIO (CRUD)
   * =========================
   */
  const deletePortfolio = async (id: number) => {
    await fetch(`${API}/portfolio/${id}`, {
      method: "DELETE",
    });

    loadPortfolio();
  };

  /**
   * =========================
   * LOAD HISTORY
   * =========================
   */
  const loadHistory = async () => {
    const res = await fetch(`${API}/market/history`);
    const json = await res.json();
    setHistory(json);
  };

  /**
   * =========================
   * CREATE TRADE (BUY - CRUD)
   * =========================
   * FIX PENTING:
   * backend pakai entry_price = price
   */
  const buyTrade = async (coin: any) => {
    try {
      setLoading(true);

      if (!coin?.pair || !coin?.price) {
        alert("INVALID DATA");
        return;
      }

      const payload = {
        pair: coin.pair,
        entry_price: coin.price,
        amount: 1,
        tp1: coin.tp1,
        tp2: coin.tp2,
        sl: coin.sl,
      };

      const res = await fetch(`${API}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "FAILED BUY");
        return;
      }

      await loadPortfolio();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * =========================
   * INIT LOAD
   * =========================
   */
  useEffect(() => {
    loadPortfolio();
    loadHistory();
  }, []);

  const coins = market?.coins || [];

  return (
    <div className="app">

      {/* HEADER */}
      <div className="header">
        <h2>SMART TRADING DASHBOARD</h2>

        <div className="tabs">
          <button onClick={() => setTab("market")}>Market</button>
          <button onClick={() => setTab("portfolio")}>Portfolio</button>
        </div>
      </div>

      {/* ================= MARKET ================= */}
      {tab === "market" && (
        <div className="grid">

          {coins.map((c: any, i: number) => (
            <div className="card" key={i}>

              <div className="row">
                <b>{c.pair}</b>
                <span className={c.signal}>{c.signal}</span>
              </div>

              <div>Price: {c.price}</div>

              <div className="levels">
                <div>TP1: {c.tp1?.toFixed?.(2)}</div>
                <div>TP2: {c.tp2?.toFixed?.(2)}</div>
                <div>SL: {c.sl?.toFixed?.(2)}</div>
              </div>

              <div className="reason">{c.reason}</div>

              <button
                disabled={loading}
                onClick={() => buyTrade(c)}
                className="buy"
              >
                BUY
              </button>

            </div>
          ))}

        </div>
      )}

      {/* ================= PORTFOLIO ================= */}
      {tab === "portfolio" && (
        <div className="list">

          {portfolio.map((p) => (
            <div className="item" key={p.id}>

              <div>
                <b>{p.pair}</b>
                <div>ENTRY: {p.entry_price}</div>
                <div>TP1: {p.tp1}</div>
                <div>SL: {p.sl}</div>
              </div>

              <button onClick={() => deletePortfolio(p.id)}>
                DELETE
              </button>

            </div>
          ))}

        </div>
      )}

      {/* ================= HISTORY ================= */}
      <div className="history">
        <h3>HISTORY</h3>

        {history.slice(0, 10).map((h, i) => (
          <div key={i}>
            {h.pair} | {h.signal} | {h.score}
          </div>
        ))}
      </div>

      {/* ================= STYLE ================= */}
      <style jsx>{`
        .app {
          background: #050816;
          color: white;
          min-height: 100vh;
          padding: 20px;
          font-family: sans-serif;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .tabs button {
          margin-left: 8px;
          padding: 6px 12px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .card {
          background: #111827;
          padding: 14px;
          border-radius: 10px;
          border: 1px solid #1f2937;
        }

        .row {
          display: flex;
          justify-content: space-between;
        }

        .BUY {
          color: #22c55e;
        }

        .SELL {
          color: #ef4444;
        }

        .levels {
          margin-top: 8px;
          font-size: 13px;
        }

        .buy {
          margin-top: 10px;
          width: 100%;
          padding: 8px;
          background: #16a34a;
          border: none;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        }

        .list .item {
          display: flex;
          justify-content: space-between;
          background: #0f172a;
          padding: 10px;
          margin-top: 10px;
          border-radius: 8px;
        }

        .history {
          margin-top: 30px;
          font-size: 13px;
          opacity: 0.8;
        }
      `}</style>

    </div>
  );
}
