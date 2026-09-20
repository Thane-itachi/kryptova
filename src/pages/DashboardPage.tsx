import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { usePortfolio } from '../context/PortfolioContext';
import { fmtPct, fmtPrice, fmtQty, fmtSignedUSD, fmtTime, fmtUSD } from '../lib/format';
import { Button } from '../components/ui';
import { PriceChange } from '../components/market-bits';
import PriceChart from '../components/charts/PriceChart';
import LiveActivity from '../components/market/LiveActivity';
import type { Quote } from '../types';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** One cell of the terminal account bar — label over mono value, hairline-separated. */
function AcctStat({
  label,
  value,
  tone = 'default',
  sub,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'up' | 'down';
  sub?: string;
}) {
  const toneCls = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-txt';
  return (
    <div className="px-5 py-3 first:pl-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={`text-lg font-semibold font-mono leading-none ${toneCls}`}>{value}</p>
        {sub && (
          <p className={`text-[11px] font-mono ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-muted'}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

type BottomTab = 'positions' | 'orders' | 'history';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { list, getQuote } = useMarket();
  const {
    cash,
    portfolioValue,
    unrealizedPL,
    realizedPL,
    totalPL,
    totalPLPercent,
    holdings,
    orders,
    watchlist,
    transactions,
  } = usePortfolio();

  const [chartSymbol, setChartSymbol] = useState('BTC');
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions');
  const [search, setSearch] = useState('');

  const greetingName =
    profile?.display_name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Trader';

  const now = useMemo(() => new Date(), []);
  const greeting = greetingFor(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Market watch: watchlisted symbols first, then the rest, filterable by search
  const marketWatch = useMemo(() => {
    const crypto: Quote[] = list.filter((q) => q.kind === 'crypto');
    const ranked = [...crypto].sort((a, b) => {
      const aWatch = watchlist.includes(a.symbol) ? 0 : 1;
      const bWatch = watchlist.includes(b.symbol) ? 0 : 1;
      return aWatch - bWatch;
    });
    const q = search.trim().toLowerCase();
    if (!q) return ranked.slice(0, 14);
    return ranked
      .filter((it) => it.symbol.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q))
      .slice(0, 14);
  }, [list, watchlist, search]);

  // Open positions enriched with live prices
  const positions = useMemo(() => {
    return holdings
      .map((h) => {
        const quote = getQuote(h.symbol);
        const last = quote?.price ?? h.avg_price;
        const marketValue = h.quantity * last;
        const openPL = h.quantity * (last - h.avg_price);
        const openPLPct = h.avg_price > 0 ? (openPL / (h.quantity * h.avg_price)) * 100 : 0;
        return { ...h, last, marketValue, openPL, openPLPct };
      })
      .sort((a, b) => b.marketValue - a.marketValue);
  }, [holdings, getQuote]);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === 'active'),
    [orders]
  );

  const recentTransactions = useMemo(() => transactions.slice(0, 8), [transactions]);

  const tabs: { id: BottomTab; label: string; count: number }[] = [
    { id: 'positions', label: 'Open positions', count: positions.length },
    { id: 'orders', label: 'Pending orders', count: activeOrders.length },
    { id: 'history', label: 'History', count: recentTransactions.length },
  ];

  return (
    <div className="space-y-4">
      {/* ── Slim greeting line ────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-txt">{greeting}, {greetingName}</span>
          <span className="mx-2 text-line">|</span>
          {dateLine}
          <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-[11px] font-semibold uppercase tracking-widest text-primary-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary-400" />
            Demo account
          </span>
        </p>
        <Link to="/app/markets">
          <Button variant="primary" size="sm">
            Trade Markets
          </Button>
        </Link>
      </header>

      {/* ── Account bar ──────────────────────────────────────────── */}
      <section className="flex flex-wrap items-stretch divide-x divide-line rounded-lg border border-line bg-surface/60">
        <AcctStat label="Equity" value={fmtUSD(portfolioValue)} />
        <AcctStat label="Balance" value={fmtUSD(cash)} />
        <AcctStat
          label="Open P/L"
          value={fmtSignedUSD(unrealizedPL)}
          tone={unrealizedPL >= 0 ? 'up' : 'down'}
        />
        <AcctStat
          label="Realized P/L"
          value={fmtSignedUSD(realizedPL)}
          tone={realizedPL >= 0 ? 'up' : 'down'}
        />
        <AcctStat
          label="All-time P/L"
          value={fmtSignedUSD(totalPL)}
          sub={totalPLPercent !== null ? `(${fmtPct(totalPLPercent)})` : undefined}
          tone={totalPL >= 0 ? 'up' : 'down'}
        />
      </section>

      {/* ── Terminal grid: market watch │ chart │ live feed ────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_300px]">
        {/* Market watch */}
        <div className="flex max-h-[560px] flex-col overflow-hidden rounded-lg border border-line bg-surface/60">
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-txt">
              Market watch
            </p>
          </div>
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={12} className="shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol…"
              className="w-full bg-transparent text-xs text-txt placeholder:text-muted focus:outline-none"
            />
          </div>
          <div className="flex-1 divide-y divide-line/60 overflow-y-auto">
            {marketWatch.map((quote) => {
              const watched = watchlist.includes(quote.symbol);
              return (
                <Link
                  key={quote.symbol}
                  to={`/app/asset/${quote.symbol}`}
                  className="flex items-center justify-between px-3 py-2 transition-colors hover:bg-panel"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {watched && <Bookmark size={10} className="shrink-0 text-primary-400" />}
                    <div className="min-w-0">
                      <p className="text-xs font-bold font-mono text-txt">{quote.symbol}</p>
                      <p className="truncate text-[10px] text-muted">{quote.name}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs font-semibold text-txt">{fmtPrice(quote.price)}</p>
                    <PriceChange value={quote.change24h} />
                  </div>
                </Link>
              );
            })}
            {marketWatch.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted">No symbols match your search.</p>
            )}
          </div>
          <Link
            to="/app/markets"
            className="flex items-center justify-center gap-1 border-t border-line py-2 text-[11px] font-semibold text-primary-400 transition-colors hover:bg-panel"
          >
            All markets <ArrowRight size={11} />
          </Link>
        </div>

        {/* Chart */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface/60">
          <div className="flex items-center justify-between border-b border-line px-3">
            <div className="flex">
              {['BTC', 'ETH', 'SOL'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setChartSymbol(sym)}
                  className={`border-b-2 px-4 py-2.5 font-mono text-xs font-bold tracking-wide transition-colors ${
                    chartSymbol === sym
                      ? 'border-primary-400 text-txt'
                      : 'border-transparent text-muted hover:text-txt'
                  }`}
                >
                  {sym}/USD
                </button>
              ))}
            </div>
            <Link
              to={`/app/asset/${chartSymbol}`}
              className="inline-flex items-center gap-1 px-3 py-2 text-[11px] font-semibold text-primary-400 transition-colors hover:text-primary-300"
            >
              View asset <ArrowRight size={11} />
            </Link>
          </div>
          <div className="flex-1 px-2 pb-3 pt-4">
            <PriceChart symbol={chartSymbol} kind="crypto" height={380} showRanges={true} />
          </div>
        </div>

        {/* Live feed */}
        <div className="flex max-h-[560px] flex-col overflow-hidden rounded-lg border border-line bg-surface/60">
          <LiveActivity />
        </div>
      </section>

      {/* ── Positions / Orders / History ──────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-line bg-surface/60">
        <div className="flex overflow-x-auto border-b border-line">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                bottomTab === tab.id
                  ? 'border-primary-400 text-txt'
                  : 'border-transparent text-muted hover:text-txt'
              }`}
            >
              {tab.label}
              <span className="font-mono text-[10px] text-muted">{tab.count}</span>
            </button>
          ))}
        </div>

        {bottomTab === 'positions' && (
          <div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line/60 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
              <p className="text-left">Symbol</p>
              <p className="hidden text-right sm:block">Units</p>
              <p className="hidden text-right sm:block">Avg price</p>
              <p className="hidden text-right sm:block">Last</p>
              <p className="text-right">Value</p>
              <p className="text-right">Open P/L</p>
            </div>
            {positions.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
                <p className="text-xs text-muted">No open positions — buy your first asset to start trading.</p>
                <Link to="/app/markets">
                  <Button variant="primary" size="sm">Start Trading</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-line/60">
                {positions.map((pos) => (
                  <Link
                    key={pos.symbol}
                    to={`/app/asset/${pos.symbol}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-panel sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
                  >
                    <p className="text-left text-xs font-bold font-mono text-txt">{pos.symbol}</p>
                    <p className="hidden text-right font-mono text-xs text-txt sm:block">{fmtQty(pos.quantity)}</p>
                    <p className="hidden text-right font-mono text-xs text-muted sm:block">{fmtPrice(pos.avg_price)}</p>
                    <p className="hidden text-right font-mono text-xs text-txt sm:block">{fmtPrice(pos.last)}</p>
                    <p className="text-right font-mono text-xs font-semibold text-txt">{fmtUSD(pos.marketValue)}</p>
                    <p className={`text-right font-mono text-xs font-semibold ${pos.openPL >= 0 ? 'text-up' : 'text-down'}`}>
                      {fmtSignedUSD(pos.openPL)}
                      <span className="block text-[10px] opacity-80">{fmtPct(pos.openPLPct)}</span>
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {bottomTab === 'orders' && (
          <div>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b border-line/60 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
              <p>Type</p>
              <p className="text-left">Symbol</p>
              <p className="text-right">Units</p>
              <p className="text-right">Trigger price</p>
              <p className="text-right">Placed</p>
            </div>
            {activeOrders.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted">
                No pending orders — take-profit / stop-loss orders from the trade panel appear here.
              </p>
            ) : (
              <div className="divide-y divide-line/60">
                {activeOrders.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3"
                  >
                    <p
                      className={`text-[11px] font-bold uppercase tracking-wider font-mono ${
                        order.kind === 'tp' ? 'text-up' : 'text-down'
                      }`}
                    >
                      {order.kind}
                    </p>
                    <p className="text-left text-xs font-bold font-mono text-txt">{order.symbol}</p>
                    <p className="text-right font-mono text-xs text-txt">{fmtQty(order.quantity)}</p>
                    <p className="text-right font-mono text-xs text-muted">{fmtPrice(order.trigger_price)}</p>
                    <p className="text-right font-mono text-[11px] text-muted">{fmtTime(order.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {bottomTab === 'history' && (
          <div>
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line/60 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted sm:grid-cols-[auto_1fr_auto_auto_auto_auto]">
              <p>Type</p>
              <p className="text-left">Symbol</p>
              <p className="hidden text-right sm:block">Units</p>
              <p className="hidden text-right sm:block">Price</p>
              <p className="hidden text-right sm:block">Time</p>
              <p className="text-right">Total</p>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted">
                No transactions yet — your completed demo trades will appear here.
              </p>
            ) : (
              <div className="divide-y divide-line/60">
                {recentTransactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto_auto_auto]"
                  >
                    <p
                      className={`text-[11px] font-bold uppercase tracking-wider font-mono ${
                        txn.side === 'buy' ? 'text-up' : 'text-down'
                      }`}
                    >
                      {txn.side}
                    </p>
                    <p className="text-left text-xs font-bold font-mono text-txt">{txn.symbol}</p>
                    <p className="hidden text-right font-mono text-xs text-muted sm:block">{fmtQty(txn.quantity)}</p>
                    <p className="hidden text-right font-mono text-xs text-muted sm:block">{fmtPrice(txn.price)}</p>
                    <p className="hidden text-right font-mono text-[11px] text-muted sm:block">
                      {fmtTime(txn.created_at)}
                    </p>
                    <p className="text-right font-mono text-xs font-semibold text-txt">{fmtUSD(txn.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
