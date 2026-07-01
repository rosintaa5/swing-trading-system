"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";

const API = "https://confident-tranquility-production-ceaa.up.railway.app";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  // State untuk Form CRUD Tambah Pantauan
  const [formPair, setFormPair] = useState("");
  const [formEntry, setFormEntry] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formTp, setFormTp] = useState("");
  const [formSl, setFormSl] = useState("");
  const [formNewsBias, setFormNewsBias] = useState("NEUTRAL");
  const [formNotes, setFormNotes] = useState("");

  // State untuk Mode Edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("OPEN");

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("v12_fixed", (res) => {
      setData(res);
      if (res.portfolio) setPortfolio(res.portfolio);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("v12_fixed");
    };
  }, []);

  const loadPortfolio = async () => {
    try {
      const res = await fetch(`${API}/portfolio`);
      if (res.ok) setPortfolio(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadPortfolio();
  }, []);

  // ================= CRUD ACTIONS =================
  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPair) return alert("Nama Pair wajib diisi!");
    
    try {
      const res = await fetch(`${API}/portfolio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: formPair.toLowerCase(),
          entry_price: parseFloat(formEntry) || 0,
          amount: parseFloat(formAmount) || 0,
          target_tp: parseFloat(formTp) || 0,
          target_sl: parseFloat(formSl) || 0,
          notes: formNotes,
          news_bias: formNewsBias
        })
      });
      if (res.ok) {
        // Reset Form
        setFormPair(""); setFormEntry(""); setFormAmount("");
        setFormTp(""); setFormSl(""); setFormNotes(""); setFormNewsBias("NEUTRAL");
        loadPortfolio();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateEntry = async (id: number) => {
    const targetItem = portfolio.find(p => p.id === id);
    if (!targetItem) return;

    try {
      const res = await fetch(`${API}/portfolio/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_tp: targetItem.target_tp,
          target_sl: targetItem.target_sl,
          status: editStatus,
          notes: editNotes,
          news_bias: targetItem.news_bias
        })
      });
      if (res.ok) {
        setEditingId(null);
        loadPortfolio();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    if (!confirm("Hapus koin ini dari rekap pantauan?")) return;
    try {
      const res = await fetch(`${API}/portfolio/${id}`, { method: "DELETE" });
      if (res.ok) loadPortfolio();
    } catch (err) {
      console.error(err);
    }
  };

  // Quick Action Tambah dari Scan Live langsung ke Form CRUD
  const pushToForm = (coin: any) => {
    setFormPair(coin.pair);
    setFormEntry(coin.price.toString());
    setFormTp((coin.price * 1.05).toFixed(1));
    setFormSl((coin.price * 0.97).toFixed(1));
    setFormNotes(`Analisis AI: Skor Kuantitatif ${coin.score.toFixed(2)}. Berita terpantau ${coin.news_direction}`);
    setFormNewsBias(coin.news_direction);
  };

  // Narasi cerdas untuk Scanner Real-time
  const analyzedCoins = useMemo(() => {
    if (!data?.top) return [];
    return data.top.map((c: any) => {
      const n: string[] = [];
      n.push(`[Aktivitas Volume] Berada di skala ${c.whale_score?.toFixed(1)}/10.`);
      n.push(`[Momentum Volatilitas] Bernilai ${c.momentum_score?.toFixed(1)}/10.`);
      n.push(`[Sentimen Berita] Arah Dampak: ${c.news_direction}. ${c.news_headline}`);
      return { ...c, customNarrative: n };
    });
  }, [data]);

  const filteredCoins = useMemo(() => {
    if (filter === "ALL") return analyzedCoins;
    return analyzedCoins.filter((c: any) => c.signal === filter);
  }, [analyzedCoins, filter]);

  return (
    <div className="app">
      {/* TOPBAR */}
      <div className="topbar">
        <div>
          <h1>PRO-TRADER MONITORING & ANALYSIS RECAP</h1>
          <p style={{ fontSize: "13px", color: "#a1a1aa" }}>
            Real-time Indodax Scanner Feed | BTC: {data?.btc ? parseFloat(data.btc).toLocaleString() : "-"} IDR ({data?.btcChange || 0}%)
          </p>
        </div>
        <span className={`status-badge ${connected ? "live" : "offline"}`}>
          {connected ? "MONITOR CONNECTED" : "OFFLINE READ MODE"}
        </span>
      </div>

      <div className="main-layout">
        {/* LEFT COLUMN: CRUD FORM & PANTAUAN REKAP */}
        <div className="left-panel">
          
          {/* CREATE FORM */}
          <div className="crud-box">
            <h2>➕ BUAT REKAP ENTRI & PANTAUAN BARU</h2>
            <form onSubmit={handleCreateEntry} className="grid-form">
              <input type="text" placeholder="Contoh: btc_idr" value={formPair} onChange={e => setFormPair(e.target.value)} />
              <input type="number" step="any" placeholder="Harga Masuk / Entry" value={formEntry} onChange={e => setFormEntry(e.target.value)} />
              <input type="number" step="any" placeholder="Jumlah Aset (Amount)" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
              <input type="number" step="any" placeholder="Target Take Profit (TP)" value={formTp} onChange={e => setFormTp(e.target.value)} />
              <input type="number" step="any" placeholder="Batas Stop Loss (SL)" value={formSl} onChange={e => setFormSl(e.target.value)} />
              
              <select value={formNewsBias} onChange={e => setFormNewsBias(e.target.value)}>
                <option value="BULLISH">BERITA BULLISH (↗)</option>
                <option value="NEUTRAL">BERITA NEUTRAL (→)</option>
                <option value="BEARISH">BERITA BEARISH (↘)</option>
              </select>

              <textarea style={{ gridColumn: "1/-1" }} placeholder="Catatan Alasan Analisis Masuk Pasar..." value={formNotes} onChange={e => setFormNotes(e.target.value)} />
              <button type="submit" className="action-btn create-btn">SIMPAN KE DAFTAR REKAP</button>
            </form>
          </div>

          {/* PORTFOLIO REKAP LIST (READ, UPDATE, DELETE) */}
          <div className="portfolio-box">
            <h2>📋 REKAP JURNAL TRADING & MONITORING POSISI</h2>
            {portfolio.map((p: any) => (
              <div key={p.id} className={`recap-card ${p.status.toLowerCase()}`}>
                <div className="recap-header">
                  <div>
                    <span className="pair-title">{p.pair.toUpperCase()}</span>
                    <span className={`status-pill ${p.status.toLowerCase()}`}>{p.status}</span>
                  </div>
                  <div className="crud-actions">
                    {editingId === p.id ? (
                      <button className="mini-btn save" onClick={() => handleUpdateEntry(p.id)}>Simpan</button>
                    ) : (
                      <button className="mini-btn edit" onClick={() => {
                        setEditingId(p.id);
                        setEditNotes(p.notes || "");
                        setEditStatus(p.status);
                      }}>Edit Catatan</button>
                    )}
                    <button className="mini-btn delete" onClick={() => handleDeleteEntry(p.id)}>Hapus</button>
                  </div>
                </div>

                <div className="recap-body">
                  <p>Entry: <b>{p.entry_price?.toLocaleString()} IDR</b> | Jml: {p.amount}</p>
                  <p>Target Plan: <span style={{ color: "#10b981" }}>TP: {p.target_tp?.toLocaleString()}</span> | <span style={{ color: "#ef4444" }}>SL: {p.target_sl?.toLocaleString()}</span></p>
                  
                  <div className="news-badge-area">
                    <span>Pengaruh Berita: </span>
                    <b className={`news-bias-text ${p.news_bias?.toLowerCase()}`}>{p.news_bias}</b>
                  </div>

                  {/* UPDATE NOTES SECTION */}
                  {editingId === p.id ? (
                    <div style={{ marginTop: "10px" }}>
                      <textarea className="edit-textarea" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                      <select className="edit-select" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                        <option value="OPEN">OPEN (Masih Dipantau)</option>
                        <option value="CLOSED">CLOSED (Selesai/Sudah Keluar)</option>
                      </select>
                    </div>
                  ) : (
                    <p className="user-notes">📝 <i>{p.notes || "Tidak ada catatan analisis tambahan."}</i></p>
                  )}
                </div>

                <div className="recap-footer">
                  <span>Floating Keuntungan: </span>
                  <b style={{ color: p.pnl >= 0 ? "#10b981" : "#ef4444" }}>
                    {p.pnl >= 0 ? `+${p.pnl?.toLocaleString()}` : p.pnl?.toLocaleString()} IDR
                  </b>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: REAL-TIME INDODAX SCANNER FEED */}
        <div className="right-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>📊 REAL-TIME MARKET SCANS</h2>
            <div className="filter-container">
              <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>ALL</button>
              <button className={filter === "BUY" ? "active" : ""} onClick={() => setFilter("BUY")}>BUY</button>
              <button className={filter === "SELL" ? "active" : ""} onClick={() => setFilter("SELL")}>SELL</button>
            </div>
          </div>

          <div className="scan-grid">
            {filteredCoins.map((c: any) => (
              <div key={c.pair} className="scan-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b style={{ textTransform: "uppercase", color: "#60a5fa" }}>{c.pair.replace("_", " / ")}</b>
                  <span className={`signal-tag ${c.signal.toLowerCase()}`}>{c.signal}</span>
                </div>
                <div className="scan-price">Harga: {c.price.toLocaleString()} IDR</div>
                
                <div className="narrative-box">
                  {c.customNarrative.map((text: string, i: number) => (
                    <div key={i} className="narrative-line">• {text}</div>
                  ))}
                </div>

                <button className="push-to-crud-btn" onClick={() => pushToForm(c)}>
                  📥 Tarik ke Jurnal Pantauan
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STYLES PACK */}
      <style dangerouslySetInnerHTML={{ __html: `
        .app { background: #090d16; color: #f4f4f5; min-height: 100vh; padding: 24px; font-family: system-ui, sans-serif; }
        .topbar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px; }
        .status-badge { padding: 6px 14px; border-radius: 30px; font-size: 11px; font-weight: bold; }
        .status-badge.live { background: #064e3b; color: #34d399; }
        .status-badge.offline { background: #7f1d1d; color: #f87171; }
        
        .main-layout { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; }
        .crud-box, .portfolio-box { background: #111827; padding: 20px; border-radius: 12px; border: 1px solid #1e293b; margin-bottom: 24px; }
        
        h2 { font-size: 15px; letter-spacing: 0.5px; color: #e4e4e7; margin-bottom: 14px; text-transform: uppercase; }
        
        .grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .grid-form input, .grid-form select, .grid-form textarea, .edit-textarea, .edit-select {
          background: #1f2937; color: white; border: 1px solid #374151; padding: 10px; border-radius: 6px; font-size: 13px;
        }
        .grid-form textarea { height: 60px; resize: none; }
        
        .action-btn { grid-column: 1/-1; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        .create-btn { background: #2563eb; color: white; }
        .create-btn:hover { background: #1d4ed8; }
        
        .recap-card { background: #1f2937; border-radius: 8px; padding: 16px; border-left: 4px solid #9ca3af; margin-bottom: 12px; }
        .recap-card.open { border-left-color: #3b82f6; }
        .recap-card.closed { border-left-color: #10b981; opacity: 0.75; }
        
        .recap-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .pair-title { font-weight: bold; font-size: 16px; margin-right: 8px; }
        .status-pill { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase; }
        .status-pill.open { background: #2563eb; }
        .status-pill.closed { background: #10b981; }

        .recap-body p { margin: 4px 0; font-size: 13px; color: #cbd5e1; }
        .user-notes { background: #111827; padding: 8px; border-radius: 4px; color: #9ca3af; margin-top: 6px !important; }
        .news-badge-area { margin-top: 6px; font-size: 13px; }
        .news-bias-text.bullish { color: #10b981; }
        .news-bias-text.neutral { color: #f59e0b; }
        .news-bias-text.bearish { color: #ef4444; }

        .edit-textarea { width: 100%; height: 50px; margin-bottom: 6px; }
        .edit-select { width: 100%; }
        
        .recap-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #374151; font-size: 13px; display: flex; justify-content: space-between; }
        
        .mini-btn { padding: 4px 8px; font-size: 11px; margin-left: 4px; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: 500; }
        .mini-btn.edit { background: #4b5563; }
        .mini-btn.save { background: #059669; }
        .mini-btn.delete { background: #dc2626; }
        
        .filter-container button { background: #1f2937; color: #9ca3af; border: none; padding: 6px 12px; border-radius: 6px; margin-left: 4px; cursor: pointer; font-size: 12px; }
        .filter-container button.active { background: #2563eb; color: white; }
        
        .scan-grid { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
        .scan-card { background: #111827; padding: 16px; border-radius: 10px; border: 1px solid #1e293b; }
        .scan-price { font-size: 14px; margin-top: 4px; color: #e4e4e7; }
        
        .signal-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
        .signal-tag.buy { background: #10b981; color: white; }
        .signal-tag.sell { background: #ef4444; color: white; }
        .signal-tag.hold { background: #4b5563; color: white; }
        
        .narrative-box { background: #1e293b; padding: 10px; border-radius: 6px; margin-top: 10px; }
        .narrative-line { font-size: 12px; color: #cbd5e1; margin-bottom: 2px; }
        
        .push-to-crud-btn { background: transparent; border: 1px dashed #3b82f6; color: #60a5fa; width: 100%; padding: 8px; border-radius: 6px; margin-top: 10px; cursor: pointer; font-size: 12px; font-weight: 500; }
        .push-to-crud-btn:hover { background: #1e3a8a; color: white; }
      `}} />
    </div>
  );
}
