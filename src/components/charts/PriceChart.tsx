import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, Minimize2 } from 'lucide-react';
import CandleChart from './CandleChart';
import IndicatorPane from './IndicatorPane';
import KagiChart from './KagiChart';
import type { ChartTrade, Drawing, DrawTool, Viewport } from './CandleChart';
import { Loader2 } from 'lucide-react';
import { useMarket } from '../../context/MarketContext';
import type { Candle, ChartPoint, ChartRange } from '../../types';
import { useCandleStream } from '../../hooks/useCandleStream';
import type { KlineTick } from '../../lib/binanceStream';
import { Badge } from '../ui';
import { bollinger, ema, sma } from '../../lib/indicators';

const RANGES: ChartRange[] = ['5m', '15m', '1H', '1D', '1W', '1M', '3M', '1Y'];

// Which Binance kline interval matches each range's candle size.
const STREAM_INTERVALS: Partial<Record<ChartRange, string>> = {
  '5m': '5m',
  '15m': '15m',
  '1H': '1h',
  '1D': '30m',
  '1W': '4h',
};

const MA20_COLOR = '#3b82f6';
const MA50_COLOR = '#f59e0b';
const EMA20_COLOR = '#a855f7';
const BB_COLOR = '#38bdf8';

type Indicator = 'ma' | 'ema' | 'bb' | 'rsi' | 'macd';

const INDICATOR_CHIPS: { id: Indicator; label: string; color: string }[] = [
  { id: 'ma', label: 'MA', color: MA20_COLOR },
  { id: 'ema', label: 'EMA', color: EMA20_COLOR },
  { id: 'bb', label: 'BB', color: BB_COLOR },
  { id: 'rsi', label: 'RSI', color: '#a855f7' },
  { id: 'macd', label: 'MACD', color: '#3b82f6' },
];

function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}

function loadDrawings(symbol: string): Drawing[] {
  try {
    const raw = localStorage.getItem(`kryptova:drawings:${symbol}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (d): d is Drawing =>
        d && typeof d.id === 'string' && typeof d.y1 === 'number' && (d.type === 'hline' || d.type === 'trend'),
    );
  } catch {
    return [];
  }
}

interface Props {
  symbol: string;
  kind: 'crypto' | 'fiat';
  height?: number;
  showRanges?: boolean;
  /** The user's own trades for this symbol — drawn as markers on the candle chart. */
  trades?: ChartTrade[];
}

export default function PriceChart({ symbol, kind, height = 320, showRanges = true, trades = [] }: Props) {
  const { series, getQuote } = useMarket();
  const [range, setRange] = useState<ChartRange>('1D');
  const [mode, setMode] = useState<'candle' | 'line' | 'kagi'>('candle');
  const [kagiRev, setKagiRev] = useState(1); // Kagi reversal threshold (%)
  const [points, setPoints] = useState<ChartPoint[] | null>(null);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  // shared chart viewport (owned here so panes stay synced)
  const [viewport, setViewport] = useState<Viewport>({ vis: null, end: null });

  // indicator toggles
  const [indicators, setIndicators] = useState<Record<Indicator, boolean>>({
    ma: false,
    ema: false,
    bb: false,
    rsi: false,
    macd: false,
  });

  // drawings (trendlines / levels) persisted per symbol in localStorage
  const [drawings, setDrawings] = useState<Drawing[]>(() => loadDrawings(symbol));
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);

  // fullscreen analysis mode
  const [fullscreen, setFullscreen] = useState(false);

  const runId = useRef(0);
  const candlesRef = useRef<Candle[] | null>(null);
  const closeAtRef = useRef(0);

  useEffect(() => {
    setDrawings(loadDrawings(symbol));
    setDrawTool(null);
  }, [symbol]);

  useEffect(() => {
    try {
      localStorage.setItem(`kryptova:drawings:${symbol}`, JSON.stringify(drawings));
    } catch {
      /* storage full or unavailable — drawings just won't persist */
    }
  }, [drawings, symbol]);

  // Reset the shared viewport whenever the dataset changes shape.
  useEffect(() => {
    setViewport({ vis: null, end: null });
  }, [symbol, range]);

  // Escape closes fullscreen / cancels the active draw tool.
  useEffect(() => {
    if (!fullscreen && !drawTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
        setDrawTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, drawTool]);

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(false);
    closeAtRef.current = 0;
    series(symbol, kind, range)
      .then((res) => {
        if (runId.current !== id) return;
        setPoints(res.points);
        setCandles(res.candles ?? null);
        setIsDemo(res.isDemo);
        setLoading(false);
      })
      .catch(() => {
        if (runId.current !== id) return;
        setError(true);
        setLoading(false);
      });
  }, [symbol, kind, range, series]);

  candlesRef.current = candles;

  const streamInterval = kind === 'crypto' && showRanges ? STREAM_INTERVALS[range] : undefined;
  const streamOn = (mode === 'candle' || mode === 'kagi') && streamInterval !== undefined;

  // Merge a live kline tick into the candle set: reshape the active candle,
  // or append the freshly opened one when the interval rolls over.
  const handleTick = (k: KlineTick) => {
    closeAtRef.current = k.closeTime;
    const base = candlesRef.current;
    if (!base || base.length === 0) return;
    const last = base[base.length - 1];
    let next: Candle[];
    if (k.t === last.t) {
      next = base
        .slice(0, -1)
        .concat({ ...last, h: Math.max(last.h, k.h), l: Math.min(last.l, k.l), c: k.c });
    } else if (k.t > last.t) {
      next = base.concat({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c }).slice(-400);
    } else {
      return; // tick older than our newest candle — ignore
    }
    candlesRef.current = next;
    setCandles(next);
  };

  const { connected, source } = useCandleStream(
    streamOn ? symbol : null,
    streamOn ? streamInterval ?? null : null,
    handleTick,
    // last-resort tier: real price from the /api/quotes market refresh if
    // Binance WS *and* REST are both unreachable or rate-limited
    { getPrice: () => getQuote(symbol)?.price ?? null },
  );

  // Countdown ticks once per second toward the active candle's close time.
  useEffect(() => {
    if (!streamOn) return;
    const upd = () => setCountdown(closeAtRef.current > 0 ? Math.max(0, closeAtRef.current - Date.now()) : null);
    upd();
    const timer = setInterval(upd, 1000);
    return () => clearInterval(timer);
  }, [streamOn, symbol, range]);

  const changeSrc = candles && candles.length > 1 ? candles.map((c) => ({ p: c.c })) : points;
  const positive = changeSrc && changeSrc.length > 1 ? changeSrc[changeSrc.length - 1].p >= changeSrc[0].p : true;
  const color = positive ? 'rgb(16 185 129)' : 'rgb(244 63 94)';

  const change = changeSrc && changeSrc.length > 1 ? ((changeSrc[changeSrc.length - 1].p - changeSrc[0].p) / changeSrc[0].p) * 100 : null;

  // Indicator overlays computed from the full candle set (aligned index-for-index)
  const overlays = useMemo(() => {
    if (!candles || mode !== 'candle' || candles.length === 0) return [];
    const closes = candles.map((c) => c.c);
    const out: Parameters<typeof CandleChart>[0]['overlays'] = [];
    if (indicators.ma) {
      const ma20 = sma(closes, 20);
      const ma50 = sma(closes, 50);
      out.push({ label: 'MA 20', color: MA20_COLOR, values: ma20, width: 1.3 });
      out.push({ label: 'MA 50', color: MA50_COLOR, values: ma50, width: 1.3 });
    }
    if (indicators.ema) {
      out.push({ label: 'EMA 20', color: EMA20_COLOR, values: ema(closes, 20), width: 1.3 });
    }
    if (indicators.bb) {
      const bb = bollinger(closes, 20, 2);
      out.push({ label: 'BB 20·2 upper', color: BB_COLOR, values: bb.upper, width: 1.1, dashed: false, fillTo: bb.lower });
      out.push({ label: 'Basis', color: BB_COLOR, values: bb.basis, width: 1, dashed: true });
    }
    return out;
  }, [candles, mode, indicators.ma, indicators.ema, indicators.bb]);

  const paneH = 82;
  const baseMainH = height - 24;
  const panesH = (indicators.rsi ? paneH : 0) + (indicators.macd ? paneH : 0);
  // In fullscreen the main pane grows to fill the viewport; inline it fits `height`.
  const mainH = fullscreen
    ? Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 800) - 280 - panesH)
    : Math.max(200, baseMainH - panesH);

  const toggleIndicator = (id: Indicator) =>
    setIndicators((prev) => ({ ...prev, [id]: !prev[id] }));

  const chartBlock = (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary-500" />
        </div>
      )}
      {!loading && error && (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-sm text-muted">
          <p>Unable to load chart data.</p>
          <button onClick={() => setRange((r) => r)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-panel">
            Try again
          </button>
        </div>
      )}
      {!loading && !error && mode === 'candle' && candles && candles.length > 0 && (
        <>
          <CandleChart
            key={symbol}
            candles={candles}
            height={mainH}
            range={range}
            viewport={viewport}
            onViewportChange={setViewport}
            overlays={overlays}
            trades={trades}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            drawTool={drawTool}
            onDrawToolChange={setDrawTool}
          />
          {indicators.rsi && <IndicatorPane candles={candles} viewport={viewport} kind="rsi" height={paneH} />}
          {indicators.macd && <IndicatorPane candles={candles} viewport={viewport} kind="macd" height={paneH} />}
        </>
      )}
      {!loading && !error && mode === 'kagi' && candles && candles.length > 0 && (
        <KagiChart key={`${symbol}-${kagiRev}`} candles={candles} height={baseMainH} reversalPct={kagiRev} />
      )}
      {!loading && !error && points && (mode === 'line' || !candles || candles.length === 0) && (
        <ResponsiveContainer width="100%" height={baseMainH} className="[mask-image:linear-gradient(to_right,transparent,black_24px,black)]">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tick={{ fontSize: 10, fill: 'rgb(125 137 148)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(t: number) =>
                range === '5m' || range === '15m' || range === '1H' || range === '1D'
                  ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
            />
            <YAxis
              domain={['auto', 'auto']}
              width={56}
              tick={{ fontSize: 10, fill: 'rgb(125 137 148)', fontFamily: 'JetBrains Mono, monospace' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v >= 1 ? v.toFixed(2) : v.toPrecision(3))}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload && payload.length ? (
                  <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg">
                    <p className="text-muted">{new Date(payload[0].payload.t).toLocaleString('en-US')}</p>
                    <p className="font-mono font-bold">
                      ${Number(payload[0].payload.p).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                    </p>
                  </div>
                ) : null
              }
            />
            <Area type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill={`url(#grad-${symbol})`} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  const toolbar = (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">{symbol}/USD</span>
        {change !== null && (
          <span className={`font-mono text-xs font-bold ${positive ? 'text-up' : 'text-down'}`}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}% <span className="text-muted">({range})</span>
          </span>
        )}
        {isDemo && <Badge tone="accent">DEMO CHART DATA</Badge>}
        {streamOn && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
              connected
                ? 'bg-emerald-500/10 text-emerald-500'
                : source === 'rest' || source === 'price'
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-panel text-muted'
            }`}
            title={
              connected
                ? 'Binance live stream — time until the current candle closes'
                : source === 'rest'
                  ? 'Binance stream unavailable — polling REST klines every ~10s'
                  : source === 'price'
                    ? 'Binance unavailable — updating from market refresh'
                    : 'Live stream unavailable — using market refresh'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? 'animate-pulse bg-emerald-500' : source === 'rest' || source === 'price' ? 'bg-amber-500' : 'bg-muted-foreground/40'
              }`}
            />
            {connected
              ? countdown !== null
                ? `${fmtCountdown(countdown)} to close`
                : 'connecting…'
              : source === 'rest'
                ? 'rest polling'
                : source === 'price'
                  ? 'market refresh'
                  : 'stream off'}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showRanges && (
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  range === r ? 'bg-primary-600 text-white' : 'text-muted hover:bg-panel hover:text-txt'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1" title="Chart type">
          {(['candle', 'kagi', 'line'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                mode === m ? 'bg-primary-600 text-white' : 'text-muted hover:bg-panel hover:text-txt'
              }`}
            >
              {m === 'candle' ? 'Candles' : m === 'kagi' ? 'Kagi' : 'Line'}
            </button>
          ))}
        </div>
        {mode === 'candle' && (
          <div className="flex gap-1" title="Indicators">
            {INDICATOR_CHIPS.map((chip) => (
              <button
                key={chip.id}
                onClick={() => toggleIndicator(chip.id)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  indicators[chip.id]
                    ? 'border-transparent bg-panel text-txt'
                    : 'border-line text-muted hover:bg-panel hover:text-txt'
                }`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: indicators[chip.id] ? chip.color : 'currentColor', opacity: indicators[chip.id] ? 1 : 0.5 }}
                />
                {chip.label}
              </button>
            ))}
          </div>
        )}
        {mode === 'kagi' && (
          <div className="flex items-center gap-2" title="Kagi reversal sensitivity — how far price must move against the trend before the line turns. Lower = more turns (more sensitive), higher = only major moves.">
            <span className="text-[10px] font-semibold text-muted">Sensitivity</span>
            <input
              type="range"
              min={0.25}
              max={5}
              step={0.25}
              value={kagiRev}
              onChange={(e) => setKagiRev(Number(e.target.value))}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-line accent-emerald-400"
            />
            <span className="w-9 font-mono text-[10px] font-semibold text-muted">{kagiRev}%</span>
          </div>
        )}
        <button
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen analysis mode'}
          className="rounded-md border border-line p-1.5 text-muted transition-colors hover:bg-panel hover:text-txt"
        >
          {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </div>
  );

  const caption = (
    <p className="mt-1 text-[10px] text-muted">
      {isDemo
        ? 'Simulated chart data — not real market history.'
        : streamOn && connected
          ? 'Live Binance stream · active candle updates tick-by-tick'
          : streamOn && source === 'rest'
            ? 'Binance REST polling fallback · active candle updates every ~10s'
            : streamOn && source === 'price'
              ? 'Market refresh fallback · active candle tracks the live quote price'
              : 'Live market history · updates every refresh'}
      {mode === 'candle' && drawTool && ' · drawing tool active — click on the chart, Esc to exit'}
    </p>
  );

  // Fullscreen: same components at a larger scale in a fixed overlay.
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[60] bg-background/95 p-3 backdrop-blur-sm sm:p-6">
        <div className="mx-auto flex h-full max-w-7xl flex-col">
          {toolbar}
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface p-2">
            <div className="relative">
              {chartBlock}
            </div>
          </div>
          {caption}
        </div>
        <button
          onClick={() => setFullscreen(false)}
          className="absolute right-3 top-3 rounded-md border border-line bg-surface p-1.5 text-muted transition-colors hover:bg-panel hover:text-txt"
          title="Close (Esc)"
        >
          <Minimize2 size={14} />
        </button>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div style={{ height: height - 24 }}>{chartBlock}</div>
      {caption}
    </div>
  );
}
