import express from "express";
import http from "http";
import { Server } from "socket.io";
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PAIRS = ["btc_idr","eth_idr","sol_idr"];

async function price(pair){
  const r = await axios.get(
    `https://indodax.com/api/ticker/${pair}`
  );
  return parseFloat(r.data.ticker.last);
}

function regime(curr, prev){
  const c = (curr - prev) / prev;
  if(c > 0.01) return "BULL";
  if(c < -0.01) return "BEAR";
  return "SIDEWAYS";
}

function flow(){
  return Math.random() > 0.5
    ? "ACCUMULATION"
    : "NEUTRAL";
}

function score(reg, fl){
  let s = 0;
  if(reg === "BULL") s += 0.6;
  if(fl === "ACCUMULATION") s += 0.4;
  return s;
}

function signal(s){
  if(s > 0.75) return "STRONG BUY";
  if(s > 0.6) return "BUY";
  return "WAIT";
}

function risk(p){
  return {
    sl: p * 0.97,
    tp: p * 1.05
  };
}

let lastBTC = 1;

setInterval(async () => {
  const btc = await price("btc_idr");

  const reg = regime(btc, lastBTC);
  lastBTC = btc;

  const fl = flow();
  const sc = score(reg, fl);

  const coins = [];

  for(const p of PAIRS){
    const pr = await price(p);

    coins.push({
      pair: p.toUpperCase(),
      price: pr,
      regime: reg,
      flow: fl,
      score: sc,
      signal: signal(sc),
      risk: risk(pr)
    });
  }

  io.emit("swing", { btc: reg, coins });

}, 5000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log("RUNNING", PORT));
