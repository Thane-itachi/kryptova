import { useMemo, useState } from 'react';
import { Bell, BellRing, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertsContext';
import { useMarket } from '../../context/MarketContext';
import { fmtPrice, fmtTime } from '../../lib/format';

/**
 * Price-alert popover for the asset page: create an alert at a target price
 * (direction inferred from the live price), and manage this symbol's alerts.
 */
export default function AlertsPanel({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const { getQuote } = useMarket();
  const { alerts, createAlert, deleteAlert, activeCountFor } = useAlerts();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');

  const price = getQuote(symbol)?.price ?? 0;
  const mine = useMemo(() => alerts.filter((a) => a.symbol === symbol), [alerts, symbol]);
  const activeCount = activeCountFor(symbol);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseFloat(target);
    if (!Number.isFinite(t) || t <= 0) return;
    const ok = await createAlert(symbol, t);
    if (ok) setTarget('');
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-panel hover:text-txt"
        title="Price alerts"
      >
        {activeCount > 0 ? <BellRing size={14} className="text-primary-400" /> : <Bell size={14} />}
        Alerts
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 font-mono text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold">{symbol} alerts</span>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-panel" title="Close">
                <X size={13} />
              </button>
            </div>

            <form onSubmit={submit} className="border-b border-line px-4 py-3">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Notify when price
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={price > 0 ? fmtPrice(price) : '0.00'}
                  className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-txt placeholder:text-muted focus:border-primary-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
                  disabled={!Number.isFinite(parseFloat(target)) || parseFloat(target) <= 0}
                >
                  Set
                </button>
              </div>
              {price > 0 && Number.isFinite(parseFloat(target)) && parseFloat(target) > 0 && (
                <p className="mt-1.5 text-[10px] text-muted">
                  {parseFloat(target) > price ? `Rises above ${fmtPrice(price)} (currently ${fmtPrice(price)})` : `Falls below ${fmtPrice(price)} (currently ${fmtPrice(price)})`}
                </p>
              )}
            </form>

            <div className="max-h-56 overflow-y-auto">
              {mine.length === 0 ? (
                <p className="px-4 py-5 text-center text-xs text-muted">No alerts for {symbol} yet.</p>
              ) : (
                mine.map((a) => (
                  <div key={a.id} className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-txt">
                        <span className={a.direction === 'above' ? 'text-up' : 'text-down'}>
                          {a.direction === 'above' ? '↑' : '↓'}
                        </span>{' '}
                        {fmtPrice(a.target)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {a.status === 'active' ? 'watching' : `triggered ${a.triggered_at ? fmtTime(a.triggered_at) : ''}`}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAlert(a.id)}
                      className="rounded p-1 text-muted transition-colors hover:bg-panel hover:text-down"
                      title="Delete alert"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
