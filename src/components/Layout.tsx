// src/components/Layout.tsx
import type { ComponentType } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
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
  PiggyBank,
  ReceiptText,
  Send,
  Settings,
  Wallet,
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
  { label: 'Accounts',   path: '/accounts',   icon: BookOpen,    badge: 'ERP' },
  { label: 'Reports',    path: '/reports',    icon: BarChart3 },
  { label: 'Health',     path: '/health',     icon: HeartPulse },
  { label: 'Settings',   path: '/settings',   icon: Settings },
];

export default function Layout({ user }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
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
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
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

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="bottom-nav"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          justifyContent: 'flex-start',
          gap: '6px',
          paddingLeft: '10px',
          paddingRight: '10px',
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x proximity',
          scrollbarWidth: 'none',
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? 'bottom-nav-link active' : 'bottom-nav-link'
              }
              style={{
                flex: '0 0 76px',
                minWidth: '76px',
                scrollSnapAlign: 'start',
                borderRadius: '14px',
                position: 'relative',
              }}
            >
              <Icon size={19} />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    fontSize: 8,
                    fontWeight: 800,
                    padding: '1px 4px',
                    borderRadius: 4,
                    background: '#8b5cf6',
                    color: '#fff',
                    letterSpacing: 0.3,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}