import { useParams, Link, useNavigate } from 'react-router-dom';
import { Star, ArrowLeft } from 'lucide-react';
import { useMarket } from '../context/MarketContext';
import { usePortfolio } from '../context/PortfolioContext';
import { useAuth } from '../context/AuthContext';
import { findAsset } from '../lib/assets';
import { fmtCompact, fmtPrice, fmtTime } from '../lib/format';
import { Badge, Button, Card, EmptyState, Skeleton } from '../components/ui';
import { PriceChange } from '../components/market-bits';
import PriceChart from '../components/charts/PriceChart';
import type { ChartTrade } from '../components/charts/CandleChart';
import OrderBook from '../components/market/OrderBook';
import AlertsPanel from '../components/market/AlertsPanel';
import { binancePair } from '../lib/binanceStream';

export default function AssetPage() {
  const { symbol: symbolParam } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const rawSymbol = (symbolParam ?? '').toUpperCase();
  const assetDef = findAsset(rawSymbol);

  const { status, getQuote, loading: marketLoading } = useMarket();
  const { watchlist, addToWatchlist, removeFromWatchlist, transactions } = usePortfolio();
  const { user } = useAuth();

  const quote = getQuote(rawSymbol);
  const inWatchlist = watchlist.includes(rawSymbol);

  const chartTrades: ChartTrade[] = user
    ? transactions
        .filter((t) => t.symbol === rawSymbol && t.status === 'completed')
        .map((t) => ({ t: new Date(t.created_at).getTime(), price: t.price, side: t.side === 'buy' ? 'buy' : 'sell' }))
    : [];

  if (!assetDef) {
    return (
      <div className="space-y-6">
        <Link
          to="/app/markets"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-txt transition-colors"
        >
          <ArrowLeft size={16} /> Back to Markets
        </Link>
        <EmptyState
          title="Asset Not Found"
          message={`No asset matching "${symbolParam}" was found.`}
          action={
            <Link to="/app/markets">
              <Button variant="secondary">Browse Markets</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (status === 'loading' || (marketLoading && !quote)) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-12 w-48" />
        <Card className="p-6">
          <Skeleton className="h-[320px] w-full" />
        </Card>
      </div>
    );
  }

  const displayQuote = quote ?? {
    symbol: assetDef.symbol,
    name: assetDef.name,
    kind: assetDef.kind,
    price: 0,
    change24h: null,
    high24h: null,
    low24h: null,
    volume24h: null,
    marketCap: null,
    updatedAt: Date.now(),
    isDemo: false,
  };

  const handleWatchlistToggle = () => {
    if (inWatchlist) {
      removeFromWatchlist(rawSymbol);
    } else {
      addToWatchlist(rawSymbol);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/app/markets"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-txt transition-colors"
        >
          <ArrowLeft size={16} /> Back to Markets
        </Link>

        <div className="flex items-center gap-2">
          {displayQuote.kind === 'crypto' && <AlertsPanel symbol={rawSymbol} />}
          <Button
            variant="outline"
            size="sm"
            onClick={handleWatchlistToggle}
            className="gap-1.5"
          >
            <Star
              size={16}
              className={inWatchlist ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}
            />
            <span>{inWatchlist ? 'Watchlisted' : 'Add to Watchlist'}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{displayQuote.name}</h1>
            <span className="font-mono text-lg text-muted font-semibold">
              {displayQuote.symbol}
            </span>
            <Badge tone="neutral" className="uppercase">
              {displayQuote.kind}
            </Badge>
            {displayQuote.isDemo && (
              <Badge tone="accent">DEMO DATA</Badge>
            )}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-extrabold text-txt">
              {fmtPrice(displayQuote.price)}
            </span>
            <PriceChange value={displayQuote.change24h} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="up"
            size="lg"
            className="flex-1 sm:flex-none min-w-[120px]"
            onClick={() => navigate(`/app/trade?symbol=${displayQuote.symbol}`)}
          >
            Buy
          </Button>
          <Button
            variant="down"
            size="lg"
            className="flex-1 sm:flex-none min-w-[120px]"
            onClick={() => navigate(`/app/trade?symbol=${displayQuote.symbol}&side=sell`)}
          >
            Sell
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Card className="p-4 sm:p-6">
          <PriceChart symbol={displayQuote.symbol} kind={displayQuote.kind} trades={chartTrades} />
        </Card>
        {displayQuote.kind === 'crypto' && binancePair(rawSymbol) && (
          <Card className="hidden overflow-hidden lg:block">
            <OrderBook symbol={rawSymbol} height={460} />
          </Card>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase text-muted tracking-wider mb-3">
          Key Statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted font-medium mb-1">24h High</p>
            <p className="font-mono font-semibold text-sm text-txt">
              {displayQuote.high24h != null ? fmtPrice(displayQuote.high24h) : '—'}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted font-medium mb-1">24h Low</p>
            <p className="font-mono font-semibold text-sm text-txt">
              {displayQuote.low24h != null ? fmtPrice(displayQuote.low24h) : '—'}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted font-medium mb-1">24h Volume</p>
            <p className="font-mono font-semibold text-sm text-txt">
              {displayQuote.volume24h != null ? fmtCompact(displayQuote.volume24h) : '—'}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted font-medium mb-1">Market Cap</p>
            <p className="font-mono font-semibold text-sm text-txt">
              {displayQuote.marketCap != null ? fmtCompact(displayQuote.marketCap) : '—'}
            </p>
          </Card>
          <Card className="p-3 col-span-2 sm:col-span-1">
            <p className="text-xs text-muted font-medium mb-1">Last Updated</p>
            <p className="font-mono font-semibold text-sm text-txt">
              {displayQuote.updatedAt ? fmtTime(displayQuote.updatedAt) : '—'}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
