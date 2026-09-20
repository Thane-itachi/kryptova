// Vercel Serverless Function: /api/depth
//
// Proxies Binance's public spot order book (depth) for the order-book panel.
// No API key required. Cached in-memory for 2s per symbol so any number of
// browser tabs polling every few seconds results in at most one upstream
// call per 2s per symbol, keeping us far below Binance's weight limits.
// Falls back to the data-only mirror (data-api.binance.vision) when the
// main API host is unreachable (geo-restrictions).
//
// No auth required — this is public, read-only market data.

import type { VercelRequest, VercelResponse } from '@vercel/node';

const HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
const CACHE_TTL_MS = 2_000;
const MAX_LEVELS = 12;

interface Level {
  p: number; // price
  q: number; // quantity
}

interface DepthDTO {
  symbol: string;
  bids: Level[];
  asks: Level[];
  at: number;
  stale?: boolean;
}

const memCache = new Map<string, { data: DepthDTO; at: number }>();

// Whichever symbols the client may ask for map to Binance pairs the same way
// the streaming layer does. Reject anything else.
const PAIRS: Record<string, string> = {
  BTC: 'btcusdt',
  ETH: 'ethusdt',
  SOL: 'solusdt',
  XRP: 'xrpusdt',
  BNB: 'bnbusdt',
  ADA: 'adausdt',
  DOGE: 'dogeusdt',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const symbol = String(req.query?.symbol ?? '').toUpperCase();
  const pair = PAIRS[symbol];
  if (!pair) {
    res.status(400).json({ error: 'unsupported symbol' });
    return;
  }

  const cached = memCache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    res.status(200).json(cached.data);
    return;
  }

  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/depth?symbol=${pair.toUpperCase()}&limit=${MAX_LEVELS * 2}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) continue;
      const raw = await r.json();
      const bids: Level[] = (raw?.bids ?? []).slice(0, MAX_LEVELS).map(([p, q]: [string, string]) => ({ p: +p, q: +q }));
      const asks: Level[] = (raw?.asks ?? []).slice(0, MAX_LEVELS).map(([p, q]: [string, string]) => ({ p: +p, q: +q }));
      if (bids.length === 0 || asks.length === 0) continue;
      const data: DepthDTO = { symbol, bids, asks, at: Date.now() };
      memCache.set(symbol, { data, at: Date.now() });
      res.status(200).json(data);
      return;
    } catch {
      // try the next host
    }
  }

  res.status(502).json({ error: 'order book unavailable' });
}
