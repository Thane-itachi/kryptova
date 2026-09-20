import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle } from '../../types';
import type { Viewport } from './CandleChart';
import { macd as macdCalc, rsi as rsiCalc } from '../../lib/indicators';

const FONT = '10px "JetBrains Mono", monospace';
const MUTED = 'rgb(125 137 148)';

const PAD = { top: 16, right: 60, bottom: 14, left: 8 };

type Kind = 'rsi' | 'macd';

interface Props {
  candles: Candle[];
  viewport: Viewport;
  kind: Kind;
  height?: number;
}

/**
 * RSI / MACD sub-pane rendered directly under the main candle chart.
 * Shares the parent's viewport so the visible window stays in sync with
 * zoom/pan on the price chart. Non-interactive: hover data comes from the
 * main chart's crosshair.
 */
export default function IndicatorPane({ candles, viewport, kind, height = 78 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = candles.length;
  const visN = viewport.vis === null ? total : Math.min(Math.max(viewport.vis, 8), total);
  const endN = viewport.end === null ? total - 1 : Math.min(viewport.end, total - 1);
  const startN = Math.max(0, endN - visN + 1);
  const n = endN - startN + 1;

  const geo = useMemo(() => {
    const closes = candles.map((c) => c.c);
    if (kind === 'rsi') {
      const values = rsiCalc(closes, 14);
      return { values, slice: values.slice(startN, endN + 1), min: 0, max: 100 };
    }
    const { macd, signal, histogram } = macdCalc(closes, 12, 26, 9);
    const sliceMacd = macd.slice(startN, endN + 1);
    const sliceSignal = signal.slice(startN, endN + 1);
    const sliceHist = histogram.slice(startN, endN + 1);
    let m = 0;
    for (const arr of [sliceMacd, sliceSignal, sliceHist]) {
      for (const v of arr) if (v != null) m = Math.max(m, Math.abs(v));
    }
    if (m === 0) m = 1;
    return { values: macd, slice: sliceMacd, sliceSignal, sliceHist, min: -m, max: m };
  }, [candles, kind, startN, endN]);

  if (n < 2 || total === 0 || width <= PAD.left + PAD.right + 40) {
    return <div ref={wrapRef} style={{ height }} className="w-full" />;
  }

  const plotW = width - PAD.left - PAD.right;
  const plotTop = PAD.top;
  const plotBot = height - PAD.bottom;
  const y = (v: number) => plotTop + (1 - (v - geo.min) / (geo.max - geo.min)) * (plotBot - plotTop);
  const x = (i: number) => PAD.left + (plotW * (i + 0.5)) / n;

  const linePath = (vals: (number | null)[]) => {
    let d = '';
    let open = false;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null) {
        open = false;
        continue;
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      open = true;
    }
    return d;
  };

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      <svg width={width} height={height} className="block">
        {/* pane label */}
        <text x={2} y={10} fill={MUTED} fontFamily={FONT} fontSize={9}>
          {kind === 'rsi' ? 'RSI 14' : 'MACD 12·26·9'}
        </text>

        {kind === 'rsi' ? (
          <>
            {[30, 50, 70].map((lvl) => (
              <g key={lvl}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(lvl)}
                  y2={y(lvl)}
                  stroke={lvl === 50 ? 'rgb(var(--line))' : MUTED}
                  strokeOpacity={lvl === 50 ? 0.5 : 0.35}
                  strokeDasharray={lvl === 50 ? undefined : '3 3'}
                />
                <text x={PAD.left + plotW + 6} y={y(lvl) + 3} fill={MUTED} fontFamily={FONT} fontSize={8}>
                  {lvl}
                </text>
              </g>
            ))}
            <path d={linePath(geo.slice)} fill="none" stroke="#a855f7" strokeWidth={1.2} />
          </>
        ) : (
          <>
            {/* zero line */}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} stroke="rgb(var(--line))" strokeOpacity={0.5} />
            {/* histogram */}
            {(geo as { sliceHist?: (number | null)[] }).sliceHist!.map((v, i) => {
              if (v == null) return null;
              const up = v >= 0;
              const y0 = y(0);
              const y1 = y(v);
              const barW = Math.max(1, Math.min(plotW / n / 2, 10));
              return (
                <rect
                  key={i}
                  x={x(i) - barW / 2}
                  y={Math.min(y0, y1)}
                  width={barW}
                  height={Math.max(0.5, Math.abs(y1 - y0))}
                  fill={up ? '#10b981' : '#f43f5e'}
                  opacity={0.5}
                />
              );
            })}
            <path d={linePath(geo.slice)} fill="none" stroke="#3b82f6" strokeWidth={1.2} />
            <path d={linePath((geo as { sliceSignal?: (number | null)[] }).sliceSignal!)} fill="none" stroke="#f59e0b" strokeWidth={1.2} />
          </>
        )}
      </svg>
    </div>
  );
}
