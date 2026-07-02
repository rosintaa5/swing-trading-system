"use client";

import { useEffect, useState, useCallback } from "react";
import { socket } from "@/lib/socket";

// Mengambil URL dari env, jika tidak ada pakai lokal
const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Otomatis menghapus tanda miring di akhir jika tidak sengaja tertulis
const API = rawAPI.endsWith('/') ? rawAPI.slice(0, -1) : rawAPI;

export default function Page() {
  const [data, setData] = useState<{ btc: string | number; top: any[]; watchlist: any[] }>({ btc: 0, top: [], watchlist: [] });
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
      setErrorMessage("Koneksi terputus dengan Node Server. Mencoba menghubungkan kembali...");
    });

    socket.on("market_data", (res) => {
      if (!res.initial) {
        setData({
          btc: res.btc || 0,
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
      console.error("Gagal menyinkronkan data", e);
    }
  }, []);

  const handleBuy = async (coin: any) => {
    setLoadingAction(`buy_${coin.pair}`);
    
    // Manajemen Risiko Dinamis berbasis Volatilitas Historis Harian Pasar
    const volatilityPercent = parseFloat(coin.technicals.volatility) / 100;
    const dynamicTP = coin.price * (1 + (volatilityPercent * 1.5)); // Take Profit: 1.5x dari nilai volatilitas koin
    const dynamicSL = coin.price * (1 - volatilityPercent);         // Stop Loss: 1x nilai volatilitas koin
    
    try {
      const res = await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          entry_price: coin.price,
          target_tp: parseFloat(dynamicTP.toFixed(2)),
          target_sl: parseFloat(dynamicSL.toFixed(2)),
          news_headline: coin.news_headline,
          news_impact: coin.news_impact
        })
      });
      
      if (!res.ok) throw new Error();
      await loadDataManual();
      alert(`Berhasil membuka posisi pada ${coin.pair.toUpperCase()} dengan batas risiko dinamis.`);
    } catch (e) {
      alert("Gagal melakukan aksi eksekusi portofolio.");
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
      alert(`Posisi ${pairName.toUpperCase()} berhasil ditutup & direkam.`);
    } catch (e) {
      alert("Gagal menutup posisi.");
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
      console.error("Gagal memperbarui status pantauan koin.", e);
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
          <h1>⚡ QUANT INVESTMENT TERMINAL</h1>
          <p>Sistem Pantauan & Pendeteksi Momentum Swing Crypto | BTC: {data.btc ? parseFloat(data.btc as string).toLocaleString() : "..."} IDR</p>
        </div>
        <div className="connection-tag">
          <span className={`status-dot ${isConnected ? 'online animate-pulse' : 'offline'}`}></span>
          {isConnected ? 'LIVE ENGINE ON' : 'CONNECTING ERROR'}
        </div>
      </header>

      {errorMessage && <div className="system-error-banner">{errorMessage}</div>}

      {/* Navigasi Menu Tab Utama */}
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

      {/* TAB CONTAINER 1: SCANNER */}
      {activeTab === "scanner" && (
        <section className="terminal-section">
          <h2 className="section-title">Algorithmic Scanner (Skor Momentum Tertinggi)</h2>
          {data.top.length === 0 ? (
            <div className="loading-state-box">Menganalisis pergerakan data dari bursa Indodax...</div>
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
                    <span className="live-price-text">{c.price.toLocaleString()} IDR</span>
                    <span className={`price-change-pct ${c.change >= 0 ? "positive" : "negative"}`}>
                      {c.change >= 0 ? "↗" : "↘"} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  <div className="technical-metrics-inner">
                    <div className="metric-metric-row">
                      <span>Volatilitas Pasar: <b>{c.technicals.volatility}%</b></span>
                      <span>Spread Orderbook: <b style={{ color: parseFloat(c.technicals.spread) > 1.5 ? "#ef4444" : "#10b981" }}>{c.technicals.spread}%</b></span>
                    </div>
                    <div className="pressure-bar-wrapper">
                      <div className="pressure-bar-label">
                        <span>Tekanan Beli Pasar</span>
                        <span>{c.technicals.buying_pressure}%</span>
                      </div>
                      <div className="bar-background">
                        <div className="bar-fill-color" style={{ width: `${c.technicals.buying_pressure}%`, background: getPressureColor(parseFloat(c.technicals.buying_pressure)) }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="ai-interpretation-container">
                    <span className={`bias-indicator ${c.news_impact.toLowerCase()}`}>{c.news_impact} BIAS</span>
                    <p className="interpretation-headline">"{c.news_headline}"</p>
                    <p className="interpretation-subtext">{c.impact_desc}</p>
                  </div>

                  <button className="btn-action-buy" onClick={() => handleBuy(c)} disabled={loadingAction === `buy_${c.pair}`}>
                    {loadingAction === `buy_${c.pair}` ? "Memproses Posisi..." : "⚡ Buka Posisi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB CONTAINER 2: WATCHLIST */}
      {activeTab === "watchlist" && (
        <section className="terminal-section">
          <h2 className="section-title">Koin Dalam Pengawasan Khusus</h2>
          {data.watchlist.length === 0 ? (
            <div className="empty-state-box">Tidak ada koin di dalam daftar pantauan Anda. Tambahkan melalui Market Scanner.</div>
          ) : (
            <div className="terminal-grid">
              {data.watchlist.map((c: any) => (
                <div key={c.pair} className="coin-data-card watched-highlight">
                  <div className="card-top-row">
                    <h3>{c.pair.replace("_", " / ").toUpperCase()}</h3>
                    <div className="action-row-header">
                      <button className="btn-watch-toggle watched" onClick={() => toggleWatchlist(c.pair, true)}>
                        ❌ Hapus
                      </button>
                      <span className={`signal-tag ${c.signal.replace(" ", "-").toLowerCase()}`}>{c.signal}</span>
                    </div>
                  </div>

                  <div className="card-price-row">
                    <span className="live-price-text">{c.price.toLocaleString()} IDR</span>
                    <span className={`price-change-pct ${c.change >= 0 ? "positive" : "negative"}`}>
                      {c.change >= 0 ? "↗" : "↘"} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  <div className="technical-metrics-inner">
                    <div className="metric-metric-row">
                      <span>Volatilitas: <b>{c.technicals.volatility}%</b></span>
                      <span>Skor Kuantitatif: <b>{c.score.toFixed(1)} / 20</b></span>
                    </div>
                  </div>

                  <div className="ai-interpretation-container">
                    <p className="interpretation-headline" style={{ marginTop: "0" }}>"{c.news_headline}"</p>
                  </div>

                  <button className="btn-action-buy" onClick={() => handleBuy(c)} disabled={loadingAction === `buy_${c.pair}`}>
                    ⚡ Buka Posisi Dari Pantauan
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB CONTAINER 3: PORTFOLIO */}
      {activeTab === "portfolio" && (
        <section className="terminal-section">
          <h2 className="section-title">Buku Portofolio & Posisi Terbuka Terkini</h2>
          {portfolio.length === 0 ? (
            <div className="empty-state-box">Anda saat ini tidak memegang posisi aset trading aktif.</div>
          ) : (
            <div className="portfolio-flex-list">
              {portfolio.map((p) => (
                <div key={p.id} className="portfolio-row-card">
                  <div className="portfolio-main-info">
                    <h3>{p.pair.replace("_", " / ").toUpperCase()}</h3>
                    <span className="portfolio-date">Terbuka: {new Date(p.created_at).toLocaleString('id-ID')}</span>
                  </div>
                  
                  <div className="portfolio-pricing-data">
                    <div className="price-sub-block"><span>Harga Masuk</span><b>{p.entry_price?.toLocaleString()} IDR</b></div>
                    <div className="price-sub-block"><span>Target TP (Dinamis)</span><b className="text-green">{p.target_tp?.toLocaleString()}</b></div>
                    <div className="price-sub-block"><span>Stop Loss (Dinamis)</span><b className="text-red">{p.target_sl?.toLocaleString()}</b></div>
                  </div>

                  <div className="portfolio-pnl-block">
                    <span>Keuntungan / Kerugian</span>
                    <strong className={p.pnl >= 0 ? "text-green" : "text-red"}>
                      {p.pnl >= 0 ? "+" : ""}{p.pnl?.toLocaleString()} IDR
                    </strong>
                  </div>

                  <button className="btn-close-trading" onClick={() => handleSell(p.id, p.pair)} disabled={loadingAction === `sell_${p.id}`}>
                    {loadingAction === `sell_${p.id}` ? "Menutup Posisi..." : "Tutup Posisi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* EMBEDDED SYSTEM TERMINAL STYLESHEET */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-main: #070a13;
          --bg-card: #0f1524;
          --bg-inner: #151d33;
          --border-color: #1e2942;
          --text-primary: #f1f5f9;
          --text-secondary: #94a3b8;
          --color-green: #10b981;
          --color-red: #ef4444;
          --color-blue: #2563eb;
          --color-purple: #8b5cf6;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: var(--bg-main); color: var(--text-primary); font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
        
        .terminal-dashboard { padding: 30px; max-width: 1400px; margin: 0 auto; }
        
        .terminal-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); margin-bottom: 25px; }
        .terminal-header h1 { font-size: 24px; font-weight: 800; letter-spacing: 0.5px; color: #3b82f6; }
        .terminal-header p { font-size: 13px; color: var(--text-secondary); margin-top: 5px; }
        
        .connection-tag { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; background: rgba(255,255,255,0.03); padding: 6px 14px; border-radius: 30px; border: 1px solid var(--border-color); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; }
        .status-dot.online { background: var(--color-green); box-shadow: 0 0 8px var(--color-green); }
        .status-dot.offline { background: var(--color-red); }
        
        .system-error-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-red); color: #fca5a5; padding: 12px; border-radius: 8px; margin-bottom: 25px; font-size: 13px; text-align: center; }
        
        .tab-navigation { display: flex; gap: 10px; margin-bottom: 30px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
        .tab-btn { background: none; border: none; color: var(--text-secondary); padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
        .tab-btn:hover { background: rgba(255,255,255,0.02); color: var(--text-primary); }
        .tab-btn.active { background: var(--color-blue); color: white; }
        
        .terminal-section { animation: fadeIn 0.3s ease-in-out; }
        .section-title { font-size: 16px; font-weight: 700; color: var(--text-secondary); margin-bottom: 20px; letter-spacing: 0.5px; text-transform: uppercase; }
        
        .loading-state-box, .empty-state-box { background: var(--bg-card); border: 1px dashed var(--border-color); padding: 40px; text-align: center; color: var(--text-secondary); border-radius: 8px; font-size: 14px; }
        
        /* SCANNED GRID ARCHITECTURE */
        .terminal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
        .coin-data-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, border-color 0.2s; }
        .coin-data-card:hover { transform: translateY(-2px); border-color: #334155; }
        .coin-data-card.watched-highlight { border-left: 3px solid var(--color-purple); }
        
        .card-top-row { display: flex; justify-content: space-between; align-items: center; }
        .card-top-row h3 { font-size: 16px; font-weight: 700; color: white; }
        .action-row-header { display: flex; align-items: center; gap: 8px; }
        
        .btn-watch-toggle { background: #1e293b; border: 1px solid #334155; color: var(--text-primary); padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .btn-watch-toggle:hover { background: #334155; }
        .btn-watch-toggle.watched { background: rgba(139, 92, 246, 0.2); border-color: var(--color-purple); color: #d8b4fe; }
        
        .signal-tag { font-size: 10px; font-weight: 900; padding: 4px 8px; border-radius: 4px; letter-spacing: 0.3px; }
        .signal-tag.strong-buy { background: var(--color-purple); color: white; }
        .signal-tag.buy { background: var(--color-green); color: white; }
        .signal-tag.hold { background: #475569; color: white; }
        .signal-tag.sell { background: var(--color-red); color: white; }
        
        .card-price-row { display: flex; align-items: baseline; gap: 10px; margin: 15px 0; }
        .live-price-text { font-size: 22px; font-weight: 800; color: white; }
        .price-change-pct { font-size: 12px; font-weight: 700; }
        .price-change-pct.positive { color: var(--color-green); }
        .price-change-pct.negative { color: var(--color-red); }
        
        .technical-metrics-inner { background: var(--bg-inner); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.02); margin-bottom: 14px; }
        .metric-metric-row { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 10px; }
        .metric-metric-row b { color: white; }
        
        .pressure-bar-wrapper { display: flex; flex-direction: column; gap: 5px; }
        .pressure-bar-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); }
        .bar-background { width: 100%; height: 5px; background: #1e293b; border-radius: 10px; overflow: hidden; }
        .bar-fill-color { height: 100%; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
        
        .ai-interpretation-container { background: rgba(30, 41, 59, 0.3); border: 1px solid rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px; }
        .bias-indicator { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; display: inline-block; margin-bottom: 6px; }
        .bias-indicator.bullish { background: rgba(16,185,129,0.15); color: var(--color-green); }
        .bias-indicator.bearish { background: rgba(239,68,68,0.15); color: var(--color-red); }
        .bias-indicator.neutral { background: rgba(255,255,255,0.05); color: var(--text-secondary); }
        .interpretation-headline { color: #e2e8f0; font-style: italic; font-weight: 500; }
        .interpretation-subtext { color: var(--text-secondary); margin-top: 4px; font-size: 11px; }
        
        .btn-action-buy { width: 100%; background: var(--color-blue); color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; transition: background 0.2s; }
        .btn-action-buy:hover { background: #1d4ed8; }
        .btn-action-buy:disabled { opacity: 0.4; cursor: not-allowed; }
        
        /* PORTFOLIO FLEX LIST CONFIG */
        .portfolio-flex-list { display: flex; flex-direction: column; gap: 12px; }
        .portfolio-row-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; transition: border-color 0.2s; }
        .portfolio-row-card:hover { border-color: #334155; }
        
        .portfolio-main-info h3 { font-size: 16px; font-weight: 700; color: white; }
        .portfolio-date { font-size: 11px; color: var(--text-secondary); display: block; margin-top: 4px; }
        
        .portfolio-pricing-data { display: flex; gap: 30px; }
        .price-sub-block { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
        .price-sub-block span { color: var(--text-secondary); }
        .price-sub-block b { font-size: 13px; font-weight: 600; color: #f8fafc; }
        
        .portfolio-pnl-block { display: flex; flex-direction: column; gap: 4px; text-align: right; min-width: 130px; }
        .portfolio-pnl-block span { font-size: 11px; color: var(--text-secondary); }
        .portfolio-pnl-block strong { font-size: 15px; font-weight: 800; }
        
        .btn-close-trading { background: var(--color-red); color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; transition: background 0.2s; }
        .btn-close-trading:hover { background: #dc2626; }
        .btn-close-trading:disabled { opacity: 0.4; cursor: not-allowed; }
        
        .text-green { color: var(--color-green) !important; }
        .text-red { color: var(--color-red) !important; }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
