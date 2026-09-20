import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useMarket } from './MarketContext';
import { useNotifications } from './NotificationsContext';
import type { PriceAlert } from '../types';

interface AlertsCtx {
  alerts: PriceAlert[];
  loading: boolean;
  /** Create an alert — direction is derived from the target vs the live price. */
  createAlert: (symbol: string, target: number) => Promise<boolean>;
  deleteAlert: (id: string) => void;
  /** Active alert count for a symbol (for the bell badge). */
  activeCountFor: (symbol: string) => number;
}

const Ctx = createContext<AlertsCtx | null>(null);

export function useAlerts(): AlertsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAlerts must be used within AlertsProvider');
  return ctx;
}

/**
 * Price alerts: stored per user in Firestore (users/{uid}/alerts), synced in
 * real time. Every market refresh re-checks active alerts against live
 * quotes; a crossing alert flips to "triggered" and pushes a notification
 * through the normal notification center.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { quotes } = useMarket();
  const { notify } = useNotifications();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const firedRef = useRef<Set<string>>(new Set());

  // Real-time listener
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (!uid || !isFirebaseConfigured) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'users', uid, 'alerts'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAlerts(
          snap.docs.map((d) => {
            const data = d.data();
            const created = data.created_at;
            const triggered = data.triggered_at;
            return {
              id: d.id,
              symbol: data.symbol ?? '',
              target: Number(data.target) || 0,
              direction: data.direction === 'below' ? 'below' : 'above',
              status: data.status === 'triggered' ? 'triggered' : 'active',
              created_at: typeof created?.toMillis === 'function' ? created.toMillis() : Date.now(),
              triggered_at: typeof triggered?.toMillis === 'function' ? triggered.toMillis() : undefined,
            } satisfies PriceAlert;
          }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  // Fire crossings on every quote refresh. `firedRef` guards the window
  // between the local flip and the onSnapshot round-trip.
  useEffect(() => {
    if (!user || !isFirebaseConfigured) return;
    for (const a of alerts) {
      if (a.status !== 'active' || firedRef.current.has(a.id)) continue;
      const price = quotes[a.symbol]?.price;
      if (price == null) continue;
      const crossed = a.direction === 'above' ? price >= a.target : price <= a.target;
      if (!crossed) continue;
      firedRef.current.add(a.id);
      const label = `${a.symbol} ${a.direction === 'above' ? 'crossed above' : 'fell below'} ${a.target}`;
      updateDoc(doc(db, 'users', user.uid, 'alerts', a.id), {
        status: 'triggered',
        triggered_at: serverTimestamp(),
      }).catch(() => {
        firedRef.current.delete(a.id); // allow retry on next refresh
      });
      notify('info', 'Price alert', `${label} — now ${price}`);
    }
  }, [quotes, alerts, user, notify]);

  const createAlert = useCallback(
    async (symbol: string, target: number) => {
      if (!user || !isFirebaseConfigured || !Number.isFinite(target) || target <= 0) return false;
      const price = quotes[symbol]?.price ?? target;
      const direction = target > price ? 'above' : 'below';
      try {
        await addDoc(collection(db, 'users', user.uid, 'alerts'), {
          symbol,
          target,
          direction,
          status: 'active',
          created_at: serverTimestamp(),
        });
        notify('success', 'Alert set', `${symbol} ${direction === 'above' ? 'rises above' : 'falls below'} ${target}`);
        return true;
      } catch {
        return false;
      }
    },
    [user, quotes, notify],
  );

  const deleteAlert = useCallback(
    (id: string) => {
      if (!user || !isFirebaseConfigured) return;
      deleteDoc(doc(db, 'users', user.uid, 'alerts', id)).catch(() => {});
    },
    [user],
  );

  const activeCountFor = useCallback(
    (symbol: string) => alerts.filter((a) => a.symbol === symbol && a.status === 'active').length,
    [alerts],
  );

  const value = useMemo(
    () => ({ alerts, loading, createAlert, deleteAlert, activeCountFor }),
    [alerts, loading, createAlert, deleteAlert, activeCountFor],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
