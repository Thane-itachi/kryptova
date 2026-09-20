import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { useMarket } from '../../context/MarketContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { fmtQty, fmtTime } from '../../lib/format';
import { PriceChange } from '../market-bits';

interface MarketMoveEvent {
  id: string;
  type: 'market';
  symbol: string;
  price: number;
  deltaPct: number; // actual tick delta between two polls, derived from real market data
  timestamp: number;
  isLive: boolean;
}

interface UserTradeEvent {
  id: string;
  type: 'trade';
  timestamp: number;
  side: 'buy' | 'sell';
  symbol: string;
  quantity: number;
}

type ActivityEvent = MarketMoveEvent | UserTradeEvent;

export default function LiveActivity() {
  const { quotes, status } = useMarket();
  const { transactions } = usePortfolio();
  const [marketEvents, setMarketEvents] = useState<MarketMoveEvent[]>([]);
  const prevQuotesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const prev = prevQuotesRef.current;
    const isFirstLoad = Object.keys(prev).length === 0;
    const newEvents: MarketMoveEvent[] = [];
    const nextPrev: Record<string, number> = {};

    for (const [symbol, quote] of Object.entries(quotes)) {
      nextPrev[symbol] = quote.price;
      if (
        !isFirstLoad &&
        prev[symbol] !== undefined &&
        prev[symbol] !== quote.price &&
        prev[symbol] > 0
      ) {
        newEvents.push({
          id: `mkt-${symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'market',
          symbol: quote.symbol,
          price: quote.price,
          deltaPct: ((quote.price - prev[symbol]) / prev[symbol]) * 100,
          timestamp: Date.now(),
          isLive: status === 'live' && !quote.isDemo,
        });
      }
    }

    prevQuotesRef.current = nextPrev;

    if (newEvents.length > 0) {
      setMarketEvents((existing) => [...newEvents, ...existing].slice(0, 12));
    }
  }, [quotes, status]);

  const userTradeEvents: UserTradeEvent[] = useMemo(() => {
    return transactions.slice(0, 5).map((txn) => ({
      id: `trade-${txn.id}`,
      type: 'trade' as const,
      timestamp: new Date(txn.created_at).getTime(),
      side: txn.side,
      symbol: txn.symbol,
      quantity: txn.quantity,
    }));
  }, [transactions]);

  const allEvents = useMemo(() => {
    const combined: ActivityEvent[] = [...marketEvents, ...userTradeEvents];
    combined.sort((a, b) => b.timestamp - a.timestamp);
    return combined.slice(0, 12);
  }, [marketEvents, userTradeEvents]);

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className={`text-primary-400 ${status === 'live' ? 'animate-pulse' : ''}`} />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt">
            Live activity
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest ${
            status === 'live' ? 'text-up' : 'text-primary-400'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              status === 'live' ? 'animate-pulse bg-up' : 'bg-primary-400'
            }`}
          />
          {status === 'live' ? 'Live' : 'Demo'}
        </span>
      </div>

      {allEvents.length === 0 ? (
        <div className="py-8">
          <p className="text-xs text-muted">
            Waiting for market updates — live price ticks and your simulated trades will appear
            here automatically.
          </p>
        </div>
      ) : (
        <div className="max-h-[420px] divide-y divide-line/60 overflow-y-auto pr-1">
          {allEvents.map((event) => {
            if (event.type === 'trade') {
              return (
                <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs text-txt">
                      <span
                        className={`font-mono font-bold uppercase tracking-wide ${
                          event.side === 'buy' ? 'text-up' : 'text-down'
                        }`}
                      >
                        {event.side}
                      </span>{' '}
                      <span className="font-mono font-semibold">{fmtQty(event.quantity)}</span>{' '}
                      <span className="font-mono font-bold">{event.symbol}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">Your trade · simulated</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted">
                    {fmtTime(event.timestamp)}
                  </span>
                </div>
              );
            }

            return (
              <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-xs font-bold text-txt">{event.symbol}</span>
                  <PriceChange value={event.deltaPct} />
                </div>
                <div className="flex items-baseline gap-3 shrink-0">
                  <span className="font-mono text-[11px] text-muted">{fmtTime(event.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
