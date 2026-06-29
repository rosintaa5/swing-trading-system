"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

export default function Page() {
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("socket connected");
      setConnected(true);
    });

    socket.on("swing", (res) => {
      console.log("DATA RECEIVED:", res);
      setData(res);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    return () => {
      socket.off("connect");
      socket.off("swing");
      socket.off("disconnect");
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>SWING DASHBOARD</h2>

      <p>
        Status:{" "}
        <b style={{ color: connected ? "green" : "red" }}>
          {connected ? "CONNECTED" : "DISCONNECTED"}
        </b>
      </p>

      <p>BTC: {data?.btc ?? "-"}</p>

      <div>
        {data?.coins?.map((c: any, i: number) => (
          <div
            key={i}
            style={{
              border: "1px solid #ccc",
              margin: 10,
              padding: 10
            }}
          >
            <b>{c.pair}</b>
            <br />
            PRICE: {c.price}
            <br />
            CHANGE: {c.change}
            <br />
            SIGNAL:{" "}
            <span
              style={{
                color:
                  c.signal?.includes("BUY")
                    ? "green"
                    : c.signal?.includes("SELL")
                    ? "red"
                    : "orange"
              }}
            >
              {c.signal}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
