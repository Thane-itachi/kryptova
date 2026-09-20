import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMarket } from '../context/MarketContext';
import { usePortfolio } from '../context/PortfolioContext';
import { fmtPct, fmtPrice, fmtQty, fmtSignedUSD, fmtTime, fmtUSD } from '../lib/format';
import { Button } from '../components/ui';
import { PriceChange } from '../components/market-bits';
import PriceChart from '../components/charts/PriceChart';
import LiveActivity from '../components/market/LiveActivity';

function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Hairline-divided stat — the card-free replacement for the old stat cards. */
function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'up' | 'down';
}) {
  const toneCls = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-txt';
  return (
    <div className="px-6 first:pl-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold font-mono leading-none ${toneCls}`}>{value}</p>
      {sub && (
        <p
          className={`mt-1.5 text-xs font-mono ${
            tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-muted'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { list, getQuote } = useMarket();
  const {
    cash,
    portfolioValue,
    todayPL,
    totalPL,
    totalPLPercent,
    watchlist,
    transactions,
  } = usePortfolio();

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

  // Top gainers: top 4 crypto assets by change24h desc
  const topGainers = useMemo(() => {
    return list
      .filter((q) => q.kind === 'crypto' && q.change24h !== null)
      .sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity))
      .slice(0, 4);
  }, [list]);

  // Top losers: bottom 4 crypto assets by change24h asc
  const topLosers = useMemo(() => {
    return list
      .filter((q) => q.kind === 'crypto' && q.change24h !== null)
      .sort((a, b) => (a.change24h ?? Infinity) - (b.change24h ?? Infinity))
      .slice(0, 4);
  }, [list]);

  // Watchlist preview: first 5 items
  const watchlistPreview = useMemo(() => {
    return watchlist.slice(0, 5).map((symbol) => ({
      symbol,
      quote: getQuote(symbol),
    }));
  }, [watchlist, getQuote]);

  // Recent transactions: last 5 transactions
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-10">
      {/* ── Greeting header ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{dateLine}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-txt">
            {greeting}, <span className="text-primary-400">{greetingName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Here is your paper trading overview.
            <span className="ml-2 inline-flex items-center gap-1.5 align-middle text-[11px] font-semibold uppercase tracking-widest text-primary-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-400" />
              Demo mode
            </span>
          </p>
        </div>
        <Link to="/app/markets">
          <Button variant="primary" size="md">
            Trade Markets
          </Button>
        </Link>
      </header>

      {/* ── Equity band — hero value + hairline-divided key stats ───── */}
      <section className="border-b border-line pb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Total portfolio value
            </p>
            <p className="mt-3 text-5xl font-bold font-mono tracking-tight text-txt">
              {fmtUSD(portfolioValue)}
            </p>
          </div>
          <div className="flex items-baseline gap-2 text-right">
            <p className={`text-lg font-semibold font-mono ${totalPL >= 0 ? 'text-up' : 'text-down'}`}>
              {fmtSignedUSD(totalPL)}
            </p>
            <p className={`text-sm font-mono ${totalPL >= 0 ? 'text-up' : 'text-down'}`}>
              ({fmtPct(totalPLPercent)})
            </p>
            <p className="text-[11px] uppercase tracking-widest text-muted">all-time</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          <Stat label="Demo cash available" value={fmtUSD(cash)} />
          <Stat
            label="24h P/L"
            value={fmtSignedUSD(todayPL)}
            tone={todayPL >= 0 ? 'up' : 'down'}
          />
          <Stat
            label="Watchlist"
            value={String(watchlist.length)}
            sub={watchlist.length === 1 ? 'asset' : 'assets'}
          />
        </div>
      </section>

      {/* ── Benchmark chart + live activity feed ─────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between border-b border-line pb-3">
            <div className="flex items-baseline gap-3">
              <h2 className="font-mono text-sm font-bold tracking-tight text-txt">BTC / USD</h2>
              <p className="text-xs text-muted">Benchmark · live candlestick</p>
            </div>
            <Link
              to="/app/asset/BTC"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-400 transition-colors hover:text-primary-300"
            >
              View asset <ArrowRight size={12} />
            </Link>
          </div>
          <div className="pt-6">
            <PriceChart symbol="BTC" kind="crypto" height={280} showRanges={true} />
          </div>
        </div>

        <div className="lg:col-span-1">
          <LiveActivity />
        </div>
      </section>

      {/* ── Market movers + watchlist — columns split by hairlines ─── */}
      <section className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-line">
        {/* Top gainers */}
        <div className="pb-8 md:pb-0 md:pr-8">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <TrendingUp size={14} className="text-up" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt">
              Top gainers
            </h3>
            <span className="ml-auto text-[11px] text-muted">24h</span>
          </div>
          <div className="divide-y divide-line/60">
            {topGainers.map((quote) => (
              <Link
                key={quote.symbol}
                to={`/app/asset/${quote.symbol}`}
                className="group -mx-2 flex items-center justify-between px-2 py-3 transition-colors hover:bg-panel/60"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold font-mono text-txt">{quote.symbol}</p>
                  <p className="text-[11px] text-muted truncate">{quote.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-semibold text-txt">{fmtPrice(quote.price)}</p>
                  <PriceChange value={quote.change24h} />
                </div>
              </Link>
            ))}
            {topGainers.length === 0 && (
              <p className="py-4 text-xs text-muted">No gainers data available.</p>
            )}
          </div>
        </div>

        {/* Top losers */}
        <div className="py-8 md:py-0 md:px-8">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <TrendingDown size={14} className="text-down" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt">
              Top losers
            </h3>
            <span className="ml-auto text-[11px] text-muted">24h</span>
          </div>
          <div className="divide-y divide-line/60">
            {topLosers.map((quote) => (
              <Link
                key={quote.symbol}
                to={`/app/asset/${quote.symbol}`}
                className="group -mx-2 flex items-center justify-between px-2 py-3 transition-colors hover:bg-panel/60"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold font-mono text-txt">{quote.symbol}</p>
                  <p className="text-[11px] text-muted truncate">{quote.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-semibold text-txt">{fmtPrice(quote.price)}</p>
                  <PriceChange value={quote.change24h} />
                </div>
              </Link>
            ))}
            {topLosers.length === 0 && (
              <p className="py-4 text-xs text-muted">No losers data available.</p>
            )}
          </div>
        </div>

        {/* Watchlist */}
        <div className="pt-8 md:pt-0 md:pl-8">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <Bookmark size={14} className="text-primary-400" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-txt">
              Watchlist
            </h3>
            {watchlist.length > 0 && (
              <Link
                to="/app/watchlist"
                className="ml-auto text-[11px] font-semibold text-primary-400 transition-colors hover:text-primary-300"
              >
                View all
              </Link>
            )}
          </div>

          {watchlistPreview.length === 0 ? (
            <div className="py-8">
              <p className="text-xs text-muted">No assets watched yet.</p>
              <Link to="/app/markets" className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  Explore Markets
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line/60">
              {watchlistPreview.map(({ symbol, quote }) => (
                <Link
                  key={symbol}
                  to={`/app/asset/${symbol}`}
                  className="group -mx-2 flex items-center justify-between px-2 py-3 transition-colors hover:bg-panel/60"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold font-mono text-txt">{symbol}</p>
                    <p className="text-[11px] text-muted truncate">{quote?.name || symbol}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-xs font-semibold text-txt">
                      {quote ? fmtPrice(quote.price) : '—'}
                    </p>
                    {quote && <PriceChange value={quote.change24h} />}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Recent transactions — ledger style ──────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="text-sm font-bold tracking-tight text-txt">Recent transactions</h2>
          {transactions.length > 0 && (
            <Link
              to="/app/transactions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-400 transition-colors hover:text-primary-300"
            >
              View all <ArrowRight size={12} />
            </Link>
          )}
        </div>

        {recentTransactions.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 py-6">
            <p className="text-sm text-muted">
              No transactions yet — your completed demo trades will appear here.
            </p>
            <Link to="/app/markets">
              <Button variant="primary" size="sm">
                Start Trading
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-line/60">
            {recentTransactions.map((txn) => (
              <div
                key={txn.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4 sm:grid-cols-[auto_1fr_auto_auto]"
              >
                <p
                  className={`w-12 text-[11px] font-bold uppercase tracking-[0.14em] font-mono ${
                    txn.side === 'buy' ? 'text-up' : 'text-down'
                  }`}
                >
                  {txn.side}
                </p>
                <div className="min-w-0">
                  <p className="text-sm font-semibold font-mono text-txt">{txn.symbol}</p>
                  <p className="text-[11px] text-muted font-mono">
                    {fmtQty(txn.quantity)} @ {fmtPrice(txn.price)}
                  </p>
                </div>
                <p className="hidden text-[11px] text-muted font-mono sm:block">
                  {fmtTime(txn.created_at)}
                </p>
                <p className="text-right text-sm font-semibold font-mono text-txt">
                  {fmtUSD(txn.total)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
