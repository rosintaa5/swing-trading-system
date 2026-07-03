"use client";

import { useEffect, useState, useCallback } from "react";
import { socket } from "@/lib/socket";

const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const API = rawAPI.endsWith('/') ? rawAPI.slice(0, -1) : rawAPI;

export default function Page() {
  const [data, setData] = useState<{ 
    btc: { price: number; change: number; bias: string; news: string }; 
    top: any[]; 
    watchlist: any[] 
  }>({ 
    btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Sinkronisasi..." }, 
    top: [], 
    watchlist: [] 
  });
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"scanner" | "watchlist" | "portfolio">("scanner");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setIsConnected(true);
      setErrorMessage(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      setErrorMessage("⚠️ Kehilangan koneksi dengan AI Engine di Backend. Mencoba menyambung kembali...");
    });

    socket.on("market_data", (res) => {
      if (!res.initial) {
        setData({
          btc: res.btc || data.btc,
          top: res.top || [],
          watchlist: res.watchlist || []
        });
        if (res.portfolio) {
          setPortfolio(res.portfolio);
        }
      }
    });

    return () => {
      socket.off("market_data");
      socket.off("connect_error");
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const loadDataManual = useCallback(async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (res.ok) setPortfolio(await res.json());
    } catch (e) {
      console.error("Gagal menyinkronkan data portofolio.", e);
    }
  }, []);

  const handleBuy = async (coin: any) => {
    setLoadingAction(`buy_${coin.pair}`);
    
    try {
      const res = await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          entry_price: coin.price,
          target_tp: coin.target_tp, // Data kini dihitung paten dari Backend
          target_sl: coin.target_sl,
          news_headline: coin.news_headline,
          news_impact: coin.news_impact
        })
      });
      
      const resultData = await res.json();
      if (!res.ok) throw new Error(resultData.error || "Kesalahan Server");
      
      await loadDataManual();
      alert(`✅ ${resultData.message}\nTarget TP: ${coin.target_tp}\nBatas SL: ${coin.target_sl}`);
    } catch (e: any) {
      alert(`❌ Eksekusi Gagal: ${e.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSell = async (id: number, pairName: string) => {
    setLoadingAction(`sell_${id}`);
    try {
      const res = await fetch(`${API}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      
      if (!res.ok) throw new Error();
      await loadDataManual();
      alert(`✅ Eksekusi Penjualan ${pairName.toUpperCase()} Sukses.`);
    } catch (e) {
      alert("❌ Gagal menutup posisi.");
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleWatchlist = async (pair: string, isCurrentlyWatched: boolean) => {
    setLoadingAction(`watch_${pair}`);
    try {
      if (isCurrentlyWatched) {
        await fetch(`${API}/watchlist/${pair}`, { method: "DELETE" });
      } else {
        await fetch(`${API}/watchlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pair })
        });
      }
    } catch (e) {
      console.error("Gagal memodifikasi status pantauan koin.", e);
    } finally {
      setLoadingAction(null);
    }
  };

  const getPressureColor = (val: number) => {
    if (val >= 80) return "#10b981"; 
    if (val <= 20) return "#8b5cf6"; 
    return "#3b82f6"; 
  };

  return (
    <div className="terminal-dashboard">
      <header className="terminal-header">
        <div>
          <h1>⚡ AI QUANT TRADING SYSTEM</h1>
          <p>Terminal Kalkulasi & Deteksi Sentimen Kripto Otomatis</p>
        </div>
        <div className="connection-tag">
          <span className={`status-dot ${isConnected ? 'online animate-pulse' : 'offline'}`}></span>
          {isConnected ? 'LIVE ENGINE ON' : 'CONNECTING ERROR'}
        </div>
      </header>

      {errorMessage && <div className="system-error-banner">{errorMessage}</div>}

      {/* PANEL ANALISIS BITCOIN (MARKET BIAS) */}
      <div className={`btc-master-panel ${data.btc.bias.toLowerCase()}`}>
        <div className="btc-price-block">
          <h3>BITCOIN (BTC) MARKET BIAS</h3>
          <div className="price-big-row">
            <span className="btc-price">{data.btc.price.toLocaleString()} IDR</span>
            <span className={`btc-change ${data.btc.change >= 0 ? "text-green" : "text-red"}`}>
              {data.btc.change >= 0 ? "↗" : "↘"} {data.btc.change?.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="btc-news-block">
          <strong>📝 Laporan Analisis Utama:</strong>
          <p>{data.btc.news}</p>
        </div>
      </div>

      <nav className="tab-navigation">
        <button className={activeTab === "scanner" ? "tab-btn active" : "tab-btn"} onClick={() => setActiveTab("scanner")}>
          📡 Market Scanner ({data.top.length})
        </button>
        <button className={activeTab === "watchlist" ? "tab-btn active" : "tab-btn"} onClick={() => setActiveTab("watchlist")}>
          👁️ Daftar Pantauan ({data.watchlist.length})
        </button>
        <button className={activeTab === "portfolio" ? "tab-btn active" : "tab-btn"} onClick={() => setActiveTab("portfolio")}>
          💼 Posisi Aktif ({portfolio.length})
        </button>
      </nav>

      {/* SCANNER GRID */}
      {activeTab === "scanner" && (
        <section className="terminal-section">
          <h2 className="section-title">Koin Dengan Momentum Tertinggi Saat Ini</h2>
          {data.top.length === 0 ? (
            <div className="loading-state-box">Menganalisis pergerakan ratusan aset dari Indodax...</div>
          ) : (
            <div className="terminal-grid">
              {data.top.map((c: any) => (
                <div key={c.pair} className="coin-data-card">
                  <div className="card-top-row">
                    <h3>{c.pair.replace("_", " / ").toUpperCase()}</h3>
                    <div className="action-row-header">
                      <button 
                        className={`btn-watch-toggle ${c.isWatched ? 'watched' : ''}`}
                        onClick={() => toggleWatchlist(c.pair, c.isWatched)}
                        disabled={loadingAction === `watch_${c.pair}`}
                      >
                        {c.isWatched ? "👁️ Dipantau" : "➕ Pantau"}
                      </button>
                      <span className={`signal-tag ${c.signal.replace(" ", "-").toLowerCase()}`}>{c.signal}</span>
                    </div>
                  </div>

                  <div className="card-price-row">
                    <span className="live-price-text">{c.price.toLocaleString()}</span>
                    <span className={`price-change-pct ${c.change >= 0 ? "positive" : "negative"}`}>
                      {c.change >= 0 ? "↗" : "↘"} {c.change?.toFixed(2)}%
                    </span>
                  </div>
                  
                  {/* KALKULASI RESIKO & HARGA (TAMPIL JELAS) */}
                  <div className="risk-calculation-board">
                    <div className="risk-item">
                      <span className="risk-label">Batas SL</span>
                      <strong className="text-red">{c.target_sl.toLocaleString()}</strong>
                    </div>
                    <div className="risk-item center-item">
                      <span className="risk-label">Harga Entry</span>
                      <strong className="text-white">{c.price.toLocaleString()}</strong>
                    </div>
                    <div className="risk-item right-item">
                      <span className="risk-label">Target TP</span>
                      <strong className="text-green">{c.target_tp.toLocaleString()}</strong>
                    </div>
                  </div>

                  <div className="technical-metrics-inner">
                    <div className="metric-metric-row">
                      <span>Rasio Volatilitas: <b>{c.technicals.volatility}%</b></span>
                      <span>Skor Algo: <b>{c.score.toFixed(1)} / 20</b></span>
                    </div>
                    <div className="pressure-bar-wrapper">
                      <div className="pressure-bar-label">
                        <span>Tekanan Akumulasi Pembeli</span>
                        <span>{c.technicals.buying_pressure}%</span>
                      </div>
                      <div className="bar-background">
                        <div className="bar-fill-color" style={{ width: `${c.technicals.buying_pressure}%`, background: getPressureColor(parseFloat(c.technicals.buying_pressure)) }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="ai-interpretation-container">
                    <span className={`bias-indicator ${c.news_impact.toLowerCase()}`}>{c.news_impact} SENTIMENT</span>
                    <p className="interpretation-headline">"{c.news_headline}"</p>
                    <p className="interpretation-subtext">{c.impact_desc}</p>
                  </div>

                  <button className="btn-action-buy" onClick={() => handleBuy(c)} disabled={loadingAction === `buy_${c.pair}` || c.signal === "SELL"}>
                    {loadingAction === `buy_${c.pair}` ? "Mencatat ke Database..." : c.signal === "SELL" ? "❌ Dilarang Beli (Risiko Tinggi)" : "⚡ Buka Posisi Sesuai Kalkulasi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* WATCHLIST TAB */}
      {activeTab === "watchlist" && (
        <section className="terminal-section">
          <h2 className="section-title">Aset Pengawasan Khusus</h2>
          {data.watchlist.length === 0 ? (
            <div className="empty-state-box">Belum ada aset dalam radar pantauan Anda.</div>
          ) : (
            <div className="terminal-grid">
              {data.watchlist.map((c: any) => (
                <div key={c.pair} className="coin-data-card watched-highlight">
                  {/* Bagian Atas */}
                  <div className="card-top-row">
                    <h3>{c.pair.replace("_", " / ").toUpperCase()}</h3>
                    <div className="action-row-header">
                      <button className="btn-watch-toggle watched" onClick={() => toggleWatchlist(c.pair, true)}>
                        ❌ Hapus
                      </button>
                      <span className={`signal-tag ${c.signal.replace(" ", "-").toLowerCase()}`}>{c.signal}</span>
                    </div>
                  </div>
                  
                  {/* Harga */}
                  <div className="card-price-row">
                    <span className="live-price-text">{c.price.toLocaleString()}</span>
                    <span className={`price-change-pct ${c.change >= 0 ? "positive" : "negative"}`}>
                      {c.change >= 0 ? "↗" : "↘"} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  <div className="risk-calculation-board">
                    <div className="risk-item">
                      <span className="risk-label">Batas SL</span>
                      <strong className="text-red">{c.target_sl.toLocaleString()}</strong>
                    </div>
                    <div className="risk-item right-item">
                      <span className="risk-label">Target TP</span>
                      <strong className="text-green">{c.target_tp.toLocaleString()}</strong>
                    </div>
                  </div>

                  <div className="ai-interpretation-container" style={{marginBottom: "16px"}}>
                    <p className="interpretation-headline" style={{ marginTop: "0" }}>"{c.news_headline}"</p>
                  </div>

                  <button className="btn-action-buy" onClick={() => handleBuy(c)} disabled={loadingAction === `buy_${c.pair}` || c.signal === "SELL"}>
                    {c.signal === "SELL" ? "Tunggu Momen Lebih Baik" : "⚡ Eksekusi Pembelian"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PORTFOLIO TAB */}
      {activeTab === "portfolio" && (
        <section className="terminal-section">
          <h2 className="section-title">Catatan Posisi Tersimpan (Database)</h2>
          {portfolio.length === 0 ? (
            <div className="empty-state-box">Buku portofolio Anda kosong. Silakan masuk ke pasar.</div>
          ) : (
            <div className="portfolio-flex-list">
              {portfolio.map((p) => (
                <div key={p.id} className="portfolio-row-card">
                  <div className="portfolio-main-info">
                    <h3>{p.pair.replace("_", " / ").toUpperCase()}</h3>
                    <span className="portfolio-date">Terbuka: {new Date(p.created_at).toLocaleString('id-ID')}</span>
                  </div>
                  
                  <div className="portfolio-pricing-data">
                    <div className="price-sub-block"><span>Entry Sistem</span><b>{p.entry_price?.toLocaleString()}</b></div>
                    <div className="price-sub-block"><span>Area TP (Otomatis)</span><b className="text-green">{p.target_tp?.toLocaleString()}</b></div>
                    <div className="price-sub-block"><span>Batas SL (Otomatis)</span><b className="text-red">{p.target_sl?.toLocaleString()}</b></div>
                  </div>

                  <div className="portfolio-pnl-block">
                    <span>Proyeksi Keuntungan (PnL)</span>
                    <strong className={p.pnl >= 0 ? "text-green" : "text-red"}>
                      {p.pnl >= 0 ? "+" : ""}{p.pnl?.toLocaleString(undefined, { maximumFractionDigits: 2 })} IDR
                    </strong>
                  </div>

                  <button className="btn-close-trading" onClick={() => handleSell(p.id, p.pair)} disabled={loadingAction === `sell_${p.id}`}>
                    {loadingAction === `sell_${p.id}` ? "Memproses..." : "Tutup Transaksi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* STYLESHEET TERMINAL */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-main: #070a13; --bg-card: #0f1524; --bg-inner: #151d33;
          --border-color: #1e2942; --text-primary: #f1f5f9; --text-secondary: #94a3b8;
          --color-green: #10b981; --color-red: #ef4444; --color-blue: #2563eb; --color-purple: #8b5cf6;
          --color-yellow: #f59e0b;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: var(--bg-main); color: var(--text-primary); font-family: 'SF Pro Display', -apple-system, sans-serif; }
        .text-green { color: var(--color-green) !important; }
        .text-red { color: var(--color-red) !important; }
        .text-white { color: #ffffff !important; }
        
        .terminal-dashboard { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .terminal-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); margin-bottom: 20px; }
        .terminal-header h1 { font-size: 24px; font-weight: 800; color: #3b82f6; }
        .terminal-header p { font-size: 13px; color: var(--text-secondary); margin-top: 5px; }
        
        /* BTC MASTER PANEL */
        .btc-master-panel { display: flex; flex-wrap: wrap; gap: 20px; padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); margin-bottom: 30px; background: var(--bg-card); align-items: center; }
        .btc-master-panel.bullish { border-color: rgba(16,185,129,0.4); box-shadow: 0 0 15px rgba(16,185,129,0.1); }
        .btc-master-panel.bearish { border-color: rgba(239,68,68,0.4); box-shadow: 0 0 15px rgba(239,68,68,0.1); }
        .btc-price-block h3 { font-size: 12px; color: var(--text-secondary); letter-spacing: 1px; margin-bottom: 5px; }
        .price-big-row { display: flex; align-items: baseline; gap: 12px; }
        .btc-price { font-size: 32px; font-weight: 800; color: white; }
        .btc-change { font-size: 16px; font-weight: 700; }
        .btc-news-block { flex: 1; min-width: 300px; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; font-size: 14px; line-height: 1.5; color: #cbd5e1; border-left: 4px solid var(--color-blue); }
        .btc-master-panel.bullish .btc-news-block { border-left-color: var(--color-green); }
        .btc-master-panel.bearish .btc-news-block { border-left-color: var(--color-red); }

        .connection-tag { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; background: rgba(255,255,255,0.03); padding: 6px 14px; border-radius: 30px; border: 1px solid var(--border-color); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .status-dot.online { background: var(--color-green); box-shadow: 0 0 8px var(--color-green); }
        .status-dot.offline { background: var(--color-red); }
        
        .system-error-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-red); color: #fca5a5; padding: 12px; border-radius: 8px; margin-bottom: 25px; font-size: 13px; text-align: center; font-weight: 600; }
        
        .tab-navigation { display: flex; gap: 10px; margin-bottom: 25px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
        .tab-btn { background: none; border: none; color: var(--text-secondary); padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
        .tab-btn:hover { background: rgba(255,255,255,0.02); color: var(--text-primary); }
        .tab-btn.active { background: var(--color-blue); color: white; }
        
        .terminal-section { animation: fadeIn 0.3s ease-in-out; }
        .section-title { font-size: 16px; font-weight: 700; color: var(--text-secondary); margin-bottom: 20px; text-transform: uppercase; }
        
        .loading-state-box, .empty-state-box { background: var(--bg-card); border: 1px dashed var(--border-color); padding: 40px; text-align: center; color: var(--text-secondary); border-radius: 8px; font-size: 14px; }
        
        /* GRID CARDS */
        .terminal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px; }
        .coin-data-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, border-color 0.2s; }
        .coin-data-card:hover { transform: translateY(-3px); border-color: #3b82f6; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        .coin-data-card.watched-highlight { border-left: 4px solid var(--color-purple); }
        
        .card-top-row { display: flex; justify-content: space-between; align-items: center; }
        .card-top-row h3 { font-size: 18px; font-weight: 800; color: white; }
        .action-row-header { display: flex; align-items: center; gap: 8px; }
        
        .btn-watch-toggle { background: #1e293b; border: 1px solid #334155; color: var(--text-primary); padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .btn-watch-toggle:hover { background: #334155; }
        .btn-watch-toggle.watched { background: rgba(139, 92, 246, 0.2); border-color: var(--color-purple); color: #d8b4fe; }
        
        .signal-tag { font-size: 10px; font-weight: 900; padding: 4px 8px; border-radius: 4px; letter-spacing: 0.5px; }
        .signal-tag.strong-buy { background: var(--color-purple); color: white; }
        .signal-tag.buy { background: var(--color-green); color: white; }
        .signal-tag.hold { background: #475569; color: white; }
        .signal-tag.sell { background: var(--color-red); color: white; }
        
        .card-price-row { display: flex; align-items: baseline; gap: 10px; margin: 15px 0 20px 0; }
        .live-price-text { font-size: 26px; font-weight: 800; color: white; }
        .price-change-pct { font-size: 13px; font-weight: 700; }
        .price-change-pct.positive { color: var(--color-green); }
        .price-change-pct.negative { color: var(--color-red); }
        
        /* NEW RISK CALCULATION BOARD */
        .risk-calculation-board { display: flex; justify-content: space-between; background: #0c101c; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; margin-bottom: 18px; }
        .risk-item { display: flex; flex-direction: column; gap: 4px; }
        .risk-item.center-item { text-align: center; border-left: 1px solid #1e293b; border-right: 1px solid #1e293b; padding: 0 15px; }
        .risk-item.right-item { text-align: right; }
        .risk-label { font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .risk-item strong { font-size: 13px; font-weight: 700; }

        .technical-metrics-inner { background: var(--bg-inner); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,0.02); }
        .metric-metric-row { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 12px; }
        .metric-metric-row b { color: white; }
        
        .pressure-bar-wrapper { display: flex; flex-direction: column; gap: 6px; }
        .pressure-bar-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); font-weight: 600;}
        .bar-background { width: 100%; height: 6px; background: #1e293b; border-radius: 10px; overflow: hidden; }
        .bar-fill-color { height: 100%; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        
        /* AI INTERPRETATION */
        .ai-interpretation-container { background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.05); padding: 14px; border-radius: 8px; margin-bottom: 18px; }
        .bias-indicator { font-size: 9px; font-weight: 900; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px; letter-spacing: 0.5px; }
        .bias-indicator.bullish { background: rgba(16,185,129,0.2); color: var(--color-green); }
        .bias-indicator.bearish { background: rgba(239,68,68,0.2); color: var(--color-red); }
        .bias-indicator.neutral { background: rgba(255,255,255,0.1); color: var(--text-secondary); }
        .interpretation-headline { color: #f1f5f9; font-style: italic; font-weight: 600; font-size: 13px; line-height: 1.4; margin-bottom: 6px; }
        .interpretation-subtext { color: #94a3b8; font-size: 11px; line-height: 1.5; }
        
        .btn-action-buy { width: 100%; background: var(--color-blue); color: white; border: none; padding: 14px; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 10px rgba(37,99,235,0.2); }
        .btn-action-buy:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
        .btn-action-buy:disabled { opacity: 0.4; cursor: not-allowed; background: #334155; box-shadow: none; }
        
        /* PORTFOLIO ROWS */
        .portfolio-flex-list { display: flex; flex-direction: column; gap: 15px; }
        .portfolio-row-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 20px; display: flex; justify-content: space-between; align-items: center; transition: border-color 0.2s; }
        .portfolio-row-card:hover { border-color: #3b82f6; }
        
        .portfolio-main-info h3 { font-size: 18px; font-weight: 800; color: white; }
        .portfolio-date { font-size: 12px; color: var(--text-secondary); display: block; margin-top: 6px; }
        
        .portfolio-pricing-data { display: flex; gap: 40px; background: #0c101c; padding: 12px 20px; border-radius: 8px; border: 1px solid #1e293b; }
        .price-sub-block { display: flex; flex-direction: column; gap: 6px; font-size: 11px; }
        .price-sub-block span { color: var(--text-secondary); font-weight: 600; }
        .price-sub-block b { font-size: 14px; font-weight: 700; color: #f8fafc; }
        
        .portfolio-pnl-block { display: flex; flex-direction: column; gap: 6px; text-align: right; min-width: 150px; }
        .portfolio-pnl-block span { font-size: 11px; color: var(--text-secondary); font-weight: 600; }
        .portfolio-pnl-block strong { font-size: 18px; font-weight: 900; }
        
        .btn-close-trading { background: var(--color-red); color: white; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; transition: background 0.2s; }
        .btn-close-trading:hover:not(:disabled) { background: #dc2626; box-shadow: 0 4px 10px rgba(220,38,38,0.2); }
        .btn-close-trading:disabled { opacity: 0.5; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
