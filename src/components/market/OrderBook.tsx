import { useEffect, useRef, useState } from 'react';
import { fmtPrice, fmtQty } from '../../lib/format';

interface Level {
  p: number;
  q: number;
}

interface Depth {
  bids: Level[];
  asks: Level[];
  at: number;
}

/**
 * Live order book panel (Binance spot depth via /api/depth). Bids and asks
 * are rendered like Binance's book: size-proportional depth bars, best
 * quotes highlighted, spread in the middle. Polls every 4s; shows a quiet
 * unavailable note when Binance is unreachable from the region.
 */
export default function OrderBook({ symbol, height = 460 }: { symbol: string; height?: number }) {
  const [depth, setDepth] = useState<Depth | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDepth(null);
    setUnavailable(false);

    const load = async () => {
      try {
        const res = await fetch(`/api/depth?symbol=${encodeURIComponent(symbol)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        setDepth({ bids: data.bids, asks: data.asks, at: data.at });
        setUnavailable(false);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    };

    load();
    timer.current = setInterval(load, 4000);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [symbol]);

  if (unavailable && !depth) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 text-center" style={{ minHeight: height / 2 }}>
        <p className="text-xs text-muted">Live order book unavailable right now.</p>
        <p className="mt-1 text-[10px] text-muted">Market data source is unreachable — prices are unaffected.</p>
      </div>
    );
  }

  if (!depth) {
    return (
      <div className="flex items-center justify-center px-4 py-10" style={{ minHeight: height / 2 }}>
        <span className="animate-pulse font-mono text-[10px] text-muted">loading order book…</span>
      </div>
    );
  }

  const asks = depth.asks.slice(0, 9);
  const bids = depth.bids.slice(0, 9);
  const maxQty = Math.max(...asks.map((a) => a.q), ...bids.map((b) => b.q), 1e-9);
  const bestAsk = asks[asks.length - 1]?.p ?? 0;
  const bestBid = bids[0]?.p ?? 0;
  const spread = bestAsk - bestBid;

  const Row = ({ lvl, side }: { lvl: Level; side: 'ask' | 'bid' }) => {
    const isBest = side === 'ask' ? lvl.p === asks[asks.length - 1]?.p : lvl.p === bids[0]?.p;
    return (
      <div className="relative grid grid-cols-[1fr_auto] items-center px-3 py-[3px]">
        <div
          className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-down/10' : 'bg-up/10'}`}
          style={{ width: `${(lvl.q / maxQty) * 100}%` }}
        />
        <span className={`relative z-10 font-mono text-[11px] ${side === 'ask' ? 'text-down' : 'text-up'} ${isBest ? 'font-bold' : ''}`}>
          {fmtPrice(lvl.p)}
        </span>
        <span className="relative z-10 text-right font-mono text-[11px] text-muted">{fmtQty(lvl.q)}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt">Order book</p>
        <span className="font-mono text-[9px] text-muted">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-up align-middle" /> live · {symbol}/USDT
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-muted">
        <span>Price (USDT)</span>
        <span>Size ({symbol})</span>
      </div>

      {/* asks — worst on top, best at the spread */}
      <div className="flex flex-1 flex-col justify-end">
        {asks
          .slice()
          .reverse()
          .map((lvl) => (
            <Row key={`a-${lvl.p}`} lvl={lvl} side="ask" />
          ))}
      </div>

      {/* spread */}
      <div className="flex items-center justify-between border-y border-line bg-panel/40 px-3 py-1.5">
        <span className="font-mono text-xs font-bold text-txt">{fmtPrice((bestAsk + bestBid) / 2)}</span>
        <span className="font-mono text-[10px] text-muted">spread {spread > 0 ? fmtPrice(spread) : '—'}</span>
      </div>

      {/* bids — best at the spread */}
      <div className="flex flex-1 flex-col justify-start">
        {bids.map((lvl) => (
          <Row key={`b-${lvl.p}`} lvl={lvl} side="bid" />
        ))}
      </div>
    </div>
  );
}
