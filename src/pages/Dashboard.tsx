import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  TrendingUp as NetWorthIcon,
  CreditCard,
  Target,
  Edit2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import TransactionEditor from '../components/TransactionEditor';
import {
  getTabbyDueForMonth,
  getTabbyAvailableLimit,
  getTabbyOutstanding,
} from '../firestoreHelpers';
import type { TabbyPurchaseEMI } from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'AED' | 'INR';
  category: string;
  date: string;
  paymentMethod?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  paymentMethodType?: string;
  note?: string;
  fromMethod?: string;
  toMethod?: string;
  userId: string;
  country?: string;
  isReversed?: boolean;
}

interface PaymentMethod {
  id: string;
  userId?: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  currency?: string;
  color?: string;
  bankName?: string;
  isCashDefault?: boolean;
  creditLimit?: number;
  tabbyProEnabled?: boolean;
  tabbyEmis?: TabbyPurchaseEMI[];
  isDeleted?: boolean;
}

interface OpeningBalance {
  id?: string;
  userId: string;
  uaeCash: number;
  indiaCash: number;
  perMethod: Record<string, number>;
  asOf: string;
}

interface SavingGoal {
  id: string;
  userId: string;
  currentAmount: number;
  currency: 'AED' | 'INR';
}

interface Debt {
  id: string;
  userId: string;
  debtMode?: 'i_owe' | 'owed_to_me';
  debtView?: 'i_owe' | 'owed_to_me';
  type?: 'i_owe' | 'owed_to_me';
  totalAmount?: number;
  paidAmount?: number;
  currency: 'AED' | 'INR';
}

type ModalType = 'none' | 'income' | 'expense' | 'transfer';

// ─── Constants ────────────────────────────────────────────────────────────────

const INCOME_CATEGORIES  = ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other'];
const EXPENSE_CATEGORIES = ['Rent', 'Food', 'Transport', 'Shopping', 'Medical', 'Education', 'Entertainment', 'Utilities', 'Other'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'block', fontWeight: 600,
};

const cardTypeIcon: Record<string, string> = {
  credit: '💳',
  debit:  '🏦',
  tabby:  '🛒',
  cash:   '💵',
  upi:    '📱',
  custom: '➕',
};

// ─── AED Mark SVG ─────────────────────────────────────────────────────────────

function AEDMark({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="AED"
      style={{ display: 'inline-block', flexShrink: 0 }}>
      <path d="M7 4h5.6c4.4 0 7.4 3 7.4 8s-3 8-7.4 8H7V4Z"
        stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 9h12.8"  stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3.5 15h12.8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(value: number) {
  return Math.abs(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatINR(value: number) {
  return Math.abs(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function getMonthLabel(month: string) {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(year, (monthNo || 1) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function shiftMonth(month: string, diff: number) {
  const [year, monthNo] = month.split('-').map(Number);
  const d = new Date(year, (monthNo || 1) - 1 + diff, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// FIXED: use debtMode (new field) with fallbacks to old fields
function getDebtType(d: Debt): 'i_owe' | 'owed_to_me' {
  return d.debtMode ?? d.debtView ?? d.type ?? 'i_owe';
}

// FIXED: use (totalAmount - paidAmount), not remainingAmount
function getDebtRemaining(d: Debt): number {
  const total = d.totalAmount ?? 0;
  const paid  = d.paidAmount  ?? 0;
  return Math.max(0, total - paid);
}

// ─── Tabby Due Widget ─────────────────────────────────────────────────────────

interface TabbyDueWidgetProps {
  methods: PaymentMethod[];
  currentMonth: string;
}

function TabbyDueWidget({ methods, currentMonth }: TabbyDueWidgetProps) {
  const tabbyMethods = methods.filter(m => m.type === 'tabby' && !m.isDeleted);
  if (tabbyMethods.length === 0) return null;

  let totalDue         = 0;
  let totalOutstanding = 0;
  let totalLimit       = 0;
  let totalAvailable   = 0;

  tabbyMethods.forEach(m => {
    const emis = (m.tabbyEmis || []) as TabbyPurchaseEMI[];
    const { totalDue: due } = getTabbyDueForMonth(emis, currentMonth);
    totalDue         += due;
    totalOutstanding += getTabbyOutstanding(emis);
    totalLimit       += (m.creditLimit || 0);
    totalAvailable   += getTabbyAvailableLimit(m.creditLimit || 0, emis);
  });

  // Only render if there's something to show
  if (totalOutstanding === 0 && totalDue === 0) return null;

  // Due date info (use first tabby method's due day)
  const dueDay     = tabbyMethods[0]?.dueDate || 3;
  const today      = new Date();
  const dueDate    = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const daysLeft   = Math.floor((dueDate.getTime() - today.getTime()) / 86_400_000);
  const dueColor   = daysLeft > 7 ? '#10b981' : daysLeft >= 0 ? '#f59e0b' : '#ef4444';
  const dueText    = daysLeft > 0
    ? `Due in ${daysLeft} days (${dueDay}${dueDay === 1 ? 'st' : dueDay === 2 ? 'nd' : dueDay === 3 ? 'rd' : 'th'})`
    : daysLeft === 0 ? 'Due TODAY'
    : `${Math.abs(daysLeft)}d overdue`;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.05))',
      border: '1px solid rgba(139,92,246,0.3)',
      borderRadius: 20, padding: '18px 16px', marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(139,92,246,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            🛒
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8b5cf6' }}>
              Tabby
              {tabbyMethods[0]?.tabbyProEnabled && (
                <span style={{
                  marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', fontWeight: 700,
                }}>
                  PRO
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>BNPL Account</div>
          </div>
        </div>
        {/* Due badge */}
        {totalDue > 0 && (
          <div style={{
            padding: '4px 10px', borderRadius: 20,
            background: `${dueColor}15`, color: dueColor,
            fontSize: 11, fontWeight: 700, border: `1px solid ${dueColor}30`,
          }}>
            {dueText}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          {
            label: 'Due This Month',
            value: totalDue > 0 ? `AED ${formatNumber(totalDue)}` : 'Nothing due',
            color: totalDue > 0 ? '#8b5cf6' : '#10b981',
            highlight: totalDue > 0,
          },
          {
            label: 'Outstanding',
            value: `AED ${formatNumber(totalOutstanding)}`,
            color: totalOutstanding > 0 ? '#ef4444' : '#10b981',
            highlight: false,
          },
          {
            label: 'Available',
            value: `AED ${formatNumber(totalAvailable)}`,
            color: '#10b981',
            highlight: false,
          },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.highlight
              ? 'rgba(139,92,246,0.12)'
              : 'rgba(0,0,0,0.15)',
            borderRadius: 12, padding: '10px 12px', textAlign: 'center',
            border: stat.highlight ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Limit bar */}
      {totalLimit > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.min(100, (totalOutstanding / totalLimit) * 100)}%`,
              background: totalOutstanding / totalLimit > 0.8 ? '#ef4444' : '#8b5cf6',
              transition: 'width 0.5s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span>Limit: AED {formatNumber(totalLimit)}</span>
            <span style={{ color: '#8b5cf6' }}>
              {totalLimit > 0 ? ((totalOutstanding / totalLimit) * 100).toFixed(1) : 0}% used
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard({ user }: { user: User }) {
  if (!user || !user.uid) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
        Loading user...
      </div>
    );
  }

  const userId   = user.uid;
  const firstName = user.displayName?.split(' ')[0] ?? 'Friend';

  // ── State ──────────────────────────────────────────────────────────────────

  const [selectedMonth,   setSelectedMonth]   = useState(getCurrentMonth());
  const [modal,           setModal]           = useState<ModalType>('none');
  const [transactions,    setTransactions]    = useState<Transaction[]>([]);
  const [paymentMethods,  setPaymentMethods]  = useState<PaymentMethod[]>([]);
  const [openingBal,      setOpeningBal]      = useState<OpeningBalance | null>(null);
  const [savingGoals,     setSavingGoals]     = useState<SavingGoal[]>([]);
  const [debts,           setDebts]           = useState<Debt[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [editingTxId,     setEditingTxId]     = useState<string | null>(null);
  const [aedToInr,        setAedToInr]        = useState(22.8);

  // Form state
  const [amount,        setAmount]        = useState('');
  const [currency,      setCurrency]      = useState<'AED' | 'INR'>('AED');
  const [category,      setCategory]      = useState('');
  const [date,          setDate]          = useState(getToday());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [note,          setNote]          = useState('');
  const [fromMethod,    setFromMethod]    = useState('');
  const [toMethod,      setToMethod]      = useState('');

  // ── Listeners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Transactions
    unsubs.push(onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', userId)),
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Transaction))
          .filter(t => t.date && !t.isReversed)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        setTransactions(list);
        setLoading(false);
      },
      () => setLoading(false)
    ));

    // Payment methods (include tabbyEmis)
    unsubs.push(onSnapshot(
      query(collection(db, 'paymentMethods'), where('userId', '==', userId)),
      snap => {
        setPaymentMethods(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() } as PaymentMethod))
            .filter(pm => pm.id && !pm.isDeleted)
        );
      }
    ));

    // Opening balances
    unsubs.push(onSnapshot(
      query(collection(db, 'openingBalances'), where('userId', '==', userId)),
      snap => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data  = first.data() as OpeningBalance;
          setOpeningBal({
            id: first.id, userId: data.userId,
            uaeCash: data.uaeCash ?? 0, indiaCash: data.indiaCash ?? 0,
            perMethod: data.perMethod && typeof data.perMethod === 'object'
              ? { ...data.perMethod } : {},
            asOf: data.asOf ?? getToday(),
          });
        } else {
          setOpeningBal(null);
        }
      }
    ));

    // Saving goals
    unsubs.push(onSnapshot(
      query(collection(db, 'savingGoals'), where('userId', '==', userId)),
      snap => setSavingGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavingGoal)))
    ));

    // Debts
    unsubs.push(onSnapshot(
      query(collection(db, 'debts'), where('userId', '==', userId)),
      snap => setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Debt)))
    ));

    // User prefs (aedToInr)
    unsubs.push(onSnapshot(
      query(collection(db, 'userPrefs'), where('userId', '==', userId)),
      snap => {
        if (!snap.empty) {
          const data = snap.docs[0].data();
          if (data?.aedToInr && typeof data.aedToInr === 'number') {
            setAedToInr(data.aedToInr);
          }
        }
      }
    ));

    return () => unsubs.forEach(u => u());
  }, [userId]);

  // ── Balance calculation ────────────────────────────────────────────────────

  const getMethodBalance = (pmId: string): number => {
    const pm = paymentMethods.find(m => m.id === pmId);

    // Tabby: use tabbyEmis outstanding
    if (pm?.type === 'tabby') {
      return getTabbyOutstanding((pm.tabbyEmis || []) as TabbyPurchaseEMI[]);
    }

    const opening = openingBal?.perMethod?.[pmId] ?? 0;
    const asOf    = openingBal?.asOf ?? '1970-01-01';

    return transactions.reduce((sum, tx) => {
      if (tx.date <= asOf) return sum;    // FIXED: > asOf
      if (tx.isReversed)   return sum;
      if (tx.type === 'income'   && tx.paymentMethodId === pmId) return sum + tx.amount;
      if (tx.type === 'expense'  && tx.paymentMethodId === pmId) return sum - tx.amount;
      if (tx.type === 'transfer') {
        if (tx.fromMethod === pmId) return sum - tx.amount;
        if (tx.toMethod   === pmId) return sum + tx.amount;
      }
      return sum;
    }, opening);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  // Exclude Tabby from liquid balance (it's a liability, not an asset)
  const uaeOnlyMethods   = paymentMethods.filter(pm =>
    (pm.country === 'UAE' || pm.country === 'Both') && pm.type !== 'tabby'
  );
  const indiaOnlyMethods = paymentMethods.filter(pm => pm.country === 'India');

  const totalUAEBalance   = uaeOnlyMethods.reduce((s, pm) => s + getMethodBalance(pm.id), 0);
  const totalIndiaBalance = indiaOnlyMethods.reduce((s, pm) => s + getMethodBalance(pm.id), 0);

  // Tabby outstanding = liability
  const tabbyMethods      = paymentMethods.filter(pm => pm.type === 'tabby');
  const tabbyLiabilityAED = tabbyMethods.reduce((s, pm) =>
    s + getTabbyOutstanding((pm.tabbyEmis || []) as TabbyPurchaseEMI[]), 0
  );

  // Savings goals
  const savingsAED = savingGoals.filter(g => g.currency === 'AED').reduce((s, g) => s + (g.currentAmount ?? 0), 0);
  const savingsINR = savingGoals.filter(g => g.currency === 'INR').reduce((s, g) => s + (g.currentAmount ?? 0), 0);

  // Debts — FIXED: uses debtMode + (totalAmount - paidAmount)
  const receivablesAED = debts
    .filter(d => getDebtType(d) === 'owed_to_me' && d.currency === 'AED')
    .reduce((s, d) => s + getDebtRemaining(d), 0);
  const liabilitiesAED = debts
    .filter(d => getDebtType(d) === 'i_owe' && d.currency === 'AED')
    .reduce((s, d) => s + getDebtRemaining(d), 0);
  const receivablesINR = debts
    .filter(d => getDebtType(d) === 'owed_to_me' && d.currency === 'INR')
    .reduce((s, d) => s + getDebtRemaining(d), 0);
  const liabilitiesINR = debts
    .filter(d => getDebtType(d) === 'i_owe' && d.currency === 'INR')
    .reduce((s, d) => s + getDebtRemaining(d), 0);

  // Net worth — FIXED: Tabby liability included
  const netWorthAED = (
    totalUAEBalance
    + (totalIndiaBalance / aedToInr)
    + savingsAED
    + (savingsINR / aedToInr)
    + receivablesAED
    + (receivablesINR / aedToInr)
    - liabilitiesAED
    - (liabilitiesINR / aedToInr)
    - tabbyLiabilityAED   // ← NEW: Tabby as liability
  );

  // Monthly summary
  const monthTx = transactions.filter(t =>
    typeof t.date === 'string' && t.date.startsWith(selectedMonth)
  );
  const aedIncome  = monthTx.filter(t => t.type === 'income'  && t.currency === 'AED').reduce((s, t) => s + (t.amount || 0), 0);
  const aedExpense = monthTx.filter(t => t.type === 'expense' && t.currency === 'AED').reduce((s, t) => s + (t.amount || 0), 0);
  const inrIncome  = monthTx.filter(t => t.type === 'income'  && t.currency === 'INR').reduce((s, t) => s + (t.amount || 0), 0);
  const inrExpense = monthTx.filter(t => t.type === 'expense' && t.currency === 'INR').reduce((s, t) => s + (t.amount || 0), 0);

  const recentTransactions = transactions.slice(0, 10);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const resetForm = () => {
    setAmount(''); setCurrency('AED'); setCategory('');
    setDate(getToday()); setPaymentMethod('');
    setNote(''); setFromMethod(''); setToMethod('');
  };
  const openModal  = (type: ModalType) => { resetForm(); setModal(type); };
  const closeModal = () => { setModal('none'); resetForm(); };

  const validateAmount = () => {
    const n = parseFloat(amount);
    if (!amount || Number.isNaN(n) || n <= 0) { toast.error('Enter a valid amount'); return null; }
    return n;
  };

  const getMethodName = (id: string) =>
    paymentMethods.find(m => m.id === id)?.name ?? id;

  const modalMethods = currency === 'AED'
    ? paymentMethods.filter(pm => pm.country === 'UAE' || pm.country === 'Both')
    : paymentMethods.filter(pm => pm.country === 'India' || pm.country === 'Both');

  // ── Save handlers ──────────────────────────────────────────────────────────

  const saveIncome = async () => {
    const n = validateAmount();
    if (!n || !category || !paymentMethod || !date) {
      toast.error('Please fill all required fields'); return;
    }
    setSaving(true);
    try {
      const selectedPM = paymentMethods.find(m => m.id === paymentMethod);
      await addDoc(collection(db, 'transactions'), {
        userId, type: 'income', amount: n, currency, category, date,
        paymentMethodId: paymentMethod,
        paymentMethod:     selectedPM?.type ?? null,
        paymentMethodName: selectedPM?.name ?? null,
        paymentMethodType: selectedPM?.type ?? null,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      });
      toast.success('Income added ✓');
      closeModal();
    } catch (err) { console.error(err); toast.error('Failed to save income'); }
    finally { setSaving(false); }
  };

  const saveExpense = async () => {
    const n = validateAmount();
    if (!n || !category || !paymentMethod || !date) {
      toast.error('Please fill all required fields'); return;
    }
    setSaving(true);
    try {
      const selectedPM = paymentMethods.find(m => m.id === paymentMethod);
      await addDoc(collection(db, 'transactions'), {
        userId, type: 'expense', amount: n, currency, category, date,
        paymentMethodId: paymentMethod,
        paymentMethod:     selectedPM?.type ?? null,
        paymentMethodName: selectedPM?.name ?? null,
        paymentMethodType: selectedPM?.type ?? null,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      });
      toast.success('Expense added ✓');
      closeModal();
    } catch (err) { console.error(err); toast.error('Failed to save expense'); }
    finally { setSaving(false); }
  };

  const saveTransfer = async () => {
    const n = validateAmount();
    if (!n || !fromMethod || !toMethod || !date) {
      toast.error('Please fill all required fields'); return;
    }
    if (fromMethod === toMethod) { toast.error('From and To cannot be same'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId, type: 'transfer', amount: n, currency,
        category: 'Transfer', date,
        paymentMethodId: fromMethod, fromMethod, toMethod,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      });
      toast.success('Transfer recorded ✓');
      closeModal();
    } catch (err) { console.error(err); toast.error('Failed to save transfer'); }
    finally { setSaving(false); }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────

  const getTypeColor = (type: string) =>
    type === 'income' ? 'var(--success)' : type === 'expense' ? 'var(--danger)' : 'var(--primary)';

  const getTypeIcon = (type: string) =>
    type === 'income'   ? <TrendingUp   size={17} color="var(--success)" />
    : type === 'expense' ? <TrendingDown size={17} color="var(--danger)"  />
    :                      <ArrowLeftRight size={17} color="var(--primary)" />;

  const CurrencyToggle = () => (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={labelStyle}>Currency *</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['AED', 'INR'] as const).map(c => {
          const active = currency === c;
          return (
            <button key={c} type="button"
              onClick={() => { setCurrency(c); setPaymentMethod(''); }}
              style={{
                padding: '11px 10px', borderRadius: 12,
                border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'var(--primary)' : 'var(--card)',
                color: active ? '#fff' : 'var(--text)',
                fontWeight: 800, cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {c === 'AED'
                ? <><AEDMark size={16} color={active ? '#fff' : 'var(--text)'} /> AED</>
                : <>₹ INR</>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const AmountInput = () => (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={labelStyle}>Amount *</label>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          fontWeight: 800, pointerEvents: 'none',
        }}>
          {currency === 'AED' ? <AEDMark size={18} /> : '₹'}
        </div>
        <input type="number" inputMode="decimal" placeholder="0.00" value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{ ...inputStyle, fontSize: 22, fontWeight: 800, paddingLeft: currency === 'AED' ? 42 : 32 }}
        />
      </div>
    </div>
  );

  const MethodSelector = ({ label }: { label: string }) => (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={labelStyle}>{label} *</label>
      {modalMethods.length === 0 ? (
        <div style={{
          padding: 12, borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 13, color: 'var(--danger)',
        }}>
          No payment methods for {currency === 'AED' ? 'UAE' : 'India'}. Add one in Cards.
        </div>
      ) : (
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={inputStyle}>
          <option value="">Select method</option>
          {modalMethods.map(m => (
            <option key={m.id} value={m.id}>
              {cardTypeIcon[m.type] || '💳'} {m.name}
              {m.bankName ? ` (${m.bankName})` : ''}
              {m.tabbyProEnabled ? ' — PRO' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const renderModalContent = () => {
    if (modal === 'transfer') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AmountInput /><CurrencyToggle />
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>From *</label>
            <select value={fromMethod} onChange={e => setFromMethod(e.target.value)} style={inputStyle}>
              <option value="">Select source</option>
              {paymentMethods.map(m => (
                <option key={m.id} value={m.id}>
                  {cardTypeIcon[m.type] || '💳'} {m.name}
                  {m.bankName ? ` (${m.bankName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '2px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(99,102,241,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={18} color="var(--primary)" />
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>To *</label>
            <select value={toMethod} onChange={e => setToMethod(e.target.value)} style={inputStyle}>
              <option value="">Select destination</option>
              {paymentMethods.map(m => (
                <option key={m.id} value={m.id}>
                  {cardTypeIcon[m.type] || '💳'} {m.name}
                  {m.bankName ? ` (${m.bankName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Note</label>
            <input type="text" placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
          </div>
        </div>
      );
    }

    const cats = modal === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <AmountInput /><CurrencyToggle />
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Category *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cats.map(c => {
              const active = category === c;
              return (
                <button key={c} type="button" onClick={() => setCategory(c)}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary)' : 'var(--card)',
                    color: active ? '#fff' : 'var(--text)',
                    fontSize: 13, cursor: 'pointer', fontWeight: 700,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <MethodSelector label={modal === 'income' ? 'Received Into' : 'Payment Method'} />
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Date *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Note</label>
          <input type="text" placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Welcome back,</div>
          <div style={{ fontSize: 25, fontWeight: 900 }}>{firstName} 👋</div>
        </div>
        {openingBal && (
          <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: '6px 12px', fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>
            📅 Since {openingBal.asOf}
          </div>
        )}
      </div>

      {/* Opening balance warning */}
      {!openingBal && !loading && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 18, padding: '16px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <AlertTriangle size={22} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: 'var(--warning)', marginBottom: 4 }}>Opening Balance Not Set</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              Set your opening balance in Settings to see accurate balances per account.
            </div>
          </div>
        </div>
      )}

      {/* ── Balance section ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5, marginBottom: 10 }}>
          💰 CURRENT BALANCE
        </div>

        {/* UAE + India totals */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🇦🇪</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>UAE Total</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: totalUAEBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {totalUAEBalance < 0 ? '-' : ''}AED {formatNumber(totalUAEBalance)}
            </div>
          </div>
          <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>🇮🇳</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>India Total</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: totalIndiaBalance >= 0 ? 'var(--warning)' : 'var(--danger)' }}>
              {totalIndiaBalance < 0 ? '-' : ''}₹{formatINR(totalIndiaBalance)}
            </div>
          </div>
        </div>

        {/* ── TABBY DUE WIDGET — NEW ── */}
        <TabbyDueWidget methods={paymentMethods} currentMonth={getCurrentMonth()} />

        {/* Accounts list */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden', marginBottom: 12 }}>
          {/* UAE Accounts */}
          <div style={{ padding: '8px 16px', background: 'rgba(16,185,129,0.05)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--success)', letterSpacing: 0.5 }}>
            🇦🇪 UAE ACCOUNTS
          </div>
          {uaeOnlyMethods.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>No UAE payment methods</div>
          ) : uaeOnlyMethods.map((pm, i) => (
            <div key={pm.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i === uaeOnlyMethods.length - 1 ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: (pm.color || 'var(--success)') + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {cardTypeIcon[pm.type] || '💳'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pm.name}
                </div>
                {pm.bankName && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{pm.bankName}</div>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: getMethodBalance(pm.id) >= 0 ? (pm.color || 'var(--success)') : 'var(--danger)', whiteSpace: 'nowrap' }}>
                {getMethodBalance(pm.id) < 0 ? '-' : ''}AED {formatNumber(getMethodBalance(pm.id))}
              </div>
            </div>
          ))}

          {/* India Accounts */}
          <div style={{ padding: '8px 16px', background: 'rgba(245,158,11,0.05)', borderTop: '1px solid var(--border)', borderBottom: indiaOnlyMethods.length > 0 ? '1px solid var(--border)' : 'none', fontSize: 11, fontWeight: 800, color: 'var(--warning)', letterSpacing: 0.5 }}>
            🇮🇳 INDIA ACCOUNTS
          </div>
          {indiaOnlyMethods.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>No India payment methods</div>
          ) : indiaOnlyMethods.map((pm, i) => (
            <div key={pm.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderBottom: i === indiaOnlyMethods.length - 1 ? 'none' : '1px solid var(--border)',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: (pm.color || 'var(--warning)') + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {cardTypeIcon[pm.type] || '💳'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pm.name}
                </div>
                {pm.bankName && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{pm.bankName}</div>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: getMethodBalance(pm.id) >= 0 ? (pm.color || 'var(--warning)') : 'var(--danger)', whiteSpace: 'nowrap' }}>
                {getMethodBalance(pm.id) < 0 ? '-' : ''}₹{formatINR(getMethodBalance(pm.id))}
              </div>
            </div>
          ))}
        </div>

        {/* Net Worth Card */}
        <div style={{
          background: 'var(--card)',
          border: `1px solid ${netWorthAED >= 0 ? 'rgba(99,102,241,0.3)' : 'rgba(239,68,68,0.3)'}`,
          borderRadius: 20, padding: '18px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <NetWorthIcon size={18} color="var(--primary)" />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Net Worth</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  ₹ @ {aedToInr}/AED · Tabby as liability
                </div>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: netWorthAED >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
              {netWorthAED < 0 ? '-' : ''}AED {formatNumber(netWorthAED)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                <Wallet size={14} color="var(--success)" /> 🇦🇪 UAE Accounts
              </div>
              <span style={{ fontWeight: 700, color: totalUAEBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {totalUAEBalance < 0 ? '- ' : '+ '}AED {formatNumber(totalUAEBalance)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                <Wallet size={14} color="var(--warning)" /> 🇮🇳 India Accounts
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 700, color: totalIndiaBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {totalIndiaBalance < 0 ? '-' : '+'}₹{formatINR(totalIndiaBalance)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>
                  (≈ AED {formatNumber(totalIndiaBalance / aedToInr)})
                </span>
              </div>
            </div>

            {(savingsAED > 0 || savingsINR > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                  <Target size={14} color="var(--primary)" /> Savings Goals
                </div>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                  {savingsAED > 0 && `+ AED ${formatNumber(savingsAED)}`}
                  {savingsAED > 0 && savingsINR > 0 && ' · '}
                  {savingsINR > 0 && `+₹${formatINR(savingsINR)}`}
                </span>
              </div>
            )}

            {(receivablesAED > 0 || receivablesINR > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                  <CreditCard size={14} color="var(--success)" /> Owed to Me
                </div>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                  {receivablesAED > 0 && `+ AED ${formatNumber(receivablesAED)}`}
                  {receivablesAED > 0 && receivablesINR > 0 && ' · '}
                  {receivablesINR > 0 && `+₹${formatINR(receivablesINR)}`}
                </span>
              </div>
            )}

            {/* Liabilities */}
            {(liabilitiesAED > 0 || liabilitiesINR > 0 || tabbyLiabilityAED > 0) && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                {(liabilitiesAED > 0 || liabilitiesINR > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                      <CreditCard size={14} color="var(--danger)" /> I Owe (Debts)
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--danger)' }}>
                      {liabilitiesAED > 0 && `- AED ${formatNumber(liabilitiesAED)}`}
                      {liabilitiesAED > 0 && liabilitiesINR > 0 && ' · '}
                      {liabilitiesINR > 0 && `-₹${formatINR(liabilitiesINR)}`}
                    </span>
                  </div>
                )}
                {tabbyLiabilityAED > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                      <span style={{ fontSize: 14 }}>🛒</span> Tabby Outstanding
                    </div>
                    <span style={{ fontWeight: 700, color: '#8b5cf6' }}>
                      - AED {formatNumber(tabbyLiabilityAED)}
                    </span>
                  </div>
                )}
              </>
            )}

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Total Net Worth</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: netWorthAED >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                {netWorthAED < 0 ? '-' : ''}AED {formatNumber(netWorthAED)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Month selector ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 14, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSelectedMonth(m => shiftMonth(m, -1))}
          style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.6, marginBottom: 3 }}>MONTHLY SUMMARY</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{getMonthLabel(selectedMonth)}</div>
        </div>
        <input type="month" value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value || getCurrentMonth())}
          style={{ ...inputStyle, width: 150, padding: '9px 10px', fontWeight: 800 }}
        />
        <button type="button" onClick={() => setSelectedMonth(m => shiftMonth(m, 1))}
          style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── UAE Monthly ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5, marginBottom: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
          🇦🇪 UAE — <AEDMark size={14} color="var(--muted)" /> AED
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Income',  value: aedIncome,              color: 'var(--success)', icon: <TrendingUp   size={20} /> },
            { label: 'Expense', value: aedExpense,             color: 'var(--danger)',  icon: <TrendingDown size={20} /> },
            { label: 'Net',     value: aedIncome - aedExpense, color: (aedIncome - aedExpense) >= 0 ? 'var(--primary)' : 'var(--danger)', icon: <Wallet size={20} /> },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '16px 14px', border: '1px solid var(--border)', minHeight: 100, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ color: item.color }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: item.color, lineHeight: 1.2 }}>
                  {item.value < 0 ? '-' : ''}<AEDMark size={13} color={item.color} /> {formatNumber(item.value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── India Monthly ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5, marginBottom: 9 }}>
          🇮🇳 India — ₹ INR
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Income',  value: inrIncome,              color: 'var(--success)', icon: <TrendingUp   size={20} /> },
            { label: 'Expense', value: inrExpense,             color: 'var(--danger)',  icon: <TrendingDown size={20} /> },
            { label: 'Net',     value: inrIncome - inrExpense, color: (inrIncome - inrExpense) >= 0 ? 'var(--primary)' : 'var(--danger)', icon: <Wallet size={20} /> },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--card)', borderRadius: 16, padding: '16px 14px', border: '1px solid var(--border)', minHeight: 100, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ color: item.color }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: item.color, lineHeight: 1.2 }}>
                  {item.value < 0 ? '-' : ''}₹{formatINR(item.value)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5, marginBottom: 12 }}>
          QUICK ACTIONS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: 'Add Income',  icon: <TrendingUp    size={26} />, color: 'var(--success)', bg: 'rgba(16,185,129,0.12)',  type: 'income'   as ModalType },
            { label: 'Add Expense', icon: <TrendingDown  size={26} />, color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)',   type: 'expense'  as ModalType },
            { label: 'Transfer',    icon: <ArrowLeftRight size={26} />, color: 'var(--primary)', bg: 'rgba(99,102,241,0.12)', type: 'transfer' as ModalType },
          ].map(btn => (
            <button key={btn.label} type="button" onClick={() => openModal(btn.type)}
              style={{ background: btn.bg, border: `2px solid ${btn.color}`, borderRadius: 18, padding: '22px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: btn.color, fontWeight: 900, fontSize: 14 }}
            >
              {btn.icon}{btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent Transactions ── */}
      <div>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5, marginBottom: 12 }}>
          RECENT TRANSACTIONS
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Loading...</div>
          </div>
        ) : recentTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
            <DollarSign size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>No transactions yet</div>
            <div style={{ fontSize: 13, marginTop: 5 }}>Use the quick actions above!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {recentTransactions.map(tx => {
              const color  = getTypeColor(tx.type);
              const sign   = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
              const display = tx.currency === 'INR'
                ? `${sign}₹${formatINR(tx.amount)}`
                : `${sign}AED ${formatNumber(tx.amount)}`;
              const isTabby = tx.paymentMethodType === 'tabby';

              return (
                <div key={tx.id} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 17, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                  borderLeft: isTabby ? '3px solid #8b5cf6' : '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 14, background: `${color}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {getTypeIcon(tx.type)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.type === 'transfer'
                          ? `${getMethodName(tx.fromMethod ?? '')} → ${getMethodName(tx.toMethod ?? '')}`
                          : tx.category}
                        {isTabby && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#8b5cf6', fontWeight: 700 }}>
                            💳 4x
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.paymentMethodName ?? getMethodName(tx.paymentMethodId ?? '')}
                        {' · '}{tx.date}
                        {tx.note ? ` · ${tx.note}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color, whiteSpace: 'nowrap' }}>{display}</div>
                    <button
                      onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
                      onClick={e => { e.stopPropagation(); setEditingTxId(tx.id ?? null); }}
                      style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal !== 'none' && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
        >
          <div style={{ background: 'var(--card)', borderRadius: '26px 26px 0 0', padding: '24px 20px 44px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -20px 50px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: modal === 'income' ? 'rgba(16,185,129,0.15)' : modal === 'expense' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {modal === 'income'   && <TrendingUp    size={20} color="var(--success)" />}
                  {modal === 'expense'  && <TrendingDown  size={20} color="var(--danger)"  />}
                  {modal === 'transfer' && <ArrowLeftRight size={20} color="var(--primary)" />}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    {modal === 'income' ? 'Add Income' : modal === 'expense' ? 'Add Expense' : 'Transfer Funds'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {modal === 'transfer' ? 'Move money between accounts' : `Quick ${modal} entry`}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeModal}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 12, padding: 9, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            {renderModalContent()}
            <button type="button"
              onClick={modal === 'income' ? saveIncome : modal === 'expense' ? saveExpense : saveTransfer}
              disabled={saving}
              style={{
                width: '100%', marginTop: 20, padding: '15px', borderRadius: 15, border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                background: modal === 'income' ? 'var(--success)' : modal === 'expense' ? 'var(--danger)' : 'var(--primary)',
                color: '#fff', fontWeight: 900, fontSize: 16, opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : modal === 'income' ? 'Save Income' : modal === 'expense' ? 'Save Expense' : 'Confirm Transfer'}
            </button>
          </div>
        </div>
      )}

      {/* Transaction Editor */}
      {editingTxId && (
        <TransactionEditor
          user={user}
          transactionId={editingTxId}
          onClose={() => setEditingTxId(null)}
          onUpdate={() => {}}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}