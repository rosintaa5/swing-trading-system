export default function Home() {
  return (
    <div
      style={{
        padding: 30,
        fontFamily: "Arial",
        background: "#0b0f1a",
        color: "#fff",
        minHeight: "100vh"
      }}
    >
      <h1 style={{ fontSize: 28 }}>📊 Swing Trading System</h1>

      <p style={{ marginTop: 10, color: "#9ca3af" }}>
        Real-time crypto signal engine (Indodax + BTC correlation)
      </p>

      <div
        style={{
          marginTop: 20,
          padding: 15,
          background: "#111827",
          borderRadius: 10,
          border: "1px solid #1f2937"
        }}
      >
        <h3>⚡ Status System</h3>
        <ul>
          <li>✔ Backend Railway Connected</li>
          <li>✔ Indodax API Active</li>
          <li>✔ Signal Engine Running</li>
        </ul>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>🚀 Features</h3>
        <ul style={{ color: "#d1d5db" }}>
          <li>Real-time BUY / SELL signal</li>
          <li>BTC influence tracking</li>
          <li>1–3 day swing prediction</li>
        </ul>
      </div>

      <p style={{ marginTop: 30, color: "#6b7280" }}>
        System ready for deployment 🚀
      </p>
    </div>
  );
}
