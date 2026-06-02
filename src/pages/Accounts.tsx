// src/pages/Accounts.tsx — Chart of Accounts Master
import { useEffect, useState, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { toast } from 'react-hot-toast';
import {
  Plus, X, Edit2, Trash2, ChevronDown, ChevronUp,
  Search, RefreshCw, AlertTriangle, Check,
  BookOpen, TrendingUp, TrendingDown, Wallet,
  CreditCard, PiggyBank, FileText, Lock,
} from 'lucide-react';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
    initializeChartOfAccounts,
    addGLAccount,
    updateGLAccount,
    deactivateGLAccount,
    reactivateGLAccount,
    calculateGLAccountBalance,
    getNextAccountCode,
    getAccountsByClass,
    listenGLAccounts,
    formatCurrency,
  } from '../firestoreHelpers';
  import type { GLAccount, AccountClass } from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  amount: number;
  currency: 'AED' | 'INR';
  debitAccountId?: string;
  creditAccountId?: string;
  isReversed?: boolean;
  date: string;
  type: 'income' | 'expense' | 'transfer';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_META: Record<AccountClass, {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  range: string;
  description: string;
}> = {
  Asset: {
    label: 'Assets',
    icon: <Wallet size={18} />,
    color: '#10b981',
    bgColor: 'rgba(16,185,129,0.1)',
    range: '1000-1999',
    description: 'Cash, bank accounts, investments, receivables',
  },
  Liability: {
    label: 'Liabilities',
    icon: <CreditCard size={18} />,
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,0.1)',
    range: '2000-2999',
    description: 'Credit cards, loans, Tabby, debts owed',
  },
  Equity: {
    label: 'Equity',
    icon: <PiggyBank size={18} />,
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,0.1)',
    range: '3000-3999',
    description: 'Net worth, retained earnings',
  },
  Income: {
    label: 'Income',
    icon: <TrendingUp size={18} />,
    color: '#10b981',
    bgColor: 'rgba(16,185,129,0.1)',
    range: '4000-4999',
    description: 'Salary, freelance, business, investments',
  },
  Expense: {
    label: 'Expenses',
    icon: <TrendingDown size={18} />,
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.1)',
    range: '5000-5999',
    description: 'Rent, food, transport, utilities, etc.',
  },
};

const COMMON_ICONS = [
  '💰', '💳', '💵', '💸', '📊', '📈', '📉',
  '🏠', '🏦', '🏥', '🏢', '🏪', '🏧', '🏛️',
  '🚗', '✈️', '🚌', '🍔', '🛒', '🛍️', '📱',
  '💡', '🎬', '📚', '🎓', '💼', '🧑‍💻', '🤝',
  '🎁', '🪙', '🔒', '📋', '📅', '➕', '🛐',
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontWeight: 600,
  display: 'block',
  marginBottom: 6,
};

// ─── Account Form Modal ──────────────────────────────────────────────────────

interface AccountModalProps {
  userId: string;
  account?: GLAccount | null;
  allAccounts: GLAccount[];
  onClose: () => void;
}

function AccountModal({ userId, account, allAccounts, onClose }: AccountModalProps) {
  const isEdit = !!account?.id;
  const isSystem = account?.isSystemAccount === true;

  const [name, setName] = useState(account?.name || '');
  const [code, setCode] = useState(account?.code || '');
  const [accountClass, setAccountClass] = useState<AccountClass>(account?.accountClass || 'Expense');
  const [accountType, setAccountType] = useState(account?.accountType || 'Variable');
  const [icon, setIcon] = useState(account?.icon || '💰');
  const [description, setDescription] = useState(account?.description || '');
  const [parentCode, setParentCode] = useState(account?.parentCode || '');
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Auto-suggest code when class changes (for new accounts)
  useEffect(() => {
    if (!isEdit) {
      setCode(getNextAccountCode(accountClass, allAccounts));
    }
  }, [accountClass, isEdit]);

  const possibleParents = useMemo(() => {
    return allAccounts.filter(a =>
      a.accountClass === accountClass &&
      a.accountType === 'Group' &&
      a.code !== code
    );
  }, [accountClass, allAccounts, code]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!code.trim()) { toast.error('Code required'); return; }

    // Check duplicate code
    const duplicate = allAccounts.find(a => a.code === code && a.id !== account?.id);
    if (duplicate) {
      toast.error(`Code ${code} already exists (${duplicate.name})`);
      return;
    }

    setSaving(true);
    try {
      if (isEdit && account?.id) {
        // Only allow name, icon, description changes for system accounts
        if (isSystem) {
          await updateGLAccount(account.id, {
            name: name.trim(),
            icon,
            description: description.trim() || null,
            isDefault,
          });
        } else {
          await updateGLAccount(account.id, {
            code,
            name: name.trim(),
            accountClass,
            accountType,
            icon,
            description: description.trim() || null,
            parentCode: parentCode || null,
            isDefault,
          });
        }
        toast.success('Account updated');
      } else {
        await addGLAccount({
          userId,
          code,
          name: name.trim(),
          accountClass,
          accountType,
          icon,
          description: description.trim() || null,
          parentCode: parentCode || null,
          isSystemAccount: false,
          isActive: true,
          isDefault,
          sortOrder: 999,
        });
        toast.success('Account created');
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 16,
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 20,
        width: '100%', maxWidth: 500, maxHeight: '90vh',
        overflowY: 'auto', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5 }}>
              CHART OF ACCOUNTS
            </div>
            <div style={{ fontSize: 19, fontWeight: 900, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              {isEdit ? 'Edit' : 'New'} Account
              {isSystem && (
                <span style={{
                  padding: '2px 8px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.15)', color: 'var(--warning)',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Lock size={11} /> SYSTEM
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'var(--bg)', border: 'none', borderRadius: 10,
            padding: 8, cursor: 'pointer', color: 'var(--text)',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* System account notice */}
        {isSystem && (
          <div style={{
            margin: '16px 20px 0', padding: 12, borderRadius: 10,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            fontSize: 12, color: 'var(--warning)',
          }}>
            ⚠️ System account — only name, icon, and description can be edited.
            Code and class are locked for data integrity.
          </div>
        )}

        {/* Form */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Account Class */}
          <div>
            <label style={labelStyle}>Account Class *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {(Object.keys(CLASS_META) as AccountClass[]).map(cls => {
                const meta = CLASS_META[cls];
                const active = accountClass === cls;
                return (
                  <button
                    key={cls}
                    type="button"
                    disabled={isSystem}
                    onClick={() => setAccountClass(cls)}
                    style={{
                      padding: '10px 4px', borderRadius: 8,
                      border: `2px solid ${active ? meta.color : 'var(--border)'}`,
                      background: active ? meta.bgColor : 'var(--bg)',
                      color: active ? meta.color : 'var(--muted)',
                      cursor: isSystem ? 'not-allowed' : 'pointer',
                      opacity: isSystem ? 0.6 : 1,
                      fontSize: 11, fontWeight: 700,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    {meta.icon}
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Code + Icon */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
            <div>
              <label style={labelStyle}>Account Code *</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                disabled={isSystem}
                placeholder="e.g. 5091"
                style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700, opacity: isSystem ? 0.6 : 1 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Icon</label>
              <button
                type="button"
                onClick={() => setShowIconPicker(p => !p)}
                style={{
                  width: '100%', height: 42, borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  cursor: 'pointer', fontSize: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {icon}
              </button>
            </div>
          </div>

          {/* Icon Picker */}
          {showIconPicker && (
            <div style={{
              padding: 10, borderRadius: 10,
              background: 'var(--bg)', border: '1px solid var(--border)',
              display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6,
              maxHeight: 200, overflowY: 'auto',
            }}>
              {COMMON_ICONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { setIcon(emoji); setShowIconPicker(false); }}
                  style={{
                    aspectRatio: '1', borderRadius: 8,
                    border: icon === emoji ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: icon === emoji ? 'rgba(99,102,241,0.1)' : 'var(--card)',
                    cursor: 'pointer', fontSize: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label style={labelStyle}>Account Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pet Expenses, Side Gig Income"
              style={inputStyle}
            />
          </div>

          {/* Account Type */}
          <div>
            <label style={labelStyle}>Account Type</label>
            <input
              type="text"
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
              disabled={isSystem}
              placeholder="e.g. Variable, Fixed, Recurring"
              style={{ ...inputStyle, opacity: isSystem ? 0.6 : 1 }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Helps group similar accounts (e.g. Fixed vs Variable expenses)
            </div>
          </div>

          {/* Parent Account */}
          {possibleParents.length > 0 && !isSystem && (
            <div>
              <label style={labelStyle}>Parent Account (optional)</label>
              <select
                value={parentCode || ''}
                onChange={e => setParentCode(e.target.value)}
                style={inputStyle}
              >
                <option value="">— No parent (top-level) —</option>
                {possibleParents.map(p => (
                  <option key={p.code} value={p.code}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="When to use this account..."
              style={inputStyle}
            />
          </div>

          {/* Default toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                Show as default suggestion
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Appears in quick-add dropdowns
              </div>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: 12, borderRadius: 12, border: 'none',
              background: 'var(--primary)', color: '#fff',
              fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={15} />
            {saving ? 'Saving...' : isEdit ? 'Update Account' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account Row ──────────────────────────────────────────────────────────────

interface AccountRowProps {
  account: GLAccount;
  balance: number;
  txCount: number;
  onEdit: () => void;
  onToggleActive: () => void;
}

function AccountRow({ account, balance, txCount, onEdit, onToggleActive }: AccountRowProps) {
  const meta = CLASS_META[account.accountClass];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10,
      background: account.isActive ? 'var(--bg)' : 'rgba(0,0,0,0.05)',
      border: '1px solid var(--border)',
      opacity: account.isActive ? 1 : 0.5,
    }}>
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: meta.bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0,
      }}>
        {account.icon || '📋'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 2,
        }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
            color: 'var(--muted)',
            padding: '1px 6px', borderRadius: 4,
            background: 'rgba(0,0,0,0.05)',
          }}>
            {account.code}
          </span>
          <span style={{
            fontWeight: 700, fontSize: 14, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {account.name}
          </span>
          {account.isSystemAccount && (
            <Lock size={11} color="var(--muted)" />
          )}
          {account.isDefault && (
            <span style={{
              padding: '1px 6px', borderRadius: 4,
              background: 'rgba(99,102,241,0.1)', color: 'var(--primary)',
              fontSize: 10, fontWeight: 700,
            }}>
              DEFAULT
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {account.accountType}
          {txCount > 0 && ` · ${txCount} transactions`}
          {account.parentCode && ` · Parent: ${account.parentCode}`}
        </div>
      </div>

      {/* Balance */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontWeight: 800, fontSize: 14,
          color: balance > 0 ? meta.color : 'var(--muted)',
        }}>
          {balance > 0 ? formatCurrency(balance, 'AED') : '—'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
          {balance > 0 ? 'Balance' : 'No activity'}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onEdit}
          style={{
            padding: 6, borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Edit2 size={13} />
        </button>
        {!account.isSystemAccount && (
          <button
            onClick={onToggleActive}
            style={{
              padding: 6, borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: account.isActive ? 'var(--danger)' : 'var(--success)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            {account.isActive ? <Trash2 size={13} /> : <RefreshCw size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Accounts({ user }: { user: User }) {
  const [accounts, setAccounts] = useState<GLAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<GLAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState<AccountClass | 'ALL'>('ALL');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({
    Asset: true, Liability: true, Equity: true, Income: true, Expense: true,
  });
  const [initializing, setInitializing] = useState(false);

  // ── Listeners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;

    const unsubAccounts = listenGLAccounts(user.uid, accs => {
      setAccounts(accs);
      setLoading(false);
    });

    const unsubTx = onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', user.uid)),
      snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)))
    );

    return () => { unsubAccounts(); unsubTx(); };
  }, [user?.uid]);

  // ── Initialize default accounts ───────────────────────────────────────────

  const handleInitialize = async () => {
    if (!confirm('Initialize default Chart of Accounts? This adds standard accounts (Assets, Liabilities, Income, Expenses).')) return;
    setInitializing(true);
    try {
      const count = await initializeChartOfAccounts(user.uid);
      if (count > 0) {
        toast.success(`Initialized ${count} default accounts!`);
      } else {
        toast('Chart of Accounts already initialized', { icon: 'ℹ️' });
      }
    } catch (err) {
      console.error(err);
      toast.error('Initialization failed');
    } finally {
      setInitializing(false);
    }
  };

  // ── Filter accounts ───────────────────────────────────────────────────────

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      if (!showInactive && !a.isActive) return false;
      if (filterClass !== 'ALL' && a.accountClass !== filterClass) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.code.includes(q);
      }
      return true;
    });
  }, [accounts, filterClass, searchQuery, showInactive]);

  // ── Group by class ────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map: Record<AccountClass, GLAccount[]> = {
      Asset: [], Liability: [], Equity: [], Income: [], Expense: [],
    };
    filteredAccounts.forEach(a => map[a.accountClass].push(a));
    return map;
  }, [filteredAccounts]);

  // ── Calculate balances ────────────────────────────────────────────────────

  const accountBalances = useMemo(() => {
    const map: Record<string, { balance: number; count: number }> = {};
    accounts.forEach(a => {
      const balance = calculateGLAccountBalance(a, transactions);
      const count = transactions.filter(t =>
        !t.isReversed && (t.debitAccountId === a.code || t.creditAccountId === a.code)
      ).length;
      map[a.code] = { balance, count };
    });
    return map;
  }, [accounts, transactions]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleActive = async (account: GLAccount) => {
    if (!account.id) return;
    try {
      if (account.isActive) {
        await deactivateGLAccount(account.id, account.isSystemAccount);
        toast.success('Account deactivated');
      } else {
        await reactivateGLAccount(account.id);
        toast.success('Account reactivated');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
  };

  // ── Empty state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
        <div>Loading Chart of Accounts...</div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '40px 20px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <BookOpen size={64} style={{ color: 'var(--primary)', marginBottom: 16 }} />
        <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          Chart of Accounts
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
          Set up your accounting structure. The Chart of Accounts is the foundation of your financial system —
          it organizes all your money into Assets, Liabilities, Income, and Expenses.
        </p>
        <button
          onClick={handleInitialize}
          disabled={initializing}
          style={{
            padding: '14px 32px', borderRadius: 14, border: 'none',
            background: 'var(--primary)', color: '#fff',
            fontWeight: 800, fontSize: 16,
            cursor: initializing ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          {initializing ? <RefreshCw size={18} className="spin" /> : <Plus size={18} />}
          {initializing ? 'Initializing...' : 'Initialize Default Accounts'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
          This will create ~40 standard accounts. You can edit, deactivate, or add custom accounts anytime.
        </p>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>
            ERP MASTER
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BookOpen size={24} color="var(--primary)" />
            Chart of Accounts
          </h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {accounts.length} accounts ({accounts.filter(a => a.isActive).length} active)
          </div>
        </div>

        <button
          onClick={() => { setEditAccount(null); setShowModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 12,
            background: 'var(--primary)', color: '#fff', border: 'none',
            cursor: 'pointer', fontWeight: 800, fontSize: 14,
          }}
        >
          <Plus size={16} /> Add Account
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 20,
      }}>
        {(Object.keys(CLASS_META) as AccountClass[]).map(cls => {
          const meta = CLASS_META[cls];
          const count = accounts.filter(a => a.accountClass === cls && a.isActive).length;
          return (
            <button
              key={cls}
              onClick={() => setFilterClass(filterClass === cls ? 'ALL' : cls)}
              style={{
                padding: '12px 10px', borderRadius: 12,
                background: meta.bgColor,
                border: `2px solid ${filterClass === cls ? meta.color : 'transparent'}`,
                cursor: 'pointer', textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: meta.color }}>
                {meta.icon}
                <span style={{ fontSize: 12, fontWeight: 700 }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: meta.color }}>
                {count}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {meta.range}
              </div>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', pointerEvents: 'none',
          }} />
          <input
            type="text"
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'var(--card)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 13,
        }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {/* Accounts grouped by class */}
      {(Object.keys(CLASS_META) as AccountClass[]).map(cls => {
        const items = grouped[cls];
        if (items.length === 0) return null;
        const meta = CLASS_META[cls];
        const isExpanded = expandedClasses[cls];

        return (
          <div key={cls} style={{ marginBottom: 20 }}>
            {/* Class Header */}
            <button
              onClick={() => setExpandedClasses(prev => ({ ...prev, [cls]: !prev[cls] }))}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: 'none', background: meta.bgColor,
                cursor: 'pointer', marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: meta.color }}>
                {meta.icon}
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                    {meta.description}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: meta.color }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{items.length}</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {/* Accounts */}
            {isExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(account => {
                  const stats = accountBalances[account.code] || { balance: 0, count: 0 };
                  return (
                    <AccountRow
                      key={account.id}
                      account={account}
                      balance={stats.balance}
                      txCount={stats.count}
                      onEdit={() => { setEditAccount(account); setShowModal(true); }}
                      onToggleActive={() => handleToggleActive(account)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty filter result */}
      {filteredAccounts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
          <FileText size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
          <div>No accounts match your filters</div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <AccountModal
          userId={user.uid}
          account={editAccount}
          allAccounts={accounts}
          onClose={() => { setShowModal(false); setEditAccount(null); }}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}