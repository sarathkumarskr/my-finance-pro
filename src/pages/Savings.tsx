import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  PiggyBank, Plus, X, Trash2, Target,
  Edit2, Check, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };
type Country = 'UAE' | 'India';
type Currency = 'AED' | 'INR';
type CategoryType = 'savings' | 'expense';

type SavingsCategory =
  | 'home_loan_emi' | 'car_loan_emi' | 'personal_loan_emi'
  | 'chitti_kuri' | 'mutual_fund_sip' | 'recurring_deposit'
  | 'fixed_deposit' | 'gold_savings' | 'ppf_nps' | 'other_savings';

// Budget item (savings type only)
type BudgetItem = {
  id?: string;
  userId: string;
  country: Country;
  name: string;
  defaultAmount: number;
  currency: Currency;
  startMonth: string;
  endMonth: string | null;
  isActive: boolean;
  categoryType: CategoryType;
  savingsCategory?: SavingsCategory;
  paymentType: 'cash' | 'credit' | 'tabby';
};

type MonthOverride = {
  id?: string;
  budgetItemId: string;
  month: string;
  amount: number;
  isPaid: boolean;
  paidDate: string | null;
};

// Savings Goals (existing)
type SavingGoal = {
  id?: string;
  userId: string;
  name: string;
  country: Country;
  currency: Currency;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  note?: string;
  createdAt?: any;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (month: string) => {
  const [y, m] = month.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const formatAmt = (amount: number, currency: Currency) =>
  currency === 'AED'
    ? `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isItemActiveInMonth = (item: BudgetItem, month: string) => {
  if (!item.isActive) return false;
  if (item.startMonth > month) return false;
  if (item.endMonth && item.endMonth < month) return false;
  return true;
};

const SAVINGS_CATEGORY_LABELS: Record<SavingsCategory, { label: string; icon: string }> = {
  home_loan_emi:     { label: 'Home Loan EMI',     icon: '🏠' },
  car_loan_emi:      { label: 'Car Loan EMI',      icon: '🚗' },
  personal_loan_emi: { label: 'Personal Loan EMI', icon: '💳' },
  chitti_kuri:       { label: 'Chitti / Kuri',     icon: '🤝' },
  mutual_fund_sip:   { label: 'Mutual Fund / SIP', icon: '📈' },
  recurring_deposit: { label: 'Recurring Deposit', icon: '🏦' },
  fixed_deposit:     { label: 'Fixed Deposit',     icon: '🔒' },
  gold_savings:      { label: 'Gold Savings',      icon: '🪙' },
  ppf_nps:           { label: 'PPF / NPS',         icon: '🛡️' },
  other_savings:     { label: 'Other Savings',     icon: '💰' },
};

// ─── Goal Modal ───────────────────────────────────────────────────────────────

function GoalModal({
  user, editingGoal, onClose,
}: {
  user: Props['user'];
  editingGoal: SavingGoal | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(editingGoal?.name || '');
  const [country, setCountry] = useState<Country>(editingGoal?.country || 'UAE');
  const [targetAmount, setTargetAmount] = useState(String(editingGoal?.targetAmount || ''));
  const [currentAmount, setCurrentAmount] = useState(String(editingGoal?.currentAmount || ''));
  const [deadline, setDeadline] = useState(editingGoal?.deadline || '');
  const [note, setNote] = useState(editingGoal?.note || '');
  const [saving, setSaving] = useState(false);

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: '14px', outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '13px', fontWeight: 700, color: 'var(--muted)',
    marginBottom: '8px', display: 'block',
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Enter goal name'); return; }
    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      toast.error('Enter valid target amount'); return;
    }
    if (!currentAmount || parseFloat(currentAmount) < 0) {
      toast.error('Enter valid current amount'); return;
    }
    setSaving(true);
    try {
      const data = {
        userId: user.uid, name: name.trim(), country, currency,
        targetAmount: parseFloat(targetAmount),
        currentAmount: parseFloat(currentAmount),
        deadline: deadline || '',
        note: note.trim() || '',
      };
      if (editingGoal?.id) {
        await updateDoc(doc(db, 'savingGoals', editingGoal.id), data);
        toast.success('Goal updated!');
      } else {
        await addDoc(collection(db, 'savingGoals'), {
          ...data, createdAt: serverTimestamp(),
        });
        toast.success('Goal created!');
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)', display: 'grid',
      placeItems: 'center', zIndex: 200, padding: '16px',
    }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '20px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
            {editingGoal ? 'Edit Goal' : 'Add Savings Goal'}
          </h2>
          <button onClick={onClose} style={{
            padding: '8px', borderRadius: '10px',
            border: 'none', background: 'var(--bg)', cursor: 'pointer',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Goal Name</label>
          <input
            type="text"
            placeholder="e.g. Emergency Fund, Bike, Gold"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Country</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['UAE', 'India'] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px',
                  border: `2px solid ${country === c ? 'var(--primary)' : 'var(--border)'}`,
                  background: country === c ? 'rgba(99,102,241,0.12)' : 'var(--bg)',
                  color: country === c ? 'var(--primary)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                }}
              >
                {c === 'UAE' ? '🇦🇪 UAE (AED)' : '🇮🇳 India (INR)'}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '12px', marginBottom: '16px',
        }}>
          <div>
            <label style={labelStyle}>Target ({currency})</label>
            <input
              type="number" placeholder="e.g. 100000"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Saved So Far ({currency})</label>
            <input
              type="number" placeholder="e.g. 25000"
              value={currentAmount}
              onChange={(e) => setCurrentAmount(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Deadline (Optional)</label>
          <input
            type="date" value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Note (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Save from monthly bonus"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '10px',
            border: 'none', background: 'var(--primary)', color: '#fff',
            fontSize: '15px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving
            ? editingGoal ? 'Updating...' : 'Saving...'
            : editingGoal ? 'Update Goal' : 'Save Goal'}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Savings({ user }: Props) {
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [overrides, setOverrides] = useState<MonthOverride[]>([]);
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth());
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);
  const [activeTab, setActiveTab] = useState<'commitments' | 'goals'>('commitments');
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    // Savings goals
    const unsubGoals = onSnapshot(
      query(collection(db, 'savingGoals'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')),
      (snap) => {
        setGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SavingGoal[]);
        setLoadedCount((c) => c + 1);
      },
      () => setLoadedCount((c) => c + 1)
    );

    // Budget items (savings type)
    const unsubBudget = onSnapshot(
      query(collection(db, 'budgetItems'),
        where('userId', '==', user.uid)),
      (snap) => {
        setBudgetItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BudgetItem[]
        );
        setLoadedCount((c) => c + 1);
      },
      () => setLoadedCount((c) => c + 1)
    );

    // Month overrides
    const unsubOverrides = onSnapshot(
      query(collection(db, 'budgetMonthOverrides'),
        where('userId', '==', user.uid)),
      (snap) => {
        setOverrides(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MonthOverride[]
        );
        setLoadedCount((c) => c + 1);
      },
      () => setLoadedCount((c) => c + 1)
    );

    return () => { unsubGoals(); unsubBudget(); unsubOverrides(); };
  }, [user.uid]);

  useEffect(() => {
    if (loadedCount >= 3) setLoading(false);
  }, [loadedCount]);

  // Filter savings items active in current month
  const savingsItems = budgetItems.filter(
    (i) => i.categoryType === 'savings' && isItemActiveInMonth(i, currentMonth)
  );

  const getEffectiveAmount = (item: BudgetItem) => {
    const ov = overrides.find(
      (o) => o.budgetItemId === item.id && o.month === currentMonth
    );
    return ov?.amount ?? item.defaultAmount;
  };

  const getOverride = (item: BudgetItem) =>
    overrides.find((o) => o.budgetItemId === item.id && o.month === currentMonth);

  const handleTogglePaid = async (item: BudgetItem) => {
    const override = getOverride(item);
    const isPaid = override?.isPaid ?? false;
    try {
      const data = {
        userId: user.uid,
        budgetItemId: item.id!,
        month: currentMonth,
        amount: getEffectiveAmount(item),
        isPaid: !isPaid,
        paidDate: !isPaid ? new Date().toISOString().slice(0, 10) : null,
        note: override?.note ?? null,
        updatedAt: serverTimestamp(),
      };
      if (override?.id) {
        await updateDoc(doc(db, 'budgetMonthOverrides', override.id), data);
      } else {
        await addDoc(collection(db, 'budgetMonthOverrides'), data);
      }
      toast.success(isPaid ? 'Marked pending' : '✅ Marked paid!');
    } catch (e) {
      console.error(e);
      toast.error('Failed');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Delete this goal?')) return;
    try {
      await deleteDoc(doc(db, 'savingGoals', id));
      toast.success('Deleted!');
    } catch {
      toast.error('Failed');
    }
  };

  // Stats
  const uaeItems = savingsItems.filter((i) => i.country === 'UAE');
  const indiaItems = savingsItems.filter((i) => i.country === 'India');
  const uaeTotal = uaeItems.reduce((s, i) => s + getEffectiveAmount(i), 0);
  const indiaTotal = indiaItems.reduce((s, i) => s + getEffectiveAmount(i), 0);
  const paidItems = savingsItems.filter((i) => getOverride(i)?.isPaid);
  const pendingItems = savingsItems.filter((i) => !getOverride(i)?.isPaid);

  // Goal stats
  const completedGoals = goals.filter((g) => g.currentAmount >= g.targetAmount).length;
  const totalAEDGoals = goals.filter((g) => g.currency === 'AED')
    .reduce((s, g) => s + g.currentAmount, 0);
  const totalINRGoals = goals.filter((g) => g.currency === 'INR')
    .reduce((s, g) => s + g.currentAmount, 0);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: '16px',
      }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading savings…</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: '24px',
        flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PiggyBank size={26} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Savings
            </h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '4px' }}>
            Monthly commitments & savings goals
          </p>
        </div>

        {activeTab === 'goals' && (
          <button
            onClick={() => { setEditingGoal(null); setShowGoalModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '9px 16px', borderRadius: '10px',
              background: 'var(--primary)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
            }}
          >
            <Plus size={15} /> Add Goal
          </button>
        )}
      </div>

      {/* Tab Switcher */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        background: 'var(--card)', padding: '4px',
        borderRadius: '12px', border: '1px solid var(--border)',
        width: 'fit-content',
      }}>
        {([
          { key: 'commitments', label: '📌 Monthly Commitments' },
          { key: 'goals', label: '🎯 Savings Goals' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: '9px', border: 'none',
              background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'var(--muted)',
              cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 1 — Monthly Commitments (from Budget savings items)        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'commitments' && (
        <>
          {/* Month Nav */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '16px', flexWrap: 'wrap', gap: '10px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: '10px', overflow: 'hidden',
            }}>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                style={{
                  padding: '8px 12px', border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <div style={{
                padding: '8px 16px', fontSize: '14px', fontWeight: 700,
                color: 'var(--text)', borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                minWidth: '160px', textAlign: 'center',
              }}>
                {getMonthLabel(currentMonth)}
              </div>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                style={{
                  padding: '8px 12px', border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {currentMonth !== getCurrentMonth() && (
              <button
                onClick={() => setCurrentMonth(getCurrentMonth())}
                style={{
                  padding: '7px 12px', borderRadius: '8px',
                  border: '1px solid var(--primary)',
                  background: 'rgba(99,102,241,0.08)',
                  color: 'var(--primary)', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                }}
              >
                This Month
              </button>
            )}
          </div>

          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '10px', marginBottom: '20px',
          }}>
            {[
              {
                label: '🇦🇪 UAE Savings',
                value: formatAmt(uaeTotal, 'AED'),
                color: 'var(--success)',
              },
              {
                label: '🇮🇳 India Savings',
                value: formatAmt(indiaTotal, 'INR'),
                color: 'var(--success)',
              },
              {
                label: '✅ Paid',
                value: `${paidItems.length} / ${savingsItems.length}`,
                color: paidItems.length === savingsItems.length && savingsItems.length > 0
                  ? 'var(--success)' : 'var(--warning)',
              },
              {
                label: '⏳ Pending',
                value: String(pendingItems.length),
                color: pendingItems.length > 0 ? 'var(--danger)' : 'var(--success)',
              },
            ].map((s) => (
              <div key={s.label} style={{
                padding: '14px', borderRadius: '12px',
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {savingsItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <PiggyBank size={40} style={{ marginBottom: '12px', opacity: 0.3, color: 'var(--muted)' }} />
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                No savings commitments yet
              </p>
              <p style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '4px' }}>
                Go to Budget screen → Add item → Select "💰 Savings"
              </p>
              <div style={{
                marginTop: '16px', padding: '12px 16px', borderRadius: '10px',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                fontSize: '13px', color: 'var(--primary)',
              }}>
                💡 Add EMI, Chitti, SIP, RD etc. in Budget as Savings type
              </div>
            </div>
          ) : (
            <>
              {/* UAE Section */}
              {uaeItems.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 700, color: 'var(--text)',
                    marginBottom: '10px', padding: '8px 12px',
                    background: 'rgba(99,102,241,0.08)', borderRadius: '8px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>🇦🇪 UAE Savings Commitments</span>
                    <span style={{ color: 'var(--success)', fontSize: '12px' }}>
                      {formatAmt(uaeTotal, 'AED')}
                    </span>
                  </div>
                  {uaeItems.map((item) => {
                    const override = getOverride(item);
                    const isPaid = override?.isPaid ?? false;
                    const amount = getEffectiveAmount(item);
                    const catInfo = item.savingsCategory
                      ? SAVINGS_CATEGORY_LABELS[item.savingsCategory]
                      : null;

                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 14px', borderRadius: '12px',
                        background: isPaid ? 'rgba(16,185,129,0.06)' : 'var(--card)',
                        border: `1px solid ${isPaid ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                        marginBottom: '8px',
                      }}>
                        {/* Paid toggle */}
                        <button
                          onClick={() => handleTogglePaid(item)}
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${isPaid ? 'var(--success)' : 'var(--border)'}`,
                            background: isPaid ? 'var(--success)' : 'transparent',
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isPaid && <Check size={14} color="#fff" />}
                        </button>

                        {/* Icon */}
                        <span style={{ fontSize: '20px', flexShrink: 0 }}>
                          {catInfo?.icon ?? '💰'}
                        </span>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px', fontWeight: 600,
                            color: isPaid ? 'var(--muted)' : 'var(--text)',
                            textDecoration: isPaid ? 'line-through' : 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                            {catInfo?.label ?? 'Savings'}
                            {isPaid && override?.paidDate && (
                              <span style={{ color: 'var(--success)', marginLeft: '8px' }}>
                                ✓ Paid {override.paidDate}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Amount */}
                        <div style={{
                          fontWeight: 700, fontSize: '14px',
                          color: isPaid ? 'var(--muted)' : 'var(--success)',
                          flexShrink: 0,
                        }}>
                          {formatAmt(amount, 'AED')}
                        </div>

                        {/* Status badge */}
                        <div style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px',
                          fontWeight: 700, flexShrink: 0,
                          background: isPaid
                            ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                          color: isPaid ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {isPaid ? '✅ Paid' : '⏳ Pending'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* India Section */}
              {indiaItems.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '13px', fontWeight: 700, color: 'var(--text)',
                    marginBottom: '10px', padding: '8px 12px',
                    background: 'rgba(99,102,241,0.08)', borderRadius: '8px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>🇮🇳 India Savings Commitments</span>
                    <span style={{ color: 'var(--success)', fontSize: '12px' }}>
                      {formatAmt(indiaTotal, 'INR')}
                    </span>
                  </div>
                  {indiaItems.map((item) => {
                    const override = getOverride(item);
                    const isPaid = override?.isPaid ?? false;
                    const amount = getEffectiveAmount(item);
                    const catInfo = item.savingsCategory
                      ? SAVINGS_CATEGORY_LABELS[item.savingsCategory]
                      : null;

                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 14px', borderRadius: '12px',
                        background: isPaid ? 'rgba(16,185,129,0.06)' : 'var(--card)',
                        border: `1px solid ${isPaid ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                        marginBottom: '8px',
                      }}>
                        <button
                          onClick={() => handleTogglePaid(item)}
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${isPaid ? 'var(--success)' : 'var(--border)'}`,
                            background: isPaid ? 'var(--success)' : 'transparent',
                            cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isPaid && <Check size={14} color="#fff" />}
                        </button>

                        <span style={{ fontSize: '20px', flexShrink: 0 }}>
                          {catInfo?.icon ?? '💰'}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '14px', fontWeight: 600,
                            color: isPaid ? 'var(--muted)' : 'var(--text)',
                            textDecoration: isPaid ? 'line-through' : 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                            {catInfo?.label ?? 'Savings'}
                            {isPaid && override?.paidDate && (
                              <span style={{ color: 'var(--success)', marginLeft: '8px' }}>
                                ✓ Paid {override.paidDate}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{
                          fontWeight: 700, fontSize: '14px',
                          color: isPaid ? 'var(--muted)' : 'var(--success)',
                          flexShrink: 0,
                        }}>
                          {formatAmt(amount, 'INR')}
                        </div>

                        <div style={{
                          padding: '4px 10px', borderRadius: '20px', fontSize: '11px',
                          fontWeight: 700, flexShrink: 0,
                          background: isPaid
                            ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                          color: isPaid ? 'var(--success)' : 'var(--danger)',
                        }}>
                          {isPaid ? '✅ Paid' : '⏳ Pending'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tip */}
              <div style={{
                padding: '12px 16px', borderRadius: '10px',
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.15)',
                fontSize: '12px', color: 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <AlertCircle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                To add/edit savings commitments, go to the Budget screen
                and add items with "💰 Savings" category type.
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 2 — Savings Goals                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'goals' && (
        <>
          {/* Goals Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '10px', marginBottom: '20px',
          }}>
            {[
              {
                label: '🇦🇪 Saved (UAE)',
                value: formatAmt(totalAEDGoals, 'AED'),
                color: 'var(--success)',
              },
              {
                label: '🇮🇳 Saved (India)',
                value: formatAmt(totalINRGoals, 'INR'),
                color: 'var(--success)',
              },
              {
                label: '🎯 Completed',
                value: `${completedGoals} / ${goals.length}`,
                color: 'var(--primary)',
              },
            ].map((s) => (
              <div key={s.label} style={{
                padding: '14px', borderRadius: '12px',
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: s.color }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {goals.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
              <Target size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                No savings goals yet
              </p>
              <p style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '4px' }}>
                Add goals like Emergency Fund, Gold, Vacation, Bike
              </p>
              <button
                onClick={() => { setEditingGoal(null); setShowGoalModal(true); }}
                style={{
                  marginTop: '16px', padding: '10px 20px', borderRadius: '10px',
                  border: 'none', background: 'var(--primary)', color: '#fff',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                }}
              >
                + Add First Goal
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}>
              {goals.map((goal) => {
                const progress = goal.targetAmount
                  ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                  : 0;
                const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
                const isCompleted = goal.currentAmount >= goal.targetAmount;

                // Monthly needed
                let monthlyNeeded: number | null = null;
                if (goal.deadline && remaining > 0) {
                  const today = new Date();
                  const end = new Date(goal.deadline);
                  const months =
                    (end.getFullYear() - today.getFullYear()) * 12 +
                    (end.getMonth() - today.getMonth()) + 1;
                  monthlyNeeded = months > 0 ? remaining / months : remaining;
                }

                return (
                  <div key={goal.id} className="card" style={{ padding: '20px' }}>
                    {/* Card Header */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: '14px',
                    }}>
                      <div>
                        <div style={{
                          fontWeight: 800, fontSize: '16px', color: 'var(--text)',
                          display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                          {goal.name}
                          {isCompleted && (
                            <span style={{
                              fontSize: '11px', padding: '2px 8px',
                              borderRadius: '20px', background: 'rgba(16,185,129,0.12)',
                              color: 'var(--success)', fontWeight: 700,
                            }}>
                              ✅ Done
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                          {goal.country === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
                          {goal.deadline ? ` · 🗓 ${goal.deadline}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => { setEditingGoal(goal); setShowGoalModal(true); }}
                          style={{
                            padding: '6px', borderRadius: '8px',
                            border: '1px solid var(--border)', background: 'var(--bg)',
                            cursor: 'pointer', color: 'var(--muted)',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id!)}
                          style={{
                            padding: '6px', borderRadius: '8px',
                            border: '1px solid var(--border)', background: 'var(--bg)',
                            cursor: 'pointer', color: 'var(--danger)',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginBottom: '6px', fontSize: '12px',
                      }}>
                        <span style={{ color: 'var(--muted)' }}>Progress</span>
                        <span style={{ fontWeight: 700, color: isCompleted ? 'var(--success)' : 'var(--text)' }}>
                          {progress.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{
                        width: '100%', height: '10px',
                        background: 'var(--border)', borderRadius: '999px', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${progress}%`, height: '100%', borderRadius: '999px',
                          background: isCompleted
                            ? 'var(--success)'
                            : 'linear-gradient(90deg, var(--primary), #8b5cf6)',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>

                    {/* Stats */}
                    {[
                      {
                        label: 'Saved',
                        value: formatAmt(goal.currentAmount, goal.currency),
                        color: 'var(--success)',
                      },
                      {
                        label: 'Target',
                        value: formatAmt(goal.targetAmount, goal.currency),
                        color: 'var(--text)',
                      },
                      {
                        label: 'Remaining',
                        value: formatAmt(remaining, goal.currency),
                        color: 'var(--warning)',
                      },
                      ...(monthlyNeeded !== null ? [{
                        label: 'Monthly Needed',
                        value: formatAmt(monthlyNeeded, goal.currency),
                        color: 'var(--primary)',
                      }] : []),
                    ].map((row) => (
                      <div key={row.label} style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '13px', marginBottom: '6px',
                      }}>
                        <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                        <span style={{ fontWeight: 700, color: row.color }}>{row.value}</span>
                      </div>
                    ))}

                    {goal.note && (
                      <div style={{
                        marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
                        background: 'var(--bg)', fontSize: '12px', color: 'var(--muted)',
                        borderLeft: '3px solid var(--primary)',
                      }}>
                        {goal.note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <GoalModal
          user={user}
          editingGoal={editingGoal}
          onClose={() => { setShowGoalModal(false); setEditingGoal(null); }}
        />
      )}
    </div>
  );
}