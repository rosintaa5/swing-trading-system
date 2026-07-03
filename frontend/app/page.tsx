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
    btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data..." }, 
    top: [], 
    watchlist: [] 
  });
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"scanner" | "watchlist" | "portfolio">("scanner");
  const [signalFilter, setSignalFilter] = useState<"ALL" | "BUY_ONLY">("ALL");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("market_data", (res) => {
      if (res) {
        setData({
          btc: res.btc,
          top: res.top || [],
          watchlist: res.watchlist || []
        });
        if (res.portfolio) setPortfolio(res.portfolio);
      }
    });

    return () => {
      socket.off("market_data");
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const syncPortfolioManual = useCallback(async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (res.ok) setPortfolio(await res.json());
    } catch (e) {
      console.error("Gagal sinkronisasi data manual.", e);
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
          target_tp: coin.target_tp, 
          target_sl: coin.target_sl,
          news_headline: coin.news_headline,
          news_impact: coin.news_impact
        })
      });
      
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal mencatat transaksi");
      
      await syncPortfolioManual();
      alert(`✅ SUKSES!\n${resData.message}\n🎯 Target TP: Rp ${coin.target_tp.toLocaleString()}\n🛡️ Batas SL: Rp ${coin.target_sl.toLocaleString()}`);
    } catch (e: any) {
      alert(`❌ Perbaikan Database Aktif: ${e.message}`);
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
      await syncPortfolioManual();
      alert(`✅ Posisi ${pairName.toUpperCase()} sukses ditutup dan disimpan.`);
    } catch (e) {
      alert("❌ Gagal menutup transaksi.");
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleWatchlist = async (pair: string, isCurrentlyWatched: boolean) => {
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
      console.error(e);
    }
  };

  // Logika Filter Sinyal
  const displayedCoins = signalFilter === "ALL" 
    ? data.top 
    : data.top.filter(c => c.signal === "BUY" || c.signal === "STRONG BUY");

  return (
    <div className="trading-terminal">
      <header className="main-header">
        <div>
          <h1>⚡ AI TERMINAL SCANNER PRO</h1>
          <p>Sistem Deteksi Sinyal & Manajemen Risiko Otomatis</p>
        </div>
        <div className={`status-badge ${isConnected ? 'active' : 'inactive'}`}>
          <span className="dot"></span> {isConnected ? 'LIVE ENGINE CONNECTED' : 'OFFLINE SYNC'}
        </div>
      </header>

      {/* PANEL UTAMA: SENTIMEN BITCOIN */}
      <div className={`btc-regime-card ${data.btc.bias.toLowerCase()}`}>
        <div className="btc-info-row">
          <div>
            <h3>BITCOIN TREN DIKONTROL UTAMA (MARKET REGIME)</h3>
            <span className="btc-price-text">{data.btc.price ? `${data.btc.price.toLocaleString()} IDR` : 'Memuat data...'}</span>
          </div>
          <span className={`btc-change-badge ${data.btc.change >= 0 ? 'bull' : 'bear'}`}>
            {data.btc.change >= 0 ? '▲' : '▼'} {data.btc.change?.toFixed(2)}%
          </span>
        </div>
        <div className="btc-news-body">
          <p>{data.btc.news}</p>
        </div>
      </div>

      {/* NAVIGASI & FILTER */}
      <div className="control-bar">
        <nav className="tab-nav">
          <button className={activeTab === "scanner" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("scanner")}>📡 Scanner ({displayedCoins.length})</button>
          <button className={activeTab === "watchlist" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("watchlist")}>👁️ Radar Pantau ({data.watchlist.length})</button>
          <button className={activeTab === "portfolio" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("portfolio")}>💼 Posisi Aktif ({portfolio.length})</button>
        </nav>

        {activeTab === "scanner" && (
          <div className="filter-group">
            <span className="filter-label">Filter Tren:</span>
            <button className={signalFilter === "ALL" ? "filter-btn active" : "filter-btn"} onClick={() => setSignalFilter("ALL")}>Semua Koin</button>
            <button className={signalFilter === "BUY_ONLY" ? "filter-btn active" : "filter-btn"} onClick={() => setSignalFilter("BUY_ONLY")}>🔥 Hanya Isyarat Beli</button>
          </div>
        )}
      </div>

      {/* VIEW PANEL 1: SCANNER */}
      {activeTab === "scanner" && (
        <section className="view-section">
          {displayedCoins.length === 0 ? (
            <div className="loading-container-box">Sedang memindai dan menghitung pergerakan koin terbaik untuk Anda...</div>
          ) : (
            <div className="cards-responsive-grid">
              {displayedCoins.map((c: any) => (
                <div key={c.pair} className="coin-card-wrapper">
                  <div className="card-header-info">
                    <h2>{c.pair.replace("_", " / ").toUpperCase()}</h2>
                    <div className="badge-row">
                      <button className={`watchlist-star ${c.isWatched ? 'active' : ''}`} onClick={() => toggleWatchlist(c.pair, c.isWatched)}>
                        {c.isWatched ? "★ Dipantau" : "☆ Pantau"}
                      </button>
                      <span className={`signal-label ${c.signal.toLowerCase().replace(" ", "-")}`}>{c.signal}</span>
                    </div>
                  </div>

                  <div className="price-display-block">
                    <span className="current-price-num">{c.price.toLocaleString()} IDR</span>
                    <span className={`price-pct-change ${c.change >= 0 ? 'plus' : 'minus'}`}>
                      {c.change >= 0 ? '↗' : '↘'} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  {/* KOTAK HARGA SASARAN SL, ENTRY & TP YANG JELAS */}
                  <div className="matrix-target-box">
                    <div className="matrix-cell">
                      <span className="cell-title">🛡️ BATAS STOP LOSS</span>
                      <strong className="text-red">{c.target_sl.toLocaleString()}</strong>
                    </div>
                    <div className="matrix-cell border-sides">
                      <span className="cell-title">🔑 HARGA ENTRY</span>
                      <strong className="text-white">{c.price.toLocaleString()}</strong>
                    </div>
                    <div className="matrix-cell">
                      <span className="cell-title">🎯 TARGET TAKE PROFIT</span>
                      <strong className="text-green">{c.target_tp.toLocaleString()}</strong>
                    </div>
                  </div>

                  {/* FITUR BERMANFAAT: RISK REWARD RATIO & MODAL */}
                  <div className="extra-analytics-row">
                    <div className="analytic-chip">📈 <b>Rasio RRR:</b> 1 : {c.rrr}</div>
                    <div className="analytic-chip allocation">💰 {c.capital_advice}</div>
                  </div>

                  <div className="progress-pressure-area">
                    <div className="pressure-text-row">
                      <span>Daya Akumulasi Beli</span>
                      <span>{c.technicals.buying_pressure}%</span>
                    </div>
                    <div className="pressure-bar-bg">
                      <div className="pressure-bar-fill" style={{ width: `${c.technicals.buying_pressure}%` }}></div>
                    </div>
                  </div>

                  <div className="ai-narrative-card">
                    <div className={`narrative-tag ${c.news_impact.toLowerCase()}`}>{c.news_impact} VIEW</div>
                    <p className="narrative-text">"{c.news_headline}"</p>
                  </div>

                  <button className="execute-buy-button" onClick={() => handleBuy(c)} disabled={loadingAction === `buy_${c.pair}` || c.signal === "SELL"}>
                    {loadingAction === `buy_${c.pair}` ? "Mengunci Transaksi..." : c.signal === "SELL" ? "🚨 Risiko Terlalu Tinggi" : "⚡ Buka Posisi Trading"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW PANEL 2: RADAR PANTAU */}
      {activeTab === "watchlist" && (
        <section className="view-section">
          {data.watchlist.length === 0 ? (
            <div className="empty-placeholder">Tidak ada koin di dalam radar pantauan spesial Anda.</div>
          ) : (
            <div className="cards-responsive-grid">
              {data.watchlist.map((c: any) => (
                <div key={c.pair} className="coin-card-wrapper watched-border">
                  <div className="card-header-info">
                    <h2>{c.pair.replace("_", " / ").toUpperCase()}</h2>
                    <button className="remove-watch-btn" onClick={() => toggleWatchlist(c.pair, true)}>Hapus</button>
                  </div>
                  <div className="price-display-block">
                    <span className="current-price-num">{c.price.toLocaleString()} IDR</span>
                  </div>
                  <div className="ai-narrative-card" style={{margin: "12px 0"}}>
                    <p className="narrative-text" style={{fontSize: "13px"}}>"{c.news_headline}"</p>
                  </div>
                  <button className="execute-buy-button" onClick={() => handleBuy(c)}>⚡ Eksekusi Beli Sekarang</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW PANEL 3: PORTOFOLIO AKTIF */}
      {activeTab === "portfolio" && (
        <section className="view-section">
          {portfolio.length === 0 ? (
            <div className="empty-placeholder">Belum ada posisi trading yang terbuka di database Anda.</div>
          ) : (
            <div className="portfolio-vertical-stack">
              {portfolio.map((p) => (
                <div key={p.id} className="portfolio-row-item">
                  <div>
                    <h3>{p.pair.replace("_", " / ").toUpperCase()}</h3>
                    <span className="time-subtext">Tanggal Beli: {new Date(p.created_at).toLocaleString('id-ID')}</span>
                  </div>

                  <div className="prices-summary-grid">
                    <div><span>Harga Beli</span><b>{p.entry_price?.toLocaleString()}</b></div>
                    <div><span>Batas SL</span><b className="text-red">{p.target_sl?.toLocaleString()}</b></div>
                    <div><span>Sasaran TP</span><b className="text-green">{p.target_tp?.toLocaleString()}</b></div>
                  </div>

                  <div className="pnl-showcase">
                    <span>Keuntungan Berjalan (PnL)</span>
                    <strong className={p.pnl >= 0 ? "text-green" : "text-red"}>
                      {p.pnl >= 0 ? "+" : ""}{p.pnl?.toLocaleString(undefined, { maximumFractionDigits: 1 })} IDR
                    </strong>
                  </div>

                  <button className="close-position-btn" onClick={() => handleSell(p.id, p.pair)} disabled={loadingAction === `sell_${p.id}`}>
                    {loadingAction === `sell_${p.id}` ? "Menutup..." : "Tutup Posisi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* STYLESHEET EMBEDDED */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-dark-base: #060913; --bg-card: #0d1323; --bg-inner-box: #131b30;
          --border-color: #1b263f; --text-main: #f1f5f9; --text-dim: #94a3b8;
          --theme-green: #10b981; --theme-red: #ef4444; --theme-blue: #3b82f6; --theme-purple: #8b5cf6;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background-color: var(--bg-dark-base); color: var(--text-main); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        .text-green { color: var(--theme-green) !important; }
        .text-red { color: var(--theme-red) !important; }
        .text-white { color: #ffffff !important; }

        .trading-terminal { padding: 25px; max-width: 1400px; margin: 0 auto; }
        .main-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 20px; }
        .main-header h1 { font-size: 22px; font-weight: 800; color: var(--theme-blue); letter-spacing: 0.5px; }
        .main-header p { font-size: 13px; color: var(--text-dim); margin-top: 4px; }
        
        .status-badge { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.03); padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border-color); }
        .status-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-red); }
        .status-badge.active .dot { background: var(--theme-green); box-shadow: 0 0 8px var(--theme-green); }

        /* SENTIMEN BITCOIN */
        .btc-regime-card { background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; margin-bottom: 25px; border-left: 5px solid #475569; }
        .btc-regime-card.bullish { border-left-color: var(--theme-green); box-shadow: 0 0 15px rgba(16,185,129,0.08); }
        .btc-regime-card.bearish { border-left-color: var(--theme-red); box-shadow: 0 0 15px rgba(239,68,68,0.08); }
        .btc-info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .btc-info-row h3 { font-size: 12px; color: var(--text-dim); letter-spacing: 0.5px; }
        .btc-price-text { font-size: 24px; font-weight: 800; color: #fff; display: block; margin-top: 4px; }
        .btc-change-badge { padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: 700; }
        .btc-change-badge.bull { background: rgba(16,185,129,0.15); color: var(--theme-green); }
        .btc-change-badge.bear { background: rgba(239,68,68,0.15); color: var(--theme-red); }
        .btc-news-body { background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; font-size: 13.5px; line-height: 1.5; color: #cbd5e1; }

        /* CONTROLS BAR */
        .control-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 25px; }
        .tab-nav { display: flex; gap: 8px; }
        .nav-link { background: none; border: none; color: var(--text-dim); padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: 0.2s; }
        .nav-link:hover { color: #fff; background: rgba(255,255,255,0.02); }
        .nav-link.active { background: var(--theme-blue); color: white; }
        
        .filter-group { display: flex; align-items: center; gap: 8px; }
        .filter-label { font-size: 13px; color: var(--text-dim); font-weight: 600; }
        .filter-btn { background: #151f32; border: 1px solid var(--border-color); color: var(--text-dim); padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; }
        .filter-btn.active { background: rgba(59,130,246,0.15); border-color: var(--theme-blue); color: #fff; }

        /* GRIDS & CARDS */
        .cards-responsive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
        .coin-card-wrapper { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: 0.2s; }
        .coin-card-wrapper:hover { border-color: var(--theme-blue); transform: translateY(-2px); }
        .coin-card-wrapper.watched-border { border-top: 4px solid var(--theme-purple); }

        .card-header-info { display: flex; justify-content: space-between; align-items: center; }
        .card-header-info h2 { font-size: 16px; font-weight: 700; color: white; }
        .badge-row { display: flex; align-items: center; gap: 8px; }
        
        .watchlist-star { background: #161e2e; border: 1px solid var(--border-color); color: var(--text-dim); padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer; }
        .watchlist-star.active { color: #f59e0b; background: rgba(245,158,11,0.08); border-color: #f59e0b; }
        
        .signal-label { font-size: 10px; font-weight: 800; padding: 3px 6px; border-radius: 4px; }
        .signal-label.strong-buy { background: var(--theme-purple); color: white; }
        .signal-label.buy { background: var(--theme-green); color: white; }
        .signal-label.hold { background: #4b5563; color: white; }
        .signal-label.sell { background: var(--theme-red); color: white; }

        .price-display-block { display: flex; align-items: baseline; gap: 10px; margin: 12px 0; }
        .current-price-num { font-size: 24px; font-weight: 800; color: white; }
        .price-pct-change { font-size: 12px; font-weight: 700; }
        .price-pct-change.plus { color: var(--theme-green); }
        .price-pct-change.minus { color: var(--theme-red); }

        /* STRUKTUR TARGET TP SL ENTRY */
        .matrix-target-box { display: flex; background: #080c16; border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 12px; justify-content: space-between; text-align: center; }
        .matrix-cell { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .matrix-cell.border-sides { border-left: 1px solid var(--border-color); border-right: 1px solid var(--border-color); }
        .cell-title { font-size: 9px; color: var(--text-dim); font-weight: 700; letter-spacing: 0.3px; }
        .matrix-cell strong { font-size: 12px; font-weight: 700; }

        /* EXTRA ANALYTICS */
        .extra-analytics-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .analytic-chip { background: var(--bg-inner-box); padding: 5px 10px; border-radius: 6px; font-size: 11px; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.02); }
        .analytic-chip.allocation { border-left: 3px solid var(--theme-blue); font-weight: 600; }

        .progress-pressure-area { margin-bottom: 12px; }
        .pressure-text-row { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
        .pressure-bar-bg { width: 100%; height: 5px; background: #161e2e; border-radius: 4px; overflow: hidden; }
        .pressure-bar-fill { height: 100%; background: var(--theme-blue); transition: width 0.4s; }

        .ai-narrative-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); padding: 10px; border-radius: 6px; }
        .narrative-tag { font-size: 9px; font-weight: 800; display: inline-block; padding: 2px 5px; border-radius: 3px; margin-bottom: 4px; }
        .narrative-tag.bullish { background: rgba(16,185,129,0.15); color: var(--theme-green); }
        .narrative-tag.bearish { background: rgba(239,68,68,0.15); color: var(--theme-red); }
        .narrative-tag.neutral { background: rgba(255,255,255,0.1); color: var(--text-dim); }
        .narrative-text { font-size: 12px; font-style: italic; color: #cbd5e1; line-height: 1.4; }

        .execute-buy-button { width: 100%; background: var(--theme-blue); border: none; color: white; padding: 12px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; margin-top: 15px; transition: 0.2s; }
        .execute-buy-button:hover:not(:disabled) { background: #2563eb; }
        .execute-buy-button:disabled { background: #1e293b; color: #4b5563; cursor: not-allowed; }

        /* PORTFOLIO LISTS */
        .portfolio-vertical-stack { display: flex; flex-direction: column; gap: 12px; }
        .portfolio-row-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
        .time-subtext { font-size: 11px; color: var(--text-dim); display: block; margin-top: 4px; }
        
        .prices-summary-grid { display: flex; gap: 25px; background: #080c16; padding: 10px 18px; border-radius: 6px; border: 1px solid var(--border-color); }
        .prices-summary-grid div { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
        .prices-summary-grid span { color: var(--text-dim); }
        .prices-summary-grid b { font-size: 13px; color: #fff; }

        .pnl-showcase { text-align: right; min-width: 130px; }
        .pnl-showcase span { font-size: 11px; color: var(--text-dim); display: block; margin-bottom: 2px; }
        .pnl-showcase strong { font-size: 16px; font-weight: 800; }

        .close-position-btn { background: var(--theme-red); border: none; color: white; padding: 10px 16px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; transition: 0.2s; }
        .close-position-btn:hover { background: #dc2626; }
        
        .loading-container-box, .empty-placeholder { background: var(--bg-card); border: 1px dashed var(--border-color); padding: 40px; text-align: center; border-radius: 12px; color: var(--text-dim); font-size: 13.5px; }
      `}} />
    </div>
  );
}
