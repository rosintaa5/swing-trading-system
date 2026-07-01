"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [loadingPair, setLoadingPair] = useState<string | null>(null);

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

  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    setPortfolio(await res.json());
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  const coins = useMemo(() => {
    if (!data?.top) return [];
    return data.top.filter((c: any) => c?.price > 0);
  }, [data]);

  // ================= DYNAMIC NARRATIVE ENGINE =================
  const enrichedCoins = useMemo(() => {
    return coins.map((c: any) => {
      const entry = c.price;

      const tp1 = entry * 1.02;
      const tp2 = entry * 1.05;
      const sl = entry * 0.97;

      const whale = c.whale_score || 0;
      const momentum = c.momentum_score || 0;
      const liquidity = c.liquidity_score || 0;
      const risk = c.risk_score || 0;

      const newsBias = 0.6;

      const confidence = Math.min(
        100,
        whale * 10 + momentum * 8 + newsBias * 20
      );

      const score =
        whale * 0.4 +
        momentum * 0.3 +
        liquidity * 0.2 +
        newsBias * 10 -
        risk * 0.5;

      let decision = "HOLD";
      if (score > 6) decision = "BUY STRONG";
      if (score < 3) decision = "EXIT";
      if (score > 4 && c.signal === "SELL") decision = "TAKE PROFIT";

      // ================= DYNAMIC SENTENCE ENGINE =================
      const analysis: string[] = [];

      // WHALE LOGIC
      if (whale > 7) {
        analysis.push(
          `Aktivitas whale berada pada level tinggi (${whale.toFixed(
            2
          )}), mengindikasikan potensi akumulasi oleh institusi besar.`
        );
      } else if (whale > 4) {
        analysis.push(
          `Whale activity terdeteksi moderat (${whale.toFixed(
            2
          )}), menunjukkan adanya distribusi terbatas.`
        );
      } else {
        analysis.push(
          `Tidak terdapat aktivitas whale signifikan (${whale.toFixed(
            2
          )}), pasar masih didominasi retail trader.`
        );
      }

      // MOMENTUM LOGIC
      if (momentum > 7) {
        analysis.push(
          `Momentum sangat kuat (${momentum.toFixed(
            2
          )}), harga menunjukkan dorongan bullish yang konsisten.`
        );
      } else if (momentum > 4) {
        analysis.push(
          `Momentum sedang (${momentum.toFixed(
            2
          )}), trend masih terbentuk namun belum solid.`
        );
      } else {
        analysis.push(
          `Momentum lemah (${momentum.toFixed(
            2
          )}), market cenderung sideways atau konsolidasi.`
        );
      }

      // LIQUIDITY LOGIC
      if (liquidity > 7) {
        analysis.push(
          `Likuiditas tinggi (${liquidity.toFixed(
            2
          )}), kondisi ideal untuk entry dan exit tanpa slippage besar.`
        );
      } else {
        analysis.push(
          `Likuiditas terbatas (${liquidity.toFixed(
            2
          )}), risiko slippage meningkat pada volatilitas tinggi.`
        );
      }

      // RISK LOGIC
      if (risk > 7) {
        analysis.push(
          `Risiko pasar tinggi (${risk.toFixed(
            2
          )}), disarankan mengurangi eksposur posisi.`
        );
      } else if (risk > 4) {
        analysis.push(
          `Risiko moderat (${risk.toFixed(
            2
          )}), gunakan manajemen risiko ketat.`
        );
      } else {
        analysis.push(
          `Risiko rendah (${risk.toFixed(
            2
          )}), kondisi market relatif stabil.`
        );
      }

      // NEWS LOGIC
      if (newsBias > 0.6) {
        analysis.push(
          `Sentimen news saat ini bullish (${newsBias.toFixed(
            2
          )}), memberikan dorongan tambahan pada harga.`
        );
      } else {
        analysis.push(
          `Sentimen news netral (${newsBias.toFixed(
            2
          )}), tidak memberikan dorongan signifikan.`
        );
      }

      // FINAL CONCLUSION
      analysis.push(`Kesimpulan sistem: posisi ini direkomendasikan untuk ${decision}.`);

      return {
        ...c,
        entry,
        tp1,
        tp2,
        sl,
        confidence: confidence.toFixed(0),
        score: score.toFixed(2),
        decision,
        analysis
      };
    });
  }, [coins]);

  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return enrichedCoins;
    return enrichedCoins.filter((c: any) => c.signal === filter);
  }, [enrichedCoins, filter]);

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

  return (
    <div className="app">

      {/* HEADER */}
      <div className="topbar">
        <h1>DYNAMIC AI TRADING ENGINE</h1>
        <span>{connected ? "LIVE" : "OFFLINE"}</span>
      </div>

      {/* GRID */}
      <div className="grid">
        {filteredCoins.map((c: any) => (
          <div className="card" key={c.pair}>

            <h3>{c.pair}</h3>

            <div className="metrics">
              <div>Score: {c.score}</div>
              <div>Confidence: {c.confidence}%</div>
              <div>Entry: {c.entry}</div>
              <div>TP: {c.tp1.toFixed(2)} / {c.tp2.toFixed(2)}</div>
              <div>SL: {c.sl.toFixed(2)}</div>
            </div>

            {/* DYNAMIC ANALYSIS */}
            <div className="analysis">
              {c.analysis.map((a: string, i: number) => (
                <p key={i}>• {a}</p>
              ))}
            </div>

            <button
              disabled={loadingPair === c.pair}
              onClick={() => buy(c)}
            >
              BUY
            </button>

          </div>
        ))}
      </div>

      {/* PORTFOLIO */}
      <div className="portfolio">
        <h2>PORTFOLIO</h2>

        {portfolio.map((p: any) => (
          <div key={p.id} className="row">
            <div>
              <b>{p.pair}</b>
              <small>PNL: {p.pnl}</small>
            </div>
            <button onClick={() => sell(p.id)}>SELL</button>
          </div>
        ))}
      </div>

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
          padding-bottom:10px;
        }

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
          line-height:1.5;
        }

        .metrics {
          font-size:13px;
          margin-top:8px;
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
