import type { ComponentType } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { signOut, type User } from 'firebase/auth';
import {
  BarChart3,
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

type LayoutProps = { user: User };

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ size?: number }>;
};

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: Home },
  { label: 'Income', path: '/income', icon: Wallet },
  { label: 'Expenses', path: '/expenses', icon: ReceiptText },
  { label: 'Cards', path: '/cards', icon: CreditCard },
  { label: 'Debts', path: '/debts', icon: HandCoins },
  { label: 'Savings', path: '/savings', icon: PiggyBank },
  { label: 'Remittance', path: '/remittance', icon: Send },
  { label: 'Budget', path: '/budget', icon: Calculator },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Health', path: '/health', icon: HeartPulse },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Layout({ user }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">M</div>
          <div>
            <div className="sidebar-title">My Finance Pro</div>
            <div className="sidebar-subtitle">Personal Finance Tracker</div>
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
                <span>{item.label}</span>
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

      {/* Main */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/income" element={<Income user={user} />} />
          <Route path="/expenses" element={<Expenses user={user} />} />
          <Route path="/cards" element={<Cards user={user} />} />
          <Route path="/debts" element={<Debts user={user} />} />
          <Route path="/savings" element={<Savings user={user} />} />
          <Route path="/remittance" element={<Remittance user={user} />} />
          <Route path="/budget" element={<Budget user={user} />} />
          <Route path="/reports" element={<Reports user={user} />} />
          <Route path="/health" element={<Health user={user} />} />
          <Route path="/settings" element={<SettingsPage user={user} />} />
        </Routes>
      </main>

      {/* Mobile swipeable bottom nav */}
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
              }}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}