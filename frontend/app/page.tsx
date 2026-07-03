"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { socket } from "@/lib/socket";

const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const API = rawAPI.endsWith('/') ? rawAPI.slice(0, -1) : rawAPI;

export default function Page() {
  const [data, setData] = useState<{ 
    btc: { price: number; change: number; bias: string; news: string; newsList: any[] }; 
    stats: { bullPct: number; bearPct: number; health: string };
    top: any[]; 
    watchlist: any[] 
  }>({ 
    btc: { price: 0, change: 0, bias: "NEUTRAL", news: "Menghubungkan ke satelit data...", newsList: [] }, 
    stats: { bullPct: 50, bearPct: 50, health: "MEMUAT DATA..." },
    top: [], 
    watchlist: [] 
  });
  
  const [portfolio, setPortfolio] = useState<any[]>([]);
  // Mengubah default tab ke "dashboard" (Pusat Komando)
  const [activeTab, setActiveTab] = useState<"dashboard" | "scanner" | "watchlist" | "portfolio">("dashboard");
  const [signalFilter, setSignalFilter] = useState<"ALL" | "BUY_ONLY">("ALL");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const [toast, setToast] = useState<{ show: boolean, msg: string, type: "success" | "error" | "info" }>({ show: false, msg: "", type: "info" });

  const showToast = (msg: string, type: "success" | "error" | "info") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "info" }), 4000);
  };

  const [buyModal, setBuyModal] = useState<{ 
    isOpen: boolean, coin: any, 
    customEntryRaw: string, customEntryDisplay: string, 
    capitalRaw: string, capitalDisplay: string 
  }>({
    isOpen: false,
    coin: null,
    customEntryRaw: "",
    customEntryDisplay: "",
    capitalRaw: "10000000",
    capitalDisplay: "10.000.000"
  });

  useEffect(() => {
    socket.connect();
    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("market_data", (res) => {
      if (res) {
        setData({ 
          btc: res.btc, 
          stats: res.stats || { bullPct: 50, bearPct: 50, health: "NEUTRAL" },
          top: res.top || [], 
          watchlist: res.watchlist || [] 
        });
        if (res.portfolio) setPortfolio(res.portfolio);
      }
    });

    return () => {
      socket.off("market_data"); socket.off("connect"); socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  const syncPortfolioManual = useCallback(async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (res.ok) setPortfolio(await res.json());
    } catch (e) {
      console.error("Gagal sinkronisasi.", e);
    }
  }, []);

  const formatRupiah = (val: string) => {
    const rawNum = val.replace(/[^0-9]/g, '');
    return rawNum ? parseInt(rawNum).toLocaleString('id-ID') : '';
  };

  const formatDecimal = (val: string) => {
    return val.replace(/[^0-9.]/g, ''); 
  };

  const handleCapitalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    setBuyModal(prev => ({ ...prev, capitalRaw: rawVal, capitalDisplay: formatRupiah(rawVal) }));
  };

  const handleEntryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const safeDec = formatDecimal(e.target.value);
    setBuyModal(prev => ({ ...prev, customEntryRaw: safeDec, customEntryDisplay: safeDec }));
  };

  const openBuyModal = (coin: any) => {
    setBuyModal({
      isOpen: true,
      coin: coin,
      customEntryRaw: coin.price.toString(),
      customEntryDisplay: coin.price.toString(),
      capitalRaw: "10000000",
      capitalDisplay: "10.000.000"
    });
  };

  const closeBuyModal = () => {
    setBuyModal({ isOpen: false, coin: null, customEntryRaw: "", customEntryDisplay: "", capitalRaw: "100000", capitalDisplay: "100.000" });
  };

  const submitBuy = async () => {
    const { coin, customEntryRaw, capitalRaw } = buyModal;
    const numEntry = parseFloat(customEntryRaw);
    const numCapital = parseFloat(capitalRaw);

    if (!numEntry || !numCapital || numEntry <= 0 || numCapital <= 0) {
      showToast("Gagal: Harga Entry dan Modal IDR harus berupa angka valid!", "error");
      return;
    }

    setLoadingAction(`buy_${coin.pair}`);
    closeBuyModal(); 
    
    try {
      const res = await fetch(`${API}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: coin.pair,
          entry_price: numEntry,
          capital: numCapital,
          high: coin.high,
          low: coin.low,
          news_headline: coin.news_headline,
          news_impact: coin.news_impact
        })
      });
      
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Gagal mencatat transaksi");
      
      await syncPortfolioManual();
      showToast(resData.message, "success");
    } catch (e: any) {
      showToast(`Transaksi Ditolak: ${e.message}`, "error");
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
      showToast(`Posisi ${pairName.toUpperCase()} berhasil direalisasikan.`, "success");
    } catch (e) {
      showToast("Gagal menutup transaksi jaringan.", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleWatchlist = async (pair: string, isCurrentlyWatched: boolean) => {
    try {
      if (isCurrentlyWatched) {
        await fetch(`${API}/watchlist/${pair}`, { method: "DELETE" });
        showToast(`${pair.toUpperCase()} dihapus dari radar pantau.`, "info");
      } else {
        await fetch(`${API}/watchlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pair })
        });
        showToast(`${pair.toUpperCase()} berhasil ditambahkan ke radar!`, "success");
      }
    } catch (e) {
      showToast("Gagal mengubah daftar pantauan.", "error");
    }
  };

  const totalModalActive = portfolio.reduce((sum, item) => sum + (item.initial_capital || 0), 0);
  const totalPnLActive = portfolio.reduce((sum, item) => sum + (item.pnl || 0), 0);

  // --- ENGINE DASBOR: Menganalisis Koin Portofolio Yang Membutuhkan Perhatian ---
  const urgentPositions = useMemo(() => {
    return portfolio.map((p) => {
      let isUrgent = false;
      let reason = "";
      let type = "warning";
      let progressVal = 0;

      // Prioritas 1: Peringatan dari Backend (Momentum memburuk dll, diluar TP/SL)
      if (p.attention_needed) {
        isUrgent = true;
        reason = p.attention_reason;
        type = "critical";
      }

      // Prioritas 2: Peringatan Proksimitas (Mendekati TP / SL)
      if (p.current_price) {
        const gapTP = p.target_tp - p.entry_price;
        const gapSL = p.entry_price - p.target_sl;
        const move = p.current_price - p.entry_price;

        if (move > 0 && gapTP > 0) {
          const progress = (move / gapTP) * 100;
          if (progress >= 75) {
            isUrgent = true;
            reason = `🎯 Mendekati Take Profit (${progress.toFixed(1)}%)`;
            type = "success";
            progressVal = Math.min(progress, 100);
          }
        } else if (move < 0 && gapSL > 0) {
          const progress = (Math.abs(move) / gapSL) * 100;
          if (progress >= 75 && type !== "critical") { // Jangan timpa jika status critical dari backend
            isUrgent = true;
            reason = `⚠️ Ancaman Stop Loss (${progress.toFixed(1)}%)`;
            type = "danger";
            progressVal = Math.min(progress, 100);
          }
        }
      }

      if (isUrgent) return { ...p, alertReason: reason, alertType: type, alertProgress: progressVal };
      return null;
    }).filter(Boolean);
  }, [portfolio]);

  const displayedCoins = signalFilter === "ALL" 
    ? data.top 
    : data.top.filter(c => c.signal === "BUY" || c.signal === "STRONG BUY");

  const topNominations = data.top.slice(0, 3); // Ambil 3 terbaik untuk Dashboard

  return (
    <div className="trading-terminal">
      {/* ELEMEN CUSTOM TOAST */}
      <div className={`toast-notification ${toast.show ? 'show' : ''} ${toast.type}`}>
        <span className="toast-icon">
          {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
        </span>
        <p>{toast.msg}</p>
      </div>

      {/* ELEMEN BUY MODAL FORM POPUP */}
      {buyModal.isOpen && buyModal.coin && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h2>Setup Transaksi {buyModal.coin.pair.replace("_", "/").toUpperCase()}</h2>
              <button className="btn-close-modal" onClick={closeBuyModal}>✕</button>
            </div>
            
            <div className="modal-body">
              <div className="input-group">
                <label>Nominal Investasi / Modal (IDR)</label>
                <div className="input-with-prefix">
                  <span>Rp</span>
                  <input 
                    type="text" 
                    value={buyModal.capitalDisplay} 
                    onChange={handleCapitalChange}
                    placeholder="10.000.000"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Harga Beli (Entry Target)</label>
                <input 
                  type="text" 
                  value={buyModal.customEntryDisplay} 
                  onChange={handleEntryChange}
                  placeholder={`Harga Pasar: ${buyModal.coin.price}`}
                />
                <span className="input-hint">Mendukung angka desimal. Default terisi harga pasar saat ini.</span>
              </div>

              <div className="modal-info-panel">
                <h4>Simulasi Kalkulasi Keamanan (ATR Berdasarkan Entry Anda):</h4>
                <ul>
                  <li>Estimasi Target Profit (TP): <strong className="text-green">{(parseFloat(buyModal.customEntryRaw) + ((buyModal.coin.high - buyModal.coin.low || parseFloat(buyModal.customEntryRaw) * 0.05) * 1.5)).toLocaleString('id-ID', { maximumFractionDigits: 4 })}</strong></li>
                  <li>Batas Stop Loss Maksimal (SL): <strong className="text-red">{(parseFloat(buyModal.customEntryRaw) - ((buyModal.coin.high - buyModal.coin.low || parseFloat(buyModal.customEntryRaw) * 0.05) * 1.0)).toLocaleString('id-ID', { maximumFractionDigits: 4 })}</strong></li>
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={closeBuyModal}>Batal</button>
              <button className="btn-confirm-buy" onClick={submitBuy}>⚡ Konfirmasi Beli</button>
            </div>
          </div>
        </div>
      )}

      <header className="main-header">
        <div>
          <h1>⚡ AI TERMINAL SCANNER PRO</h1>
          <p>Sistem Deteksi Sinyal, Money Management & Radar Kripto Otomatis</p>
        </div>
        <div className={`status-badge ${isConnected ? 'active' : 'inactive'}`}>
          <span className="dot"></span> {isConnected ? 'LIVE ENGINE CONNECTED' : 'OFFLINE SYNC'}
        </div>
      </header>

      {/* PENGALIHAN NAVIGASI & FILTER */}
      <div className="control-bar">
        <nav className="tab-nav">
          <button className={activeTab === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("dashboard")}>🌟 Pusat Intelijen</button>
          <button className={activeTab === "scanner" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("scanner")}>📡 Scanner ({displayedCoins.length})</button>
          <button className={activeTab === "watchlist" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("watchlist")}>👁️ Radar Pantau ({data.watchlist.length})</button>
          <button className={activeTab === "portfolio" ? "nav-link active" : "nav-link"} onClick={() => setActiveTab("portfolio")}>💼 Buku Portofolio ({portfolio.length})</button>
        </nav>

        {activeTab === "scanner" && (
          <div className="filter-group">
            <span className="filter-label">Filter Tren:</span>
            <button className={signalFilter === "ALL" ? "filter-btn active" : "filter-btn"} onClick={() => setSignalFilter("ALL")}>Semua Koin</button>
            <button className={signalFilter === "BUY_ONLY" ? "filter-btn active" : "filter-btn"} onClick={() => setSignalFilter("BUY_ONLY")}>🔥 Hanya Isyarat Beli</button>
          </div>
        )}
      </div>

      {/* VIEW PANEL 0: PUSAT INTELIJEN (DASHBOARD) */}
      {activeTab === "dashboard" && (
        <section className="view-section dashboard-grid">
          {/* KOLOM KIRI: Kesehatan & BTC */}
          <div className="dash-col-left">
            <div className="market-health-card">
              <h3>📊 Rasio Kesehatan Altcoin Saat Ini</h3>
              <div className="health-status-text">{data.stats.health}</div>
              <div className="health-bar-container">
                <div className="bull-bar" style={{ width: \`\${data.stats.bullPct}%\` }}>{data.stats.bullPct}% Bulls</div>
                <div className="bear-bar" style={{ width: \`\${data.stats.bearPct}%\` }}>{data.stats.bearPct}% Bears</div>
              </div>
              <p className="health-hint">Indikator ini mengukur sentimen keseluruhan pasar berdasarkan perubahan harga dalam 24 jam terakhir.</p>
            </div>

            <div className={`btc-regime-card ${data.btc.bias.toLowerCase()} dash-btc`}>
              <div className="btc-info-row">
                <div>
                  <h3>ARAH UTAMA BITCOIN</h3>
                  <span className="btc-price-text">{data.btc.price ? `${data.btc.price.toLocaleString('id-ID')} IDR` : 'Memuat data...'}</span>
                </div>
                <span className={`btc-change-badge ${data.btc.change >= 0 ? 'bull' : 'bear'}`}>
                  {data.btc.change >= 0 ? '▲' : '▼'} {data.btc.change?.toFixed(2)}%
                </span>
              </div>
              <div className="btc-news-body">
                <p><b>Analisis Makro:</b> {data.btc.news}</p>
              </div>
            </div>

            {urgentPositions.length > 0 ? (
              <div className="alert-summary-board">
                <h3>🚨 Radar Posisi Darurat (Open Position)</h3>
                <p>Koin portofolio Anda yang membutuhkan perhatian khusus karena anomali indikator atau mendekati batas TP/SL.</p>
                <div className="alert-cards-container column-layout">
                  {urgentPositions.map((item: any) => (
                    <div key={`alert-${item.id}`} className={`alert-card ${item.alertType.toLowerCase()}`}>
                      <div className="alert-header">
                        <strong>{item.pair.replace("_", "/").toUpperCase()}</strong>
                        <span className="alert-badge">{item.alertType.toUpperCase()}</span>
                      </div>
                      <p className="alert-desc-text">{item.alertReason}</p>
                      {item.alertProgress > 0 && (
                        <div className="mini-progress-bg mt-2">
                          <div className="mini-progress-fill" style={{ width: \`\${item.alertProgress}%\` }}></div>
                        </div>
                      )}
                      <button className="dash-quick-sell-btn" onClick={() => handleSell(item.id, item.pair)} disabled={loadingAction === `sell_${item.id}`}>
                        {loadingAction === `sell_${item.id}` ? "Menutup Posisi..." : "Tutup Posisi Sekarang"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="market-health-card calm-state">
                <h3>✅ Portofolio Aman</h3>
                <p>Tidak ada koin di dalam portofolio Anda yang menunjukkan anomali atau mendekati bahaya SL/TP saat ini.</p>
              </div>
            )}
          </div>

          {/* KOLOM KANAN: Top 3 Rekomendasi */}
          <div className="dash-col-right">
            <div className="top-nominations-board">
              <h3>🏆 Top 3 Nominasi Pembelian Terbaik</h3>
              <p>Disortir berdasarkan Skor Keyakinan (Confidence Score) tertinggi oleh algoritma sentimen dan momentum saat ini.</p>
              
              <div className="top-coins-list">
                {topNominations.map((c: any, index: number) => (
                  <div key={`top-${c.pair}`} className="top-coin-item">
                    <div className="top-rank-badge">#{index + 1}</div>
                    <div className="top-coin-details">
                      <div className="top-header">
                        <h4>{c.pair.replace("_", "/").toUpperCase()}</h4>
                        <span className={`signal-label ${c.signal.toLowerCase().replace(" ", "-")}`}>{c.signal}</span>
                      </div>
                      <div className="top-price-row">
                        <span className="current-price-num">{c.price.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</span>
                        <span className={`price-pct-change ${c.change >= 0 ? 'plus' : 'minus'}`}>
                          {c.change >= 0 ? '↗' : '↘'} {c.change?.toFixed(2)}%
                        </span>
                      </div>
                      <div className="top-info-desc">
                        <p>Daya Beli: <b>{c.technicals.buying_pressure}%</b> | RRR: <b>1 : {c.rrr}</b></p>
                        <p className="text-dim">"{c.news_headline}"</p>
                      </div>
                      <button className="execute-buy-button small-btn" onClick={() => openBuyModal(c)} disabled={c.signal === "SELL"}>
                        {c.signal === "SELL" ? "Dilarang Beli" : "⚡ Buka Posisi Ini"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW PANEL 1: SCANNER */}
      {activeTab === "scanner" && (
        <section className="view-section">
          {displayedCoins.length === 0 ? (
            <div className="loading-container-box">Sedang memindai dan menghitung pergerakan koin terbaik menggunakan ATR...</div>
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
                    <span className="current-price-num">{c.price.toLocaleString('id-ID', { maximumFractionDigits: 4 })} IDR</span>
                    <span className={`price-pct-change ${c.change >= 0 ? 'plus' : 'minus'}`}>
                      {c.change >= 0 ? '↗' : '↘'} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  <div className="matrix-target-box">
                    <div className="matrix-cell">
                      <span className="cell-title">🛡️ BATAS SL (ATR)</span>
                      <strong className="text-red">{c.target_sl.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</strong>
                    </div>
                    <div className="matrix-cell border-sides">
                      <span className="cell-title">🔑 ENTRY TERBAIK</span>
                      <strong className="text-white">{c.price.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</strong>
                    </div>
                    <div className="matrix-cell">
                      <span className="cell-title">🎯 TARGET TP (ATR)</span>
                      <strong className="text-green">{c.target_tp.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</strong>
                    </div>
                  </div>

                  <div className="extra-analytics-row">
                    <div className="analytic-chip">📈 <b>RRR:</b> 1 : {c.rrr}</div>
                    <div className="analytic-chip allocation">💰 {c.capital_advice}</div>
                  </div>

                  <div className="progress-pressure-area">
                    <div className="pressure-text-row">
                      <span>Daya Akumulasi Beli</span>
                      <span>{c.technicals.buying_pressure}%</span>
                    </div>
                    <div className="pressure-bar-bg">
                      <div className="pressure-bar-fill" style={{ width: \`\${c.technicals.buying_pressure}%\` }}></div>
                    </div>
                  </div>

                  <div className="ai-narrative-card">
                    <div className={`narrative-tag ${c.news_impact.toLowerCase()}`}>{c.news_impact} VIEW</div>
                    <p className="narrative-text">"{c.news_headline}"</p>
                  </div>

                  <button className="execute-buy-button" onClick={() => openBuyModal(c)} disabled={c.signal === "SELL"}>
                    {c.signal === "SELL" ? "🚨 Dilarang Beli (Risiko Tinggi)" : "⚡ Atur & Buka Posisi"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW PANEL 2: WATCHLIST */}
      {activeTab === "watchlist" && (
        <section className="view-section">
          {data.watchlist.length === 0 ? (
            <div className="empty-placeholder">Anda belum menambahkan koin ke radar pantauan. Klik "Pantau" di tab Scanner.</div>
          ) : (
            <div className="watchlist-list-view">
              {data.watchlist.map((c: any) => (
                <div key={c.pair} className="watchlist-detailed-card">
                  <div className="watch-header">
                    <div className="watch-title-group">
                      <h2>{c.pair.replace("_", " / ").toUpperCase()}</h2>
                      <span className={`signal-label ${c.signal.toLowerCase().replace(" ", "-")}`}>{c.signal}</span>
                    </div>
                    <button className="remove-watch-btn" onClick={() => toggleWatchlist(c.pair, true)}>✕ Hapus</button>
                  </div>

                  <div className="watch-price-row">
                    <span className="watch-price">{c.price.toLocaleString('id-ID')} IDR</span>
                    <span className={`price-pct-change ${c.change >= 0 ? 'plus' : 'minus'}`}>
                      {c.change >= 0 ? '↗' : '↘'} {c.change?.toFixed(2)}%
                    </span>
                  </div>

                  <div className="watch-info-board">
                    <div className="info-status-bar">
                      <span className="info-label">Status Algoritma:</span>
                      <strong className={`status-highlight ${c.signal.toLowerCase().replace(" ", "-")}`}>{c.watch_status}</strong>
                    </div>
                    <ul className="info-bullet-list">
                      <li><b>Analisis Mesin:</b> {c.news_headline}</li>
                      <li><b>Kondisi Makro:</b> {c.watch_desc}</li>
                      <li><b>Tekanan Beli:</b> Menguasai {c.technicals.buying_pressure}% transaksi.</li>
                      <li><b>Volatilitas Risiko:</b> Koin ini memiliki pergerakan harga rata-rata {c.technicals.volatility}% harian (Tinggi/Rendah).</li>
                      <li><b>Saran Manajemen Dana:</b> {c.capital_advice}</li>
                    </ul>
                  </div>

                  <button className="execute-buy-button watch-buy" onClick={() => openBuyModal(c)}>
                    ⚡ Setup Order Pembelian Koin Ini
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* VIEW PANEL 3: PORTFOLIO */}
      {activeTab === "portfolio" && (
        <section className="view-section">
          <div className="portfolio-global-dashboard">
            <div className="dashboard-metric-box">
              <span className="metric-title">Total Modal Diinvestasikan</span>
              <strong className="metric-value text-white">Rp {totalModalActive.toLocaleString('id-ID')}</strong>
            </div>
            <div className="dashboard-metric-box highlight">
              <span className="metric-title">Total Keuntungan / Kerugian (PnL)</span>
              <strong className={`metric-value ${totalPnLActive >= 0 ? 'text-green' : 'text-red'}`}>
                {totalPnLActive >= 0 ? '+' : ''}Rp {totalPnLActive.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
              </strong>
            </div>
          </div>

          {portfolio.length === 0 ? (
            <div className="empty-placeholder">Buku portofolio Anda kosong. Silakan masuk ke pasar.</div>
          ) : (
            <div className="portfolio-vertical-stack">
              {portfolio.map((p) => (
                <div key={p.id} className="portfolio-row-item">
                  <div className="port-left-section">
                    <h3>{p.pair.replace("_", " / ").toUpperCase()}</h3>
                    <span className="time-subtext">Terbuka: {new Date(p.created_at).toLocaleString('id-ID')}</span>
                    <span className="modal-info-subtext">Modal Masuk: Rp {p.initial_capital?.toLocaleString('id-ID') || "0"}</span>
                  </div>

                  <div className="prices-summary-grid">
                    <div><span>Harga Saat Ini</span><b className="text-white">{p.current_price?.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b></div>
                    <div><span>Harga Entry</span><b>{p.entry_price?.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b></div>
                    <div><span>Batas SL (ATR)</span><b className="text-red">{p.target_sl?.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b></div>
                    <div><span>Sasaran TP (ATR)</span><b className="text-green">{p.target_tp?.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b></div>
                  </div>

                  <div className="pnl-showcase">
                    <span>Keuntungan Berjalan (PnL)</span>
                    <strong className={p.pnl >= 0 ? "text-green" : "text-red"}>
                      {p.pnl >= 0 ? "+" : ""}{p.pnl?.toLocaleString('id-ID', { maximumFractionDigits: 1 })} IDR
                    </strong>
                  </div>

                  <button className="close-position-btn" onClick={() => handleSell(p.id, p.pair)} disabled={loadingAction === `sell_${p.id}`}>
                    {loadingAction === `sell_${p.id}` ? "Memproses..." : "Tutup Posisi (Jual)"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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

        .trading-terminal { padding: 25px; max-width: 1400px; margin: 0 auto; position: relative; }
        .main-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 20px; }
        .main-header h1 { font-size: 22px; font-weight: 800; color: var(--theme-blue); letter-spacing: 0.5px; }
        .main-header p { font-size: 13px; color: var(--text-dim); margin-top: 4px; }
        
        .status-badge { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.03); padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border-color); }
        .status-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-red); }
        .status-badge.active .dot { background: var(--theme-green); box-shadow: 0 0 8px var(--theme-green); }

        .toast-notification { position: fixed; top: 30px; right: 30px; background: var(--bg-card); border-left: 4px solid var(--theme-blue); box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 16px 20px; border-radius: 8px; display: flex; align-items: center; gap: 12px; z-index: 9999; transform: translateX(120%); transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); opacity: 0; }
        .toast-notification.show { transform: translateX(0); opacity: 1; }
        .toast-notification.success { border-left-color: var(--theme-green); }
        .toast-notification.error { border-left-color: var(--theme-red); }
        .toast-notification p { font-size: 14px; font-weight: 600; color: white; margin: 0; }
        .toast-icon { font-size: 18px; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9000; animation: fadeIn 0.2s; }
        .modal-box { background: var(--bg-card); width: 100%; max-width: 450px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 20px 50px rgba(0,0,0,0.5); overflow: hidden; }
        .modal-header { padding: 18px 24px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: #0f172a; }
        .modal-header h2 { font-size: 18px; font-weight: 700; margin: 0; }
        .btn-close-modal { background: none; border: none; color: var(--text-dim); font-size: 18px; cursor: pointer; transition: 0.2s; }
        .btn-close-modal:hover { color: white; }
        
        .modal-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; }
        .input-group { display: flex; flex-direction: column; gap: 8px; }
        .input-group label { font-size: 13px; font-weight: 600; color: var(--text-dim); }
        .input-group input { background: var(--bg-inner-box); border: 1px solid var(--border-color); color: white; padding: 12px 14px; border-radius: 6px; font-size: 15px; font-weight: 600; outline: none; transition: 0.2s; width: 100%; }
        .input-group input:focus { border-color: var(--theme-blue); box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
        .input-with-prefix { position: relative; display: flex; align-items: center; }
        .input-with-prefix span { position: absolute; left: 14px; color: var(--text-dim); font-size: 14px; font-weight: 600; }
        .input-with-prefix input { padding-left: 40px; }
        .input-hint { font-size: 11px; color: var(--text-dim); font-style: italic; }

        .modal-info-panel { background: rgba(30,41,59,0.5); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
        .modal-info-panel h4 { font-size: 12px; color: var(--text-dim); margin-bottom: 10px; }
        .modal-info-panel ul { list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
        .modal-info-panel ul li { display: flex; justify-content: space-between; }
        
        .modal-footer { padding: 18px 24px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 12px; background: #0f172a; }
        .btn-cancel { background: transparent; border: 1px solid var(--text-dim); color: var(--text-dim); padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .btn-cancel:hover { background: rgba(255,255,255,0.05); color: white; }
        .btn-confirm-buy { background: var(--theme-blue); border: none; color: white; padding: 10px 20px; border-radius: 6px; font-weight: 700; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 10px rgba(37,99,235,0.2); }
        .btn-confirm-buy:hover { background: #2563eb; transform: translateY(-1px); }

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
        
        .btc-news-stream { margin-top: 15px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 15px; }
        .btc-news-stream h4 { font-size: 12px; color: var(--theme-blue); margin-bottom: 10px; letter-spacing: 0.5px; }
        .news-list-items { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .news-list-items li { display: flex; align-items: baseline; gap: 10px; font-size: 12.5px; line-height: 1.4; color: #94a3b8; }
        .news-time { font-size: 11px; opacity: 0.7; font-family: monospace; }
        .news-impact-tag { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
        .news-impact-tag.bullish { background: rgba(16,185,129,0.1); color: var(--theme-green); }
        .news-impact-tag.bearish { background: rgba(239,68,68,0.1); color: var(--theme-red); }
        .news-impact-tag.neutral { background: rgba(255,255,255,0.05); color: #94a3b8; }
        .news-title { color: #cbd5e1; }

        .control-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 25px; }
        .tab-nav { display: flex; gap: 8px; }
        .nav-link { background: none; border: none; color: var(--text-dim); padding: 8px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border-radius: 6px; transition: 0.2s; }
        .nav-link:hover { color: #fff; background: rgba(255,255,255,0.02); }
        .nav-link.active { background: var(--theme-blue); color: white; }
        
        .filter-group { display: flex; align-items: center; gap: 8px; }
        .filter-label { font-size: 13px; color: var(--text-dim); font-weight: 600; }
        .filter-btn { background: #151f32; border: 1px solid var(--border-color); color: var(--text-dim); padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; }
        .filter-btn.active { background: rgba(59,130,246,0.15); border-color: var(--theme-blue); color: #fff; }

        .cards-responsive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
        .coin-card-wrapper { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; transition: 0.2s; }
        .coin-card-wrapper:hover { border-color: var(--theme-blue); transform: translateY(-2px); }

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

        .matrix-target-box { display: flex; background: #080c16; border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; margin-bottom: 12px; justify-content: space-between; text-align: center; }
        .matrix-cell { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .matrix-cell.border-sides { border-left: 1px solid var(--border-color); border-right: 1px solid var(--border-color); }
        .cell-title { font-size: 9px; color: var(--text-dim); font-weight: 700; letter-spacing: 0.3px; }
        .matrix-cell strong { font-size: 12px; font-weight: 700; }

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
        .execute-buy-button.small-btn { padding: 8px; font-size: 12px; margin-top: 10px; }
        .execute-buy-button:hover:not(:disabled) { background: #2563eb; }
        .execute-buy-button:disabled { background: #1e293b; color: #4b5563; cursor: not-allowed; }

        .watchlist-list-view { display: flex; flex-direction: column; gap: 15px; }
        .watchlist-detailed-card { background: var(--bg-card); border-left: 4px solid var(--theme-purple); border-radius: 12px; padding: 20px; border-top: 1px solid var(--border-color); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
        .watch-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .watch-title-group { display: flex; align-items: center; gap: 12px; }
        .watch-title-group h2 { font-size: 18px; font-weight: 800; color: white; }
        .remove-watch-btn { background: rgba(239,68,68,0.1); color: var(--theme-red); border: 1px solid rgba(239,68,68,0.2); padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .remove-watch-btn:hover { background: var(--theme-red); color: white; }
        
        .watch-price-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
        .watch-price { font-size: 26px; font-weight: 800; color: white; }
        
        .watch-info-board { background: var(--bg-inner-box); padding: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03); }
        .info-status-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .info-label { font-size: 13px; color: var(--text-dim); }
        .status-highlight { font-size: 13px; font-weight: 800; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.5px; }
        .status-highlight.strong-buy { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; }
        .status-highlight.buy { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
        .status-highlight.hold { background: rgba(71, 85, 105, 0.5); color: #cbd5e1; }
        .status-highlight.sell { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }

        .info-bullet-list { list-style-type: none; padding-left: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
        .info-bullet-list li { position: relative; padding-left: 18px; font-size: 13px; color: #cbd5e1; line-height: 1.5; }
        .info-bullet-list li::before { content: "•"; position: absolute; left: 0; top: 0; color: var(--theme-blue); font-size: 18px; line-height: 1; }
        .info-bullet-list li b { color: white; }
        .watch-buy { max-width: 350px; margin-top: 20px; }

        /* CSS DASHBOARD (PUSAT INTELIJEN) */
        .dashboard-grid { display: flex; gap: 25px; flex-wrap: wrap; }
        .dash-col-left { flex: 2; min-width: 300px; display: flex; flex-direction: column; gap: 20px; }
        .dash-col-right { flex: 1; min-width: 300px; }

        .market-health-card { background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; }
        .market-health-card h3 { font-size: 14px; color: var(--theme-blue); margin-bottom: 12px; }
        .health-status-text { font-size: 20px; font-weight: 800; color: white; margin-bottom: 15px; }
        .health-bar-container { display: flex; width: 100%; height: 24px; border-radius: 6px; overflow: hidden; font-size: 11px; font-weight: 700; text-align: center; line-height: 24px; color: white; }
        .bull-bar { background: var(--theme-green); transition: width 0.5s ease-in-out; }
        .bear-bar { background: var(--theme-red); transition: width 0.5s ease-in-out; }
        .health-hint { font-size: 12px; color: var(--text-dim); margin-top: 12px; font-style: italic; }
        .calm-state { text-align: center; padding: 40px 20px; }
        .calm-state h3 { font-size: 18px; color: var(--theme-green); }

        .dash-btc { margin-bottom: 0; }

        .top-nominations-board { background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; height: 100%; }
        .top-nominations-board h3 { font-size: 15px; color: #facc15; margin-bottom: 5px; }
        .top-nominations-board p { font-size: 12px; color: var(--text-dim); margin-bottom: 20px; }
        .top-coins-list { display: flex; flex-direction: column; gap: 15px; }
        .top-coin-item { display: flex; gap: 15px; background: var(--bg-inner-box); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03); }
        .top-rank-badge { font-size: 24px; font-weight: 900; color: #334155; }
        .top-coin-details { flex: 1; }
        .top-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .top-header h4 { font-size: 16px; font-weight: 800; }
        .top-price-row { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; }
        .top-info-desc { font-size: 11px; color: #cbd5e1; line-height: 1.5; }
        .text-dim { color: var(--text-dim); font-style: italic; margin-top: 4px; }

        .alert-summary-board { background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.15); padding: 20px; border-radius: 12px; }
        .alert-summary-board h3 { font-size: 16px; font-weight: 800; color: #facc15; margin-bottom: 6px; }
        .alert-summary-board p { font-size: 13px; color: var(--text-dim); margin-bottom: 18px; }
        .alert-cards-container.column-layout { flex-direction: column; }
        .alert-card { padding: 18px; border-radius: 10px; background: var(--bg-inner-box); border: 1px solid var(--border-color); }
        .alert-card.success { border-left: 4px solid var(--theme-green); }
        .alert-card.danger { border-left: 4px solid var(--theme-red); }
        .alert-card.critical { border-left: 4px solid #f59e0b; background: rgba(245,158,11,0.05); }
        .alert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .alert-header strong { font-size: 16px; }
        .alert-badge { font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 4px; }
        .alert-card.success .alert-badge { background: rgba(16,185,129,0.2); color: var(--theme-green); }
        .alert-card.danger .alert-badge { background: rgba(239,68,68,0.2); color: var(--theme-red); }
        .alert-card.critical .alert-badge { background: rgba(245,158,11,0.2); color: #fcd34d; }
        .alert-desc-text { font-size: 13px; color: #cbd5e1; font-weight: 600; }
        
        .dash-quick-sell-btn { width: 100%; padding: 8px; border: none; border-radius: 6px; background: rgba(255,255,255,0.1); color: white; font-size: 12px; font-weight: 600; margin-top: 15px; cursor: pointer; transition: 0.2s; }
        .dash-quick-sell-btn:hover { background: var(--theme-red); }

        .portfolio-global-dashboard { display: flex; gap: 20px; margin-bottom: 25px; flex-wrap: wrap; }
        .dashboard-metric-box { flex: 1; min-width: 250px; background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.2); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
        .dashboard-metric-box.highlight { background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.2); }
        .metric-title { font-size: 13px; font-weight: 600; color: var(--text-dim); }
        .metric-value { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
        
        .mini-progress-bg { width: 100%; height: 6px; background: #0f172a; border-radius: 4px; overflow: hidden; }
        .mt-2 { margin-top: 10px; }
        .alert-card.success .mini-progress-fill { height: 100%; background: var(--theme-green); }
        .alert-card.danger .mini-progress-fill { height: 100%; background: var(--theme-red); }

        .portfolio-vertical-stack { display: flex; flex-direction: column; gap: 12px; }
        .portfolio-row-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
        .port-left-section h3 { font-size: 18px; font-weight: 800; color: white; }
        .time-subtext { font-size: 11px; color: var(--text-dim); display: block; margin-top: 4px; }
        .modal-info-subtext { font-size: 11px; font-weight: 600; color: #94a3b8; display: block; margin-top: 2px; }
        
        .prices-summary-grid { display: flex; gap: 25px; background: #080c16; padding: 10px 18px; border-radius: 6px; border: 1px solid var(--border-color); }
        .prices-summary-grid div { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
        .prices-summary-grid span { color: var(--text-dim); }
        .prices-summary-grid b { font-size: 13px; color: #94a3b8; }

        .pnl-showcase { text-align: right; min-width: 130px; }
        .pnl-showcase span { font-size: 11px; color: var(--text-dim); display: block; margin-bottom: 2px; }
        .pnl-showcase strong { font-size: 16px; font-weight: 800; }

        .close-position-btn { background: var(--theme-red); border: none; color: white; padding: 10px 16px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; transition: 0.2s; }
        .close-position-btn:hover:not(:disabled) { background: #dc2626; }
        .close-position-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        
        .loading-container-box, .empty-placeholder { background: var(--bg-card); border: 1px dashed var(--border-color); padding: 40px; text-align: center; border-radius: 12px; color: var(--text-dim); font-size: 13.5px; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}} />
    </div>
  );
}
