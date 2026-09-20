import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, CandlestickChart, CircleDollarSign, Compass, Download, Gauge,
  LayoutDashboard, LogOut, Menu, Moon, PieChart, Search, Settings as SettingsIcon,
  Sun, User as UserIcon, Wallet, X,
} from 'lucide-react';
import { useAuth, useTheme } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { Badge } from '../ui';
import SearchDialog from './SearchDialog';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import NotificationCenter from '../NotificationCenter';
import Toaster from '../Toaster';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/markets', label: 'Markets', icon: Activity },
  { to: '/app/trade', label: 'Trade', icon: CandlestickChart },
  { to: '/app/portfolio', label: 'Portfolio', icon: PieChart },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/watchlist', label: 'Watchlist', icon: Gauge },
  { to: '/app/transactions', label: 'Transactions', icon: Wallet },
  { to: '/app/converter', label: 'Converter', icon: CircleDollarSign },
];

const NAV_BOTTOM = [
  { to: '/app/profile', label: 'Profile', icon: UserIcon },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
];

/** Install-app button — appears once the browser offers installation
 * (beforeinstallprompt) or always on iOS with Add-to-Home-Screen guidance. */
function InstallButton() {
  const { canInstall, install, installed, isIos } = usePwaInstall();
  const [hint, setHint] = useState(false);
  if (installed) return null;
  if (!canInstall && !isIos) return null;

  const handle = async () => {
    if (canInstall) await install();
    else setHint((h) => !h);
  };

  return (
    <div className="relative">
      <button
        onClick={handle}
        className="rounded-lg p-2 text-muted hover:bg-panel hover:text-txt"
        aria-label="Install app"
        title="Install Kryptova on this device"
      >
        <Download size={17} />
      </button>
      {hint && (
        <div className="absolute right-0 top-11 z-30 w-60 rounded-lg border border-line bg-surface p-3 text-xs shadow-xl">
          <p className="font-semibold text-txt">Install on iPhone / iPad</p>
          <p className="mt-1 text-muted">
            Tap the <span className="font-semibold text-txt">Share</span> button in Safari, then{' '}
            <span className="font-semibold text-txt">Add to Home Screen</span>.
          </p>
          <button
            onClick={() => setHint(false)}
            className="mt-2 rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end, onClick }: { to: string; label: string; icon: typeof Activity; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-panel text-primary-400' : 'text-muted hover:bg-panel hover:text-txt'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export default function AppLayout() {
  const { user, signOut, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const avatarUrl = profile?.avatar_url ?? '';
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  return (
    <div className="min-h-screen bg-bg">
      <Toaster />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Link to="/app" className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
            <CandlestickChart size={18} className="text-white" />
          </div>
          <span className="brand-name font-bold tracking-tight">KRYPTOVA</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
          <div className="my-3 border-t border-line" />
          {NAV_BOTTOM.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <div className="space-y-3 border-t border-line p-4">
          <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Paper Trading</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              All balances are virtual DEMO FUNDS. No real money is involved.
            </p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-panel hover:text-txt"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="brand-name font-bold tracking-tight">KRYPTOVA</span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-muted hover:bg-panel">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-1">
              {[...NAV, ...NAV_BOTTOM].map((n) => (
                <NavItem key={n.to} {...n} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>
            <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-primary-600">Paper Trading</p>
              <p className="mt-1 text-[11px] text-muted">Virtual DEMO FUNDS only. No real money.</p>
            </div>
          </div>
        </div>
      )}

      {/* Topbar + content */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
          <button onClick={() => setDrawerOpen(true)} className="rounded-lg p-2 text-muted hover:bg-panel lg:hidden">
            <Menu size={18} />
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-muted hover:border-primary-500/50"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search markets…</span>
            <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] md:block">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <NotificationCenter />
            <InstallButton />
            <button onClick={toggleTheme} className="rounded-lg p-2 text-muted hover:bg-panel" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link
              to="/app/profile"
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary-600 text-sm font-bold text-white ring-1 ring-line transition-transform hover:scale-105"
              title={user?.email ?? 'Profile'}
            >
              {avatarUrl && !avatarFailed ? (
                <img
                  src={avatarUrl}
                  alt="Your profile"
                  onError={() => setAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                (user?.email?.[0] ?? 'U').toUpperCase()
              )}
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-4 pb-24 lg:p-6 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-line bg-surface/95 py-1.5 backdrop-blur lg:hidden">
        {[NAV[0], NAV[1], NAV[2], NAV[3], { to: '/app/transactions', label: 'History', icon: Compass }].map((n) => (
          <NavLink
            key={n.label}
            to={n.to}
            end={n.to === '/app'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${isActive ? 'text-primary-400' : 'text-muted'}`
            }
          >
            <n.icon size={19} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
