"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    socket.on("market_data", (res) => {
      setData(res);
      if (res.portfolio) setPortfolio(res.portfolio);
    });
    return () => { socket.off("market_data"); };
  }, []);

  const loadPortfolio = async () => {
    const res = await fetch(`${API}/portfolio`);
    if (res.ok) setPortfolio(await res.json());
  };

  const handleBuy = async (coin: any) => {
    setLoadingAction(coin.pair);
    const tp = coin.price * 1.05; 
    const sl = coin.price * 0.97; 
    
    try {
      await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          entry_price: coin.price,
          target_tp: tp,
          target_sl: sl,
          news_headline: coin.news_headline,
          news_impact: coin.news_impact
        })
      });
      loadPortfolio();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSell = async (id: number) => {
    setLoadingAction(`sell_${id}`);
    try {
      await fetch(`${API}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      loadPortfolio(); 
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const activeCoins = data?.top || [];

  // Helper untuk progress bar Buying Pressure
  const getPressureColor = (val: number) => {
    if (val >= 80) return "#10b981"; // Bullish Overbought
    if (val <= 20) return "#8b5cf6"; // Oversold (Peluang Reversal)
    return "#3b82f6"; // Netral
  };

  return (
    <div className="dashboard">
      <header className="header">
        <div>
          <h1>⚡ AI TRADING TERMINAL V2</h1>
          <p>Advanced Quantitative Metrics | BTC: {data?.btc ? parseFloat(data.btc).toLocaleString() : "Loading..."} IDR</p>
        </div>
        <div className="status-indicator">
          <span className="dot animate-pulse"></span> QUANTS ONLINE
        </div>
      </header>

      {/* PORTFOLIO SECTION */}
      <section className="section-container portfolio-section">
        <h2 className="section-title">💼 MY PORTFOLIO (LIVE POSITIONS)</h2>
        
        {portfolio.length === 0 ? (
          <div className="empty-state">Portofolio kosong. Silakan beli koin dari Market Scanner di bawah.</div>
        ) : (
          <div className="portfolio-grid">
            {portfolio.map((p) => (
              <div key={p.id} className="porto-card">
                <div className="porto-header">
                  <h3 className="coin-name">{p.pair.replace("_", " / ").toUpperCase()}</h3>
                  <div className={`pnl-badge ${p.pnl >= 0 ? "profit" : "loss"}`}>
                    {p.pnl >= 0 ? "+" : ""}{p.pnl?.toLocaleString()} IDR
                  </div>
                </div>

                <div className="porto-details">
                  <div className="detail-item"><span>Entry Price</span><strong>{p.entry_price?.toLocaleString()}</strong></div>
                  <div className="detail-item"><span>Target TP (+5%)</span><strong className="text-green">{p.target_tp?.toLocaleString()}</strong></div>
                  <div className="detail-item"><span>Stop Loss (-3%)</span><strong className="text-red">{p.target_sl?.toLocaleString()}</strong></div>
                </div>

                <button className="btn-sell" onClick={() => handleSell(p.id)} disabled={loadingAction === `sell_${p.id}`}>
                  {loadingAction === `sell_${p.id}` ? "SELLING..." : "SELL & CLOSE POSITION"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SCANNER SECTION */}
      <section className="section-container scanner-section">
        <h2 className="section-title">📡 MARKET SCANNER & TECHNICAL INSIGHTS</h2>
        
        <div className="scanner-grid">
          {activeCoins.map((c: any) => (
            <div key={c.pair} className="scan-card">
              <div className="scan-header">
                <h3 className="coin-name">{c.pair.replace("_", " / ").toUpperCase()}</h3>
                <span className={`signal-badge ${c.signal.replace(" ", "-").toLowerCase()}`}>{c.signal}</span>
              </div>
              
              <div className="price-display">
                <span className="current-price">{c.price.toLocaleString()} IDR</span>
                <span className={`change ${c.change >= 0 ? "text-green" : "text-red"}`}>
                  {c.change >= 0 ? "↗" : "↘"} {c.change?.toFixed(2)}%
                </span>
              </div>

              {/* TECHNICAL METRICS BOX (NEW) */}
              <div className="technical-box">
                <div className="tech-row">
                  <span>Volatilitas: <b>{c.technicals.volatility}%</b></span>
                  <span>Spread Jual/Beli: <b style={{ color: parseFloat(c.technicals.spread) > 2 ? "#ef4444" : "#10b981" }}>{c.technicals.spread}%</b></span>
                </div>
                
                <div className="pressure-container">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span>Tekanan Beli (Stochastic)</span>
                    <span>{c.technicals.buying_pressure}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${c.technicals.buying_pressure}%`, 
                        background: getPressureColor(parseFloat(c.technicals.buying_pressure)) 
                      }}
                    ></div>
                  </div>
                  <p className="pressure-label">
                    {parseFloat(c.technicals.buying_pressure) >= 80 ? "🔥 Area Breakout / Overbought" : 
                     parseFloat(c.technicals.buying_pressure) <= 20 ? "📉 Area Oversold (Potensi Pantulan)" : "⚖️ Konsolidasi Netral"}
                  </p>
                </div>
              </div>

              {/* AI INSIGHTS & NEWS */}
              <div className="ai-insight-box">
                <div className="insight-title">Analisis Sentimen:</div>
                <div className="news-badge-container">
                  <span className={`impact-tag ${c.news_impact.toLowerCase()}`}>
                    {c.news_impact} BIAS
                  </span>
                </div>
                <p className="news-headline">"{c.news_headline}"</p>
                <p className="news-desc"><strong>Pengaruh:</strong> {c.impact_desc}</p>
                
                <div className="target-preview">
                  <span>Proyeksi TP: <b>{(c.price * 1.05).toLocaleString()}</b></span>
                  <span>Proyeksi SL: <b>{(c.price * 0.97).toLocaleString()}</b></span>
                </div>
              </div>

              <button className="btn-buy" onClick={() => handleBuy(c)} disabled={loadingAction === c.pair}>
                {loadingAction === c.pair ? "PROSESSING..." : "⚡ CLICK TO BUY"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* STYLES */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root { --bg: #0a0e17; --card: #131b2c; --border: #223049; --green: #10b981; --red: #ef4444; --blue: #3b82f6; --text-main: #f8fafc; --text-sub: #94a3b8; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .dashboard { background: var(--bg); color: var(--text-main); min-height: 100vh; padding: 24px; font-family: 'Inter', system-ui, sans-serif; }
        
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
        .header h1 { font-size: 22px; letter-spacing: 1px; color: #60a5fa; }
        .header p { color: var(--text-sub); font-size: 13px; margin-top: 4px; }
        
        .status-indicator { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold; color: var(--green); background: rgba(16,185,129,0.1); padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(16,185,129,0.2); }
        .dot { width: 8px; height: 8px; background: var(--green); border-radius: 50%; }
        
        .section-container { margin-bottom: 40px; }
        .section-title { font-size: 16px; color: #cbd5e1; margin-bottom: 16px; padding-left: 10px; border-left: 4px solid var(--blue); }
        
        /* PORTFOLIO GRID */
        .empty-state { background: var(--card); border: 1px dashed var(--border); padding: 30px; text-align: center; color: var(--text-sub); border-radius: 12px; }
        .portfolio-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        .porto-card { background: linear-gradient(180deg, #162032 0%, var(--card) 100%); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .porto-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .coin-name { font-size: 18px; font-weight: 800; }
        .pnl-badge { font-weight: 800; font-size: 15px; padding: 6px 10px; border-radius: 8px; }
        .pnl-badge.profit { background: rgba(16,185,129,0.15); color: var(--green); border: 1px solid rgba(16,185,129,0.3); }
        .pnl-badge.loss { background: rgba(239,68,68,0.15); color: var(--red); border: 1px solid rgba(239,68,68,0.3); }
        
        .porto-details { display: flex; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 16px; }
        .detail-item { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
        .detail-item span { color: var(--text-sub); }
        
        .btn-sell { width: 100%; padding: 12px; background: var(--red); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; text-transform: uppercase; letter-spacing: 1px; }
        .btn-sell:hover { background: #dc2626; transform: translateY(-2px); }
        .btn-sell:disabled { opacity: 0.5; cursor: not-allowed; }

        /* SCANNER GRID */
        .scanner-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
        .scan-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: 0.3s; }
        .scan-card:hover { border-color: #475569; transform: translateY(-3px); }
        .scan-header { display: flex; justify-content: space-between; align-items: center; }
        
        .signal-badge { font-size: 11px; padding: 4px 10px; border-radius: 4px; font-weight: 900; letter-spacing: 0.5px; }
        .signal-badge.strong-buy { background: #8b5cf6; color: white; box-shadow: 0 0 10px rgba(139,92,246,0.5); }
        .signal-badge.buy { background: var(--green); color: white; }
        .signal-badge.sell { background: var(--red); color: white; }
        .signal-badge.hold { background: #475569; color: white; }
        
        .price-display { margin: 12px 0; display: flex; align-items: baseline; gap: 12px; }
        .current-price { font-size: 24px; font-weight: 800; color: white; }
        .change { font-size: 14px; font-weight: bold; }
        
        /* TECHNICAL BOX */
        .technical-box { background: rgba(0,0,0,0.3); border: 1px solid #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
        .tech-row { display: flex; justify-content: space-between; font-size: 12px; color: #cbd5e1; margin-bottom: 12px; }
        .tech-row b { color: white; }
        .pressure-container { margin-top: 8px; }
        .progress-bar-bg { width: 100%; height: 6px; background: #1e293b; border-radius: 10px; overflow: hidden; }
        .progress-bar-fill { height: 100%; transition: width 0.5s ease; }
        .pressure-label { font-size: 10px; color: #94a3b8; margin-top: 6px; text-align: right; font-style: italic; }

        /* AI INSIGHT BOX */
        .ai-insight-box { background: rgba(30,41,59,0.5); border: 1px solid rgba(51,65,85,0.5); padding: 16px; border-radius: 8px; margin-bottom: 20px; }
        .insight-title { font-size: 11px; color: var(--text-sub); text-transform: uppercase; margin-bottom: 8px; font-weight: bold; }
        .impact-tag { font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: bold; display: inline-block; margin-bottom: 8px; }
        .impact-tag.bullish { background: rgba(16,185,129,0.2); color: var(--green); }
        .impact-tag.bearish { background: rgba(239,68,68,0.2); color: var(--red); }
        .impact-tag.neutral { background: rgba(148,163,184,0.2); color: #cbd5e1; }
        
        .news-headline { font-size: 13px; font-style: italic; color: #e2e8f0; margin-bottom: 6px; }
        .news-desc { font-size: 12px; color: #94a3b8; margin-bottom: 12px; line-height: 1.5; }
        
        .target-preview { display: flex; justify-content: space-between; font-size: 11px; padding-top: 10px; border-top: 1px dashed var(--border); }
        .target-preview b { color: #f8fafc; }
        
        .btn-buy { width: 100%; padding: 14px; background: var(--blue); color: white; border: none; border-radius: 8px; font-weight: 800; cursor: pointer; transition: 0.2s; font-size: 14px; box-shadow: 0 4px 12px rgba(59,130,246,0.2); }
        .btn-buy:hover { background: #2563eb; transform: translateY(-2px); box-shadow: 0 6px 16px rgba(59,130,246,0.3); }
        .btn-buy:disabled { opacity: 0.5; cursor: not-allowed; }

        .text-green { color: var(--green) !important; }
        .text-red { color: var(--red) !important; }
      `}} />
    </div>
  );
}
