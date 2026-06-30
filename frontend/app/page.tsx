"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

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
    socket.on("swing", (res) => setData(res));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("swing");
    };
  }, []);

  // ================= API WRAPPER =================
  const api = "http://localhost:3000";

  // ================= CRUD PORTFOLIO =================
  const addPortfolio = async (coin: any) => {
    try {
      setLoading(true);

      if (!coin?.pair) return alert("PAIR INVALID");

      const res = await fetch(`${api}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          entry_price: coin.entry,
          amount: 1,
          tp1: coin.tp1,
          tp2: coin.tp2,
          sl: coin.sl
        })
      });

      if (!res.ok) throw new Error("Failed BUY");

      await loadPortfolio();
      alert("ORDER CREATED");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPortfolio = async () => {
    const res = await fetch(`${api}/portfolio`);
    const json = await res.json();
    setPortfolio(json);
  };

  const deletePortfolio = async (id: number) => {
    await fetch(`${api}/portfolio/${id}`, { method: "DELETE" });
    loadPortfolio();
  };

  const loadHistory = async () => {
    const res = await fetch(`${api}/market/history`);
    const json = await res.json();
    setHistory(json);
  };

  // ================= FILTER =================
  const coins =
    data?.coins?.filter((c: any) =>
      filter === "ALL" ? true : c.signal === filter
    ) || [];

  return (
    <div className="dashboard">

      {/* TOP BAR */}
      <div className="topbar">
        <div>
          <h2>AI TRADING TERMINAL</h2>
          <p className="sub">Realtime crypto signal engine</p>
        </div>

        <div className={`status ${connected ? "on" : "off"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </div>
      </div>

      {/* BTC CARD */}
      <div className="card hero">
        <h3>BITCOIN</h3>
        <h1>{data?.btc ?? "-"}</h1>
        <span>24H: {data?.btcChange ?? 0}%</span>
      </div>

      {/* FILTER BAR */}
      <div className="row">
        <button onClick={() => setFilter("ALL")}>ALL</button>
        <button onClick={() => setFilter("BUY")}>BUY</button>
        <button onClick={() => setFilter("SELL")}>SELL</button>
        <button onClick={loadPortfolio}>PORTFOLIO</button>
        <button onClick={loadHistory}>HISTORY</button>
      </div>

      {/* COINS GRID */}
      <div className="grid">
        {coins.map((c: any, i: number) => (
          <div className="coin" key={i}>

            <div className="coin-head">
              <b>{c.pair}</b>
              <span className={c.signal}>{c.signal}</span>
            </div>

            <div className="price">Price: {c.price}</div>
            <div>Entry: {c.entry}</div>

            <div className="tp">
              <div>TP1: {c.tp1?.toFixed?.(2)}</div>
              <div>TP2: {c.tp2?.toFixed?.(2)}</div>
              <div>SL: {c.sl?.toFixed?.(2)}</div>
            </div>

            <div className="reason">{c.reason}</div>

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
                    `${c.pair}\nENTRY:${c.entry}\nTP1:${c.tp1}\nTP2:${c.tp2}\nSL:${c.sl}`
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
          align-items: center;
        }

        .sub {
          opacity: 0.6;
          font-size: 12px;
        }

        .status {
          padding: 6px 12px;
          border-radius: 20px;
        }

        .on {
          background: #16a34a;
        }

        .off {
          background: #dc2626;
        }

        .card.hero {
          margin-top: 20px;
          padding: 20px;
          background: #0f172a;
          border-radius: 12px;
        }

        .row {
          display: flex;
          gap: 8px;
          margin-top: 15px;
          flex-wrap: wrap;
        }

        button {
          padding: 8px 12px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .coin {
          background: #111827;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid #1f2937;
        }

        .coin-head {
          display: flex;
          justify-content: space-between;
        }

        .BUY {
          color: #22c55e;
        }

        .SELL {
          color: #ef4444;
        }

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
          padding: 10px;
          background: #0f172a;
          margin-top: 8px;
          border-radius: 8px;
        }

        .section {
          margin-top: 25px;
        }

        .history {
          margin-top: 10px;
          font-size: 13px;
          opacity: 0.8;
        }
      `}</style>

    </div>
  );
}
