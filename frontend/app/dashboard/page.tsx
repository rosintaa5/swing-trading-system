"use client";

import { useState } from "react";

type Coin = {
  pair: string;
  price: number;
  signal: string;
};

export default function Page() {
  const [data] = useState({
    btc: 0,
    coins: [
      { pair: "BTC/IDR", price: 0, signal: "BUY" },
      { pair: "ETH/IDR", price: 0, signal: "SELL" }
    ] as Coin[]
  });

  return (
    <div style={{ padding: 20 }}>
      <h2>SWING DASHBOARD</h2>

      <div style={{ marginBottom: 20 }}>
        <b>BTC:</b> {data.btc}
      </div>

      {data.coins.map((c, i) => (
        <div key={i} style={{ border: "1px solid #ddd", margin: 10, padding: 10, borderRadius: 8 }}>
          <div><b>{c.pair}</b></div>
          <div>PRICE: {c.price}</div>
          <div style={{ color: c.signal === "BUY" ? "green" : "red", fontWeight: "bold" }}>
            {c.signal}
          </div>
        </div>
      ))}
    </div>
  );
}
