export type AssetKind = 'crypto' | 'fiat';
export type MarketStatus = 'loading' | 'live' | 'demo' | 'unavailable';
export type ChartRange = '5m' | '15m' | '1H' | '1D' | '1W' | '1M' | '3M' | '1Y';
export type Side = 'buy' | 'sell';

export interface AssetDef {
  id: string; // provider id (coingecko id, or fiat code lowercased)
  symbol: string;
  name: string;
  kind: AssetKind;
}

export interface Quote {
  symbol: string;
  name: string;
  kind: AssetKind;
  price: number; // USD value of 1 unit
  change24h: number | null; // percentage
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  updatedAt: number; // epoch ms
  isDemo: boolean;
}

export interface ChartPoint {
  t: number; // epoch ms
  p: number;
}

export interface Candle {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number; // traded volume (present when the source provides it)
}

export interface Holding {
  symbol: string;
  quantity: number;
  avg_price: number;
}

export interface Txn {
  id: string;
  created_at: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  total: number;
  status: 'completed' | 'failed';
  reason?: 'manual' | 'take_profit' | 'stop_loss';
}

/** A price alert watched by AlertsContext. */
export interface PriceAlert {
  id: string;
  symbol: string;
  target: number;
  direction: 'above' | 'below';
  status: 'active' | 'triggered';
  created_at: number;
  triggered_at?: number;
}

/** A Take-Profit / Stop-Loss order. Executed server-side by /api/orders. */
export interface TPOrder {
  id: string;
  symbol: string;
  kind: 'tp' | 'sl';
  trigger_price: number;
  quantity: number;
  status: 'active' | 'executed' | 'cancelled';
  created_at: string;
  executed_price?: number;
  executed_total?: number;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  theme: string;
  notif_trades: boolean;
  notif_market: boolean;
}

export interface ExecutedTxn {
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  total: number;
}

export interface TradeResult {
  ok: boolean;
  message: string;
  txn?: ExecutedTxn;
}

export type TradeAmountType = 'usd' | 'qty';
