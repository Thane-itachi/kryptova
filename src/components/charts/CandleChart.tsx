import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Minus, PenLine, Trash2 } from 'lucide-react';
import type { Candle, ChartRange } from '../../types';
import { fmtPrice } from '../../lib/format';

const UP = '#10b981';
const DOWN = '#f43f5e';
const MUTED = 'rgb(125 137 148)';
const FONT = '10px "JetBrains Mono", monospace';
const DRAW_COLOR = '#f5b942'; // amber for user drawings — visible on any candle

const MIN_VIS = 8; // smallest zoomed-in window (candles)

/** A line series drawn over the candles (MA/EMA/Bollinger), aligned to `candles`. */
export interface OverlayLine {
  label: string;
  color: string;
  values: (number | null)[];
  width?: number;
  dashed?: boolean;
  fillTo?: (number | null)[]; // second series filled between (Bollinger lower)
}

/** A user trade to mark on the chart. */
export interface ChartTrade {
  t: number; // epoch ms
  price: number;
  side: 'buy' | 'sell';
}

/** A user drawing, stored in data space (time + price) so it pans/zooms with the chart. */
export interface Drawing {
  id: string;
  type: 'trend' | 'hline';
  x1t?: number;
  y1: number;
  x2t?: number;
  y2?: number;
}

export type DrawTool = 'trend' | 'hline' | 'erase';

export interface Viewport {
  vis: number | null; // candles visible (null = all)
  end: number | null; // index of last visible candle (null = live edge)
}

interface Props {
  candles: Candle[];
  height: number;
  range: ChartRange;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  overlays?: OverlayLine[];
  trades?: ChartTrade[];
  drawings?: Drawing[];
  onDrawingsChange?: (ds: Drawing[]) => void;
  drawTool?: DrawTool | null;
  onDrawToolChange?: (t: DrawTool | null) => void;
}

function fmtTick(t: number, range: ChartRange): string {
  const d = new Date(t);
  return range === '5m' || range === '15m' || range === '1H' || range === '1D'
    ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// Compact volume for the tooltip (1.2K, 3.4M, 890B ...)
const fmtVol = (v: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

/**
 * Hand-rolled SVG candlestick chart: true OHLC candles, crosshair + tooltip,
 * responsive via ResizeObserver. Zoomable + pannable — mouse wheel or pinch
 * zooms around the cursor, drag pans through history, buttons in the corner.
 * The viewport stays pinned to the newest candle while zoomed at the live edge.
 *
 * The viewport is owned by the parent (PriceChart) so the RSI/MACD sub-panes
 * can share it. Also renders indicator overlays, the user's trade markers and
 * interactive drawings (trendlines / horizontal levels).
 */
export default function CandleChart({
  candles,
  height,
  range,
  viewport,
  onViewportChange,
  overlays = [],
  trades = [],
  drawings = [],
  onDrawingsChange,
  drawTool = null,
  onDrawToolChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<{ x1t: number; y1: number } | null>(null); // half-placed trendline
  const [preview, setPreview] = useState<{ x2t: number; y2: number } | null>(null);

  // Viewport (controlled by parent)
  const { vis, end } = viewport;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PAD = { top: 10, right: 60, bottom: 20, left: 8 };
  const total = candles.length;
  const visN = vis === null ? total : clamp(vis, MIN_VIS, total);
  const endN = end === null ? total - 1 : clamp(end, visN - 1, total - 1);
  const startN = Math.max(0, endN - visN + 1);
  const view = useMemo(() => candles.slice(startN, endN + 1), [candles, startN, endN]);

  const geo = useMemo(() => {
    if (!view.length || width <= PAD.left + PAD.right + 40) return null;
    const lows = view.map((c) => c.l);
    const highs = view.map((c) => c.h);
    let lo = Math.min(...lows);
    let hi = Math.max(...highs);
    const span = hi - lo || Math.abs(hi) * 0.01 || 1;
    const pad = span * 0.08;
    lo -= pad;
    hi += pad;
    const plotW = width - PAD.left - PAD.right;
    const fullH = height - PAD.top - PAD.bottom;
    const hasVol = view.some((c) => typeof c.v === 'number' && c.v > 0);
    const volH = hasVol ? fullH * 0.16 : 0;
    const plotH = fullH - (hasVol ? volH + 6 : 0);
    const maxV = hasVol ? Math.max(...view.map((c) => c.v ?? 0)) : 0;
    const slot = plotW / view.length;
    const bodyW = Math.max(1.2, Math.min(slot * 0.55, 14)); // compact candles, thinner when dense
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
    const priceAt = (py: number) => lo + (1 - (py - PAD.top) / plotH) * (hi - lo);
    const x = (i: number) => PAD.left + slot * i + slot / 2;
    return { lo, hi, plotW, plotH, fullH, hasVol, volH, maxV, slot, bodyW, y, priceAt, x };
  }, [view, width, height]);

  // Mirror of the current viewport for native (non-React) event handlers.
  const viewRef = useRef({ total, visN, start: startN, slot: geo?.slot ?? 0, plotW: geo?.plotW ?? 0 });
  viewRef.current = { total, visN, start: startN, slot: geo?.slot ?? 0, plotW: geo?.plotW ?? 0 };

  /** Time → fractional candle index (interpolated between candle opens). */
  const timeToIdx = (t: number): number => {
    if (total === 0) return 0;
    if (t <= candles[0].t) return 0;
    if (t >= candles[total - 1].t) return total - 1;
    let lo = 0;
    let hi = total - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const span = candles[hi].t - candles[lo].t || 1;
    return lo + (t - candles[lo].t) / span;
  };
  const idxToX = (gi: number) => PAD.left + geo!.slot * (gi - startN) + geo!.slot / 2;

  /** Scale the visible window by `scale` (<1 zooms in), anchored at px. */
  const zoomAt = (px: number, scale: number) => {
    const v = viewRef.current;
    if (!v.total || !v.plotW) return;
    const nextVis = clamp(Math.round(v.visN * scale), Math.min(MIN_VIS, v.total), v.total);
    if (nextVis === v.visN) return;
    const f = clamp((px - PAD.left) / v.plotW, 0, 1);
    const anchor = v.start + f * (v.visN - 1);
    let s = Math.round(anchor - f * (nextVis - 1));
    let e = s + nextVis - 1;
    if (e > v.total - 1) {
      e = v.total - 1;
      s = e - nextVis + 1;
    }
    if (s < 0) {
      s = 0;
      e = Math.min(nextVis - 1, v.total - 1);
    }
    onViewportChange({ vis: nextVis, end: e >= v.total - 1 ? null : e });
  };

  // Mouse wheel = zoom (native listener so we can preventDefault page scroll).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.deltaY > 0 ? 1.25 : 0.8);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- pointer interactions: hover, drag-pan, pinch-zoom, drawing ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; end: number } | null>(null);
  const pinchDist = useRef(0);
  const [grabbing, setGrabbing] = useState(false);

  const drawing = drawTool != null && !!onDrawingsChange;

  /** Place / complete a drawing at the given plot coordinates. */
  const placeDrawing = (px: number, py: number) => {
    if (!geo || !onDrawingsChange) return;
    const t = candles[startN + Math.floor((px - PAD.left) / geo.slot)]?.t;
    const price = geo.priceAt(py);
    if (t == null || !Number.isFinite(price)) return;
    if (drawTool === 'hline') {
      onDrawingsChange([
        ...drawings,
        { id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: 'hline', y1: price },
      ]);
      return;
    }
    if (drawTool === 'trend') {
      if (!pending) {
        setPending({ x1t: t, y1: price });
        setPreview(null);
      } else {
        onDrawingsChange([
          ...drawings,
          {
            id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'trend',
            x1t: pending.x1t,
            y1: pending.y1,
            x2t: t,
            y2: price,
          },
        ]);
        setPending(null);
        setPreview(null);
      }
    }
  };

  /** Erase the drawing nearest to (px, py) within a small radius. */
  const eraseAt = (px: number, py: number) => {
    if (!geo || !onDrawingsChange || drawings.length === 0) return;
    let best: { id: string; d: number } | null = null;
    for (const d of drawings) {
      let dist = Infinity;
      if (d.type === 'hline') {
        dist = Math.abs(geo.y(d.y1) - py);
      } else if (d.x1t != null && d.x2t != null && d.y2 != null) {
        const x1 = idxToX(timeToIdx(d.x1t));
        const y1 = geo.y(d.y1);
        const x2 = idxToX(timeToIdx(d.x2t));
        const y2 = geo.y(d.y2);
        // point-to-segment distance
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
        const tt = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2, 0, 1);
        dist = Math.hypot(px - (x1 + tt * (x2 - x1)), py - (y1 + tt * (y2 - y1)));
      }
      if (dist < 9 && (!best || dist < best.d)) best = { id: d.id, d: dist };
    }
    if (best) onDrawingsChange(drawings.filter((d) => d.id !== best!.id));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (drawTool === 'erase') eraseAt(px, py);
      else placeDrawing(px, py);
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, end: endN };
      setGrabbing(true);
    } else {
      drag.current = null;
      const pts = [...pointers.current.values()];
      pinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // trendline preview follows the cursor while a line is half-placed
    if (drawing && drawTool === 'trend' && pending && geo) {
      const rect = e.currentTarget.getBoundingClientRect();
      const t = candles[startN + Math.floor((e.clientX - rect.left - PAD.left) / geo.slot)]?.t;
      const price = geo.priceAt(e.clientY - rect.top);
      if (t != null && Number.isFinite(price)) setPreview({ x2t: t, y2: price });
      return;
    }

    const p = pointers.current.get(e.pointerId);
    if (p) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // pinch zoom (two fingers)
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0 && d > 0 && Math.abs(d - pinchDist.current) > 1) {
        const rect = e.currentTarget.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - rect.left, pinchDist.current / d);
      }
      pinchDist.current = d;
      setHover(null);
      return;
    }

    // drag pan
    if (drag.current && geo) {
      const shift = Math.round((drag.current.x - e.clientX) / geo.slot);
      const v = viewRef.current;
      const raw = drag.current.end + shift;
      const e2 = clamp(raw, Math.min(v.visN - 1, v.total - 1), v.total - 1);
      onViewportChange({ vis, end: e2 >= v.total - 1 ? null : e2 });
      setHover(null);
      return;
    }

    // hover crosshair
    if (!geo || !view.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - PAD.left) / geo.slot);
    setHover(i >= 0 && i < view.length ? i : null);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      drag.current = null;
      pinchDist.current = 0;
      setGrabbing(false);
    } else if (pointers.current.size === 1) {
      pinchDist.current = 0;
      const [remaining] = [...pointers.current.values()];
      drag.current = { x: remaining.x, end: endN };
    }
  };

  // Escape cancels a half-placed trendline.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        setPreview(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const grid = useMemo(() => {
    if (!geo) return [];
    const rows = 5;
    return Array.from({ length: rows + 1 }, (_, i) => {
      const v = geo.lo + ((geo.hi - geo.lo) * i) / rows;
      return { v, y: geo.y(v) };
    });
  }, [geo]);

  const xLabels = useMemo(() => {
    if (!geo || !view.length) return [];
    const count = Math.min(6, view.length);
    const step = Math.max(1, Math.floor((view.length - 1) / (count - 1 || 1)));
    const idxs: number[] = [];
    for (let i = 0; i < view.length && idxs.length < count; i += step) idxs.push(i);
    return idxs.map((i) => ({ i, label: fmtTick(view[i].t, range), x: geo.x(i) }));
  }, [geo, view, range]);

  /** Overlay paths within the visible window. */
  const overlayPaths = useMemo(() => {
    if (!geo) return [];
    return overlays
      .map((ov) => {
        const seg = ov.values.slice(startN, endN + 1);
        let d = '';
        let open = false;
        let lastVal: number | null = null;
        seg.forEach((v, i) => {
          if (v == null) {
            open = false;
            return;
          }
          lastVal = v;
          const cmd = open ? 'L' : 'M';
          d += `${cmd}${geo.x(i).toFixed(1)},${geo.y(v).toFixed(1)} `;
          open = true;
        });
        return { ov, d, lastVal };
      })
      .filter((o) => o.d.length > 0);
  }, [overlays, startN, endN, geo]);

  /** Bollinger band fill between upper and fillTo (lower). */
  const bandFill = useMemo(() => {
    const bb = overlays.find((o) => o.fillTo);
    if (!bb || !geo) return null;
    const upper = bb.values.slice(startN, endN + 1);
    const lower = bb.fillTo!.slice(startN, endN + 1);
    let d = '';
    let open = false;
    upper.forEach((v, i) => {
      if (v == null || lower[i] == null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${geo.x(i).toFixed(1)},${geo.y(v).toFixed(1)} `;
      open = true;
    });
    if (!d) return null;
    let dl = d;
    let seenAny = false;
    for (let i = upper.length - 1; i >= 0; i--) {
      if (upper[i] != null && lower[i] != null) {
        dl += `L${geo.x(i).toFixed(1)},${geo.y(lower[i]!).toFixed(1)} `;
        seenAny = true;
      } else if (seenAny) {
        break; // gap — stop the band here
      }
    }
    return { d: dl, color: bb.color };
  }, [overlays, startN, endN, geo]);

  /** Trade markers that fall inside the visible window. */
  const tradeMarkers = useMemo(() => {
    if (!geo || trades.length === 0) return [];
    const out: { x: number; y: number; side: 'buy' | 'sell'; price: number; t: number }[] = [];
    for (const tr of trades) {
      const gi = timeToIdx(tr.t);
      if (gi < startN - 0.5 || gi > endN + 0.5) continue;
      out.push({ x: idxToX(gi), y: geo.y(tr.price), side: tr.side, price: tr.price, t: tr.t });
    }
    return out;
  }, [trades, startN, endN, geo, total, candles]);

  const hovered = hover !== null && !drawing ? view[hover] : null;

  if (!geo) {
    return <div ref={wrapRef} style={{ height }} className="w-full" />;
  }

  const tooltipLeft = hovered
    ? Math.min(Math.max(geo.x(hover!) - 70, 4), Math.max(width - 152, 4))
    : 0;

  const zoomed = vis !== null || end !== null;

  const drawBtn = (tool: DrawTool, icon: React.ReactNode, title: string) => (
    <button
      title={title}
      className={`rounded-md border px-1.5 py-0.5 transition-colors ${
        drawTool === tool
          ? 'border-[#f5b942] bg-[#f5b942]/15 text-[#f5b942]'
          : 'border-line bg-surface text-muted hover:bg-panel hover:text-txt'
      }`}
      onClick={() => setTool(tool)}
    /> 
  );

  // The tool state lives in the parent (PriceChart) — expose a local setter via
  // a small escape hatch: PriceChart passes drawTool but toggling lives here
  // through a callback prop when available. To keep the parent as the single
  // source of truth we instead require the parent to pass onDrawToolChange.
  function setTool(tool: DrawTool) {
    // handled by parent through prop callback
    onDrawToolChange?.(drawTool === tool ? null : tool);
    setPending(null);
    setPreview(null);
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        className={`block [mask-image:linear-gradient(to_right,transparent,black_24px,black)] ${
          drawing ? 'cursor-copy' : grabbing ? 'cursor-grabbing' : 'cursor-crosshair'
        }`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          setPreview(null);
        }}
      >
        {/* horizontal grid + price labels */}
        {grid.map((g, i) => (
          <g key={`g-${i}`}>
            <line x1={PAD.left} x2={PAD.left + geo.plotW} y1={g.y} y2={g.y} style={{ stroke: 'rgb(var(--line))' }} strokeOpacity={0.5} strokeDasharray="2 4" />
            <text x={PAD.left + geo.plotW + 6} y={g.y + 3} style={{ fill: 'rgb(var(--muted))' }} fontFamily={FONT}>
              {g.v >= 1000 ? `${(g.v / 1000).toFixed(1)}k` : g.v >= 1 ? g.v.toFixed(2) : g.v.toPrecision(3)}
            </text>
          </g>
        ))}

        {/* time labels */}
        {xLabels.map((l) => (
          <text key={`x-${l.i}`} x={Math.min(l.x, PAD.left + geo.plotW - 18)} y={height - 6} fill={MUTED} fontFamily={FONT} textAnchor="middle">
            {l.label}
          </text>
        ))}

        {/* crosshair */}
        {hovered && (
          <line
            x1={geo.x(hover!)}
            x2={geo.x(hover!)}
            y1={PAD.top}
            y2={PAD.top + geo.plotH}
            stroke={MUTED}
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
        )}

        {/* Bollinger band fill (under overlays) */}
        {bandFill && <path d={bandFill.d} fill={bandFill.color} opacity={0.08} stroke="none" />}

        {/* candles */}
        {view.map((c, i) => {
          const up = c.c >= c.o;
          const color = up ? UP : DOWN;
          const cx = geo.x(i);
          const isHover = hover === i;
          return (
            <g key={`c-${c.t}-${i}`} opacity={hover !== null && !isHover ? 0.55 : 1}>
              <line x1={cx} x2={cx} y1={geo.y(c.h)} y2={geo.y(c.l)} stroke={color} strokeWidth={1} />
              <rect
                x={cx - geo.bodyW / 2}
                y={Math.min(geo.y(c.o), geo.y(c.c))}
                width={geo.bodyW}
                height={Math.max(1, Math.abs(geo.y(c.o) - geo.y(c.c)))}
                rx={Math.min(1.5, geo.bodyW / 4)}
                fill={color}
              />
            </g>
          );
        })}

        {/* volume histogram — trading activity strength per candle */}
        {geo.hasVol &&
          view.map((c, i) => {
            if (!c.v) return null;
            const up = c.c >= c.o;
            const barH = (c.v / (geo.maxV || 1)) * geo.volH;
            return (
              <rect
                key={`v-${c.t}-${i}`}
                x={geo.x(i) - geo.bodyW / 2}
                y={PAD.top + geo.fullH - barH}
                width={geo.bodyW}
                height={Math.max(0.5, barH)}
                rx={Math.min(1.5, geo.bodyW / 4)}
                fill={up ? UP : DOWN}
                opacity={0.35}
              />
            );
          })}

        {/* indicator overlays (MA / EMA / Bollinger) */}
        {overlayPaths.map(({ ov, d, lastVal }) => (
          <g key={ov.label}>
            <path d={d} fill="none" stroke={ov.color} strokeWidth={ov.width ?? 1.4} strokeDasharray={ov.dashed ? '4 3' : undefined} />
            {lastVal != null && (
              <text
                x={PAD.left + geo.plotW + 6}
                y={geo.y(lastVal) + 3}
                fill={ov.color}
                fontFamily={FONT}
                fontSize={9}
              >
                {ov.label}
              </text>
            )}
          </g>
        ))}

        {/* user drawings — horizontal levels and trendlines */}
        {drawings.map((dn) => {
          if (dn.type === 'hline') {
            const y = geo.y(dn.y1);
            return (
              <g key={dn.id}>
                <line x1={PAD.left} x2={PAD.left + geo.plotW} y1={y} y2={y} stroke={DRAW_COLOR} strokeWidth={1.2} strokeDasharray="6 4" opacity={0.9} />
                <text x={PAD.left + geo.plotW + 6} y={y + 3} fill={DRAW_COLOR} fontFamily={FONT} fontSize={9}>
                  {dn.y1 >= 1000 ? `${(dn.y1 / 1000).toFixed(1)}k` : dn.y1.toFixed(2)}
                </text>
              </g>
            );
          }
          if (dn.x1t == null || dn.x2t == null || dn.y2 == null) return null;
          const x1 = idxToX(timeToIdx(dn.x1t));
          const y1 = geo.y(dn.y1);
          const x2 = idxToX(timeToIdx(dn.x2t));
          const y2 = geo.y(dn.y2);
          return (
            <line key={dn.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={DRAW_COLOR} strokeWidth={1.5} opacity={0.9} strokeLinecap="round" />
          );
        })}

        {/* half-placed trendline + cursor preview */}
        {pending && preview && (
          <line
            x1={idxToX(timeToIdx(pending.x1t))}
            y1={geo.y(pending.y1)}
            x2={idxToX(timeToIdx(preview.x2t))}
            y2={geo.y(preview.y2)}
            stroke={DRAW_COLOR}
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        )}

        {/* trade markers — user's own fills */}
        {tradeMarkers.map((m) => {
          const buy = m.side === 'buy';
          const color = buy ? UP : DOWN;
          const tri = buy
            ? `${m.x},${m.y + 5} ${m.x - 5},${m.y + 13} ${m.x + 5},${m.y + 13}`
            : `${m.x},${m.y - 5} ${m.x - 5},${m.y - 13} ${m.x + 5},${m.y - 13}`;
          return (
            <g key={`tr-${m.t}-${m.side}`}>
              <polygon points={tri} fill={color} opacity={0.95} />
            </g>
          );
        })}

        {/* live edge — dotted line + price tag + pulsing dot, echoes the ticker's LIVE badge */}
        {(() => {
          const last = view[view.length - 1];
          if (!last) return null;
          const up = last.c >= last.o;
          const color = up ? UP : DOWN;
          const yC = geo.y(last.c);
          const xC = geo.x(view.length - 1);
          const label = last.c >= 1000 ? `${(last.c / 1000).toFixed(1)}k` : last.c >= 1 ? last.c.toFixed(2) : last.c.toPrecision(3);
          return (
            <g>
              <line x1={xC} x2={PAD.left + geo.plotW + 4} y1={yC} y2={yC} stroke={color} strokeOpacity={0.55} strokeDasharray="2 4" />
              <circle cx={xC} cy={yC} r={3} fill={color} className="animate-pulse" />
              <g transform={`translate(${PAD.left + geo.plotW + 6}, ${yC})`}>
                <rect x={0} y={-9} width={52} height={18} rx={4.5} style={{ fill: 'rgb(var(--panel))' }} stroke={color} strokeWidth={1} />
                <text x={26} y={4} textAnchor="middle" fontFamily={FONT} fontSize={10} fontWeight={700} fill={color}>
                  {label}
                </text>
              </g>
            </g>
          );
        })()}
      </svg>

      {/* zoom controls */}
      <div className="absolute left-1.5 top-1 z-10 flex items-center gap-1">
        <button
          title="Zoom out"
          className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-muted shadow transition-colors hover:bg-panel hover:text-txt"
          onClick={() => zoomAt(viewRef.current.plotW / 2 + PAD.left, 1.4)}
        >
          −
        </button>
        <button
          title="Zoom in"
          className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-muted shadow transition-colors hover:bg-panel hover:text-txt"
          onClick={() => zoomAt(viewRef.current.plotW / 2 + PAD.left, 0.7)}
        >
          +
        </button>
        {zoomed && (
          <button
            title="Reset zoom"
            className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-muted shadow transition-colors hover:bg-panel hover:text-txt"
            onClick={() => onViewportChange({ vis: null, end: null })}
          >
            ⟲
          </button>
        )}
        {zoomed && <span className="ml-0.5 font-mono text-[10px] text-muted">{view.length}/{total}</span>}
      </div>

      {/* drawing tools */}
      {onDrawingsChange && (
        <div className="absolute right-1.5 top-1 z-10 flex items-center gap-1">
          {drawBtn('trend', <PenLine size={12} />, 'Trendline — click two points')}
          {drawBtn('hline', <Minus size={12} />, 'Horizontal level — click a price')}
          {drawBtn('erase', <Eraser size={12} />, 'Erase — click near a drawing')}
          {drawings.length > 0 && (
            <button
              title="Clear all drawings"
              className="rounded-md border border-line bg-surface p-1 text-muted shadow transition-colors hover:bg-panel hover:text-down"
              onClick={() => {
                onDrawingsChange([]);
                setPending(null);
                setPreview(null);
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
          {pending && <span className="ml-0.5 font-mono text-[10px] text-[#f5b942]">click 2nd point…</span>}
        </div>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-[148px] rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <p className="text-muted">{new Date(hovered.t).toLocaleString('en-US')}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono">
            <span className="text-muted">O <span className="text-txt">{fmtPrice(hovered.o)}</span></span>
            <span className="text-muted">H <span className="text-up">{fmtPrice(hovered.h)}</span></span>
            <span className="text-muted">L <span className="text-down">{fmtPrice(hovered.l)}</span></span>
            <span className="text-muted">C <span className="text-txt">{fmtPrice(hovered.c)}</span></span>
          </div>
          {typeof hovered.v === 'number' && (
            <p className="text-muted">
              Vol <span className="text-txt">{fmtVol(hovered.v)}</span>
            </p>
          )}
          <p className={`mt-1 font-mono font-bold ${hovered.c >= hovered.o ? 'text-up' : 'text-down'}`}>
            {hovered.c >= hovered.o ? '+' : ''}
            {(((hovered.c - hovered.o) / hovered.o) * 100).toFixed(2)}%
          </p>
        </div>
      )}
    </div>
  );
}
