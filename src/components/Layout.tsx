// src/components/Layout.tsx
import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { signOut, type User } from 'firebase/auth';
import {
  BarChart3,
  BookOpen,
  Calculator,
  CreditCard,
  HandCoins,
  HeartPulse,
  Home,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  ReceiptText,
  Send,
  Settings,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  Wallet,
  X,
} from 'lucide-react';
import { auth } from '../firebaseConfig';

// Pages
import Dashboard from '../pages/Dashboard';
import Income from '../pages/Income';
import Expenses from '../pages/Expenses';
import Cards from '../pages/Cards';
import Debts from '../pages/Debts';
import Savings from '../pages/Savings';
import Remittance from '../pages/Remittance';
import Budget from '../pages/Budget';
import Reports from '../pages/Reports';
import Health from '../pages/Health';
import SettingsPage from '../pages/Settings';
import Accounts from '../pages/Accounts';

type LayoutProps = { user: User };

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ size?: number }>;
  badge?: string;
};

const navItems: NavItem[] = [
  { label: 'Dashboard',  path: '/',           icon: Home },
  { label: 'Income',     path: '/income',     icon: Wallet },
  { label: 'Expenses',   path: '/expenses',   icon: ReceiptText },
  { label: 'Cards',      path: '/cards',      icon: CreditCard },
  { label: 'Debts',      path: '/debts',      icon: HandCoins },
  { label: 'Savings',    path: '/savings',    icon: PiggyBank },
  { label: 'Remittance', path: '/remittance', icon: Send },
  { label: 'Budget',     path: '/budget',     icon: Calculator },
  { label: 'Accounts',   path: '/accounts',   icon: BookOpen, badge: 'ERP' },
  { label: 'Reports',    path: '/reports',    icon: BarChart3 },
  { label: 'Health',     path: '/health',     icon: HeartPulse },
  { label: 'Settings',   path: '/settings',   icon: Settings },
];

export default function Layout({ user }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  // Close drawer/FAB menu on route change
  useEffect(() => {
    setDrawerOpen(false);
    setFabMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  // Get current page label for mobile header
  const currentPage = navItems.find(item => {
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path);
  });

  const handleQuickAdd = (type: 'income' | 'expense' | 'transfer') => {
    setFabMenuOpen(false);
    if (type === 'income') navigate('/income');
    else if (type === 'expense') navigate('/expenses');
    else if (type === 'transfer') navigate('/'); // dashboard has transfer modal
  };

  return (
    <div className="app-layout">

      {/* ═══════════════════════════════════════
          DESKTOP SIDEBAR
          ═══════════════════════════════════════ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">M</div>
          <div>
            <div className="sidebar-title">My Finance Pro</div>
            <div className="sidebar-subtitle">Personal ERP</div>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  isActive ? 'nav-link active' : 'nav-link'
                }
              >
                <Icon size={18} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(139,92,246,0.2)',
                      color: '#8b5cf6',
                      letterSpacing: 0.5,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box">
            <div className="user-avatar">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                user.displayName?.charAt(0) || 'U'
              )}
            </div>
            <div>
              <div className="user-name">{user.displayName || 'User'}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} /> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MOBILE HEADER
          ═══════════════════════════════════════ */}
      <header className="mobile-header">
        <div className="mobile-header-brand">
          <div className="mobile-header-logo">M</div>
          <div className="mobile-header-title">
            {currentPage?.label || 'My Finance Pro'}
          </div>
        </div>
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* ═══════════════════════════════════════
          DRAWER (Hamburger Menu)
          ═══════════════════════════════════════ */}
      <div
        className={`drawer-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="mobile-header-brand">
            <div className="mobile-header-logo">M</div>
            <div>
              <div className="sidebar-title">My Finance Pro</div>
              <div className="sidebar-subtitle">Personal ERP</div>
            </div>
          </div>
          <button
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="drawer-user">
          <div className="user-avatar">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" />
            ) : (
              user.displayName?.charAt(0) || 'U'
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="user-name">{user.displayName || 'User'}</div>
            <div className="user-email">{user.email}</div>
          </div>
        </div>

        <nav className="drawer-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  isActive ? 'drawer-nav-link active' : 'drawer-nav-link'
                }
              >
                <Icon size={20} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(139,92,246,0.2)',
                      color: '#8b5cf6',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="drawer-footer">
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              border: '1px solid var(--danger)',
              background: 'rgba(239,68,68,0.08)',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════ */}
      <main className="main-content">
        <Routes>
          <Route path="/"           element={<Dashboard   user={user} />} />
          <Route path="/income"     element={<Income      user={user} />} />
          <Route path="/expenses"   element={<Expenses    user={user} />} />
          <Route path="/cards"      element={<Cards       user={user} />} />
          <Route path="/debts"      element={<Debts       user={user} />} />
          <Route path="/savings"    element={<Savings     user={user} />} />
          <Route path="/remittance" element={<Remittance  user={user} />} />
          <Route path="/budget"     element={<Budget      user={user} />} />
          <Route path="/accounts"   element={<Accounts    user={user} />} />
          <Route path="/reports"    element={<Reports     user={user} />} />
          <Route path="/health"     element={<Health      user={user} />} />
          <Route path="/settings"   element={<SettingsPage user={user} />} />
          <Route path="*" element={<Dashboard user={user} />} />
        </Routes>
      </main>

      {/* ═══════════════════════════════════════
          FAB QUICK ADD MENU (Mobile)
          ═══════════════════════════════════════ */}
      <div
        className={`fab-menu-overlay ${fabMenuOpen ? 'open' : ''}`}
        onClick={() => setFabMenuOpen(false)}
      />
      <div className={`fab-menu ${fabMenuOpen ? 'open' : ''}`}>
        <button
          className="fab-menu-item"
          onClick={() => handleQuickAdd('income')}
        >
          <TrendingUp size={20} color="var(--success)" />
          <span>Add Income</span>
        </button>
        <button
          className="fab-menu-item"
          onClick={() => handleQuickAdd('expense')}
        >
          <TrendingDown size={20} color="var(--danger)" />
          <span>Add Expense</span>
        </button>
        <button
          className="fab-menu-item"
          onClick={() => handleQuickAdd('transfer')}
        >
          <ArrowLeftRight size={20} color="var(--primary)" />
          <span>Transfer</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════
          BOTTOM NAV (Mobile)
          ═══════════════════════════════════════ */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {/* Home */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link active' : 'bottom-nav-link'
            }
          >
            <Home size={22} />
            <span>Home</span>
          </NavLink>

          {/* Cards */}
          <NavLink
            to="/cards"
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link active' : 'bottom-nav-link'
            }
          >
            <CreditCard size={22} />
            <span>Cards</span>
          </NavLink>

          {/* FAB - Add (Center) */}
          <button
            className="fab-add"
            onClick={() => setFabMenuOpen(!fabMenuOpen)}
            aria-label="Quick Add"
          >
            <Plus size={28} style={{
              transition: 'transform 0.2s',
              transform: fabMenuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }} />
          </button>

          {/* Spacer to balance FAB */}
          <div style={{ width: 60 }} />

          {/* Reports */}
          <NavLink
            to="/reports"
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link active' : 'bottom-nav-link'
            }
          >
            <BarChart3 size={22} />
            <span>Reports</span>
          </NavLink>

          {/* More (Opens Drawer) */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="bottom-nav-link"
            style={{ background: 'none', border: 'none' }}
          >
            <Menu size={22} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}