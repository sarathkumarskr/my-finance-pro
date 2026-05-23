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
  IndianRupee,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Building2,
  Banknote,
  CreditCard,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'AED' | 'INR';
  category: string;
  date: string;
  paymentMethod: string;
  note?: string;
  fromMethod?: string;
  toMethod?: string;
  userId: string;
  country?: string;
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
  creditLimit?: number;
}

interface OpeningBalance {
  id?: string;
  userId: string;
  uaeCash: number;
  indiaCash: number;
  perMethod: Record<string, number>;
  asOf: string;
}

type ModalType = 'none' | 'income' | 'expense' | 'transfer';

// ── Constants ─────────────────────────────────────────────────────────────────

const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other',
];

const EXPENSE_CATEGORIES = [
  'Rent', 'Food', 'Transport', 'Shopping', 'Medical',
  'Education', 'Entertainment', 'Utilities', 'Other',
];

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  marginBottom: 6,
  display: 'block',
  fontWeight: 600,
};

// ── Helper Components ─────────────────────────────────────────────────────────

function AEDMark({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-label="AED" style={{ display: 'inline-block', flexShrink: 0 }}>
      <path d="M7 4h5.6c4.4 0 7.4 3 7.4 8s-3 8-7.4 8H7V4Z"
        stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 9h12.8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M3.5 15h12.8" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function formatNumber(value: number) {
  return Math.abs(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatINR(value: number) {
  return Math.abs(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function Money({
  amount, currency, sign = '', color, size = 14,
}: {
  amount: number; currency: 'AED' | 'INR';
  sign?: string; color?: string; size?: number;
}) {
  const finalSign = amount < 0 ? '-' : sign;
  const display = currency === 'INR' ? formatINR(amount) : formatNumber(amount);

  if (currency === 'INR') {
    return (
      <span style={{ color, fontWeight: 800, fontSize: size,
        display: 'inline-flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>
        {finalSign}₹{display}
      </span>
    );
  }
  return (
    <span style={{ color, fontWeight: 800, fontSize: size,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      {finalSign}{display}
      <AEDMark size={size} color={color || 'currentColor'} />
      <span style={{ fontSize: Math.max(size - 4, 10), opacity: 0.8 }}>AED</span>
    </span>
  );
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

const cardTypeIcon: Record<string, string> = {
  credit: '💳', debit: '🏦', tabby: '🛍️',
  cash: '💵', upi: '📱', custom: '➕',
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function Dashboard({ user }: { user: User }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [modal, setModal]                 = useState<ModalType>('none');
  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [openingBal, setOpeningBal]       = useState<OpeningBalance | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);

  // form
  const [amount, setAmount]               = useState('');
  const [currency, setCurrency]           = useState<'AED' | 'INR'>('AED');
  const [category, setCategory]           = useState('');
  const [date, setDate]                   = useState(getToday());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [note, setNote]                   = useState('');
  const [fromMethod, setFromMethod]       = useState('');
  const [toMethod, setToMethod]           = useState('');

  // ── Realtime listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;

    // Transactions
    const txUnsub = onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Transaction))
          .filter((t) => t.date)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        setTransactions(list);
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); }
    );

    // Payment Methods
    const pmUnsub = onSnapshot(
      query(collection(db, 'paymentMethods'), where('userId', '==', user.uid)),
      (snap) => {
        setPaymentMethods(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
            .filter((pm) => pm.id)
        );
      }
    );

    // Opening Balances
    const obUnsub = onSnapshot(
      query(collection(db, 'openingBalances'), where('userId', '==', user.uid)),
      (snap) => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data  = first.data() as OpeningBalance;
          setOpeningBal({
            id: first.id,
            userId: data.userId,
            uaeCash: data.uaeCash ?? 0,
            indiaCash: data.indiaCash ?? 0,
            perMethod: data.perMethod && typeof data.perMethod === 'object'
              ? { ...data.perMethod } : {},
            asOf: data.asOf ?? getToday(),
          });
        } else {
          setOpeningBal(null);
        }
      }
    );

    return () => { txUnsub(); pmUnsub(); obUnsub(); };
  }, [user.uid]);

  // ── Balance Calculation ─────────────────────────────────────────────────────

  /**
   * For each payment method: opening balance + income - expense
   * from openingBal.asOf date onwards, for that specific paymentMethod id.
   * Transfers: fromMethod → debit, toMethod → credit.
   */
  const getMethodCurrentBalance = (pmId: string): number => {
    const opening = openingBal?.perMethod?.[pmId] ?? 0;
    const asOf    = openingBal?.asOf ?? '1970-01-01';

    const delta = transactions
      .filter((tx) => tx.date >= asOf)
      .reduce((sum, tx) => {
        if (tx.type === 'income' && tx.paymentMethod === pmId) {
          return sum + (tx.amount ?? 0);
        }
        if (tx.type === 'expense' && tx.paymentMethod === pmId) {
          return sum - (tx.amount ?? 0);
        }
        if (tx.type === 'transfer') {
          if (tx.fromMethod === pmId) return sum - (tx.amount ?? 0);
          if (tx.toMethod   === pmId) return sum + (tx.amount ?? 0);
        }
        return sum;
      }, 0);

    return opening + delta;
  };

  // UAE cash current balance
  const getUAECashBalance = (): number => {
    const opening = openingBal?.uaeCash ?? 0;
    const asOf    = openingBal?.asOf ?? '1970-01-01';
    const delta   = transactions
      .filter((tx) => tx.date >= asOf && tx.currency === 'AED')
      .reduce((sum, tx) => {
        if (tx.paymentMethod === 'cash_aed' || tx.paymentMethod === 'cash') {
          if (tx.type === 'income')  return sum + (tx.amount ?? 0);
          if (tx.type === 'expense') return sum - (tx.amount ?? 0);
        }
        return sum;
      }, 0);
    return opening + delta;
  };

  // India cash current balance
  const getIndiaCashBalance = (): number => {
    const opening = openingBal?.indiaCash ?? 0;
    const asOf    = openingBal?.asOf ?? '1970-01-01';
    const delta   = transactions
      .filter((tx) => tx.date >= asOf && tx.currency === 'INR')
      .reduce((sum, tx) => {
        if (tx.paymentMethod === 'cash_inr') {
          if (tx.type === 'income')  return sum + (tx.amount ?? 0);
          if (tx.type === 'expense') return sum - (tx.amount ?? 0);
        }
        return sum;
      }, 0);
    return opening + delta;
  };

  // Grouped methods
  const uaeMethods    = paymentMethods.filter((pm) =>
    pm.country === 'UAE' || pm.country === 'Both'
  );
  const indiaMethods  = paymentMethods.filter((pm) =>
    pm.country === 'India' || pm.country === 'Both'
  );

  // Total UAE balance (cash + all UAE methods)
  const totalUAEBalance =
    (openingBal ? getUAECashBalance() : 0) +
    uaeMethods.reduce((sum, pm) => sum + getMethodCurrentBalance(pm.id), 0);

  // Total India balance
  const totalIndiaBalance =
    (openingBal ? getIndiaCashBalance() : 0) +
    indiaMethods.reduce((sum, pm) => sum + getMethodCurrentBalance(pm.id), 0);

  // ── Monthly summary (for selected month) ───────────────────────────────────

  const monthTx = transactions.filter(
    (t) => typeof t.date === 'string' && t.date.startsWith(selectedMonth)
  );

  const aedIncome  = monthTx.filter((t) => t.type === 'income'  && t.currency === 'AED').reduce((s, t) => s + (t.amount || 0), 0);
  const aedExpense = monthTx.filter((t) => t.type === 'expense' && t.currency === 'AED').reduce((s, t) => s + (t.amount || 0), 0);
  const inrIncome  = monthTx.filter((t) => t.type === 'income'  && t.currency === 'INR').reduce((s, t) => s + (t.amount || 0), 0);
  const inrExpense = monthTx.filter((t) => t.type === 'expense' && t.currency === 'INR').reduce((s, t) => s + (t.amount || 0), 0);

  const recentTransactions = transactions.slice(0, 10);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const getDefaultDate = () => {
    return selectedMonth === getCurrentMonth() ? getToday() : `${selectedMonth}-01`;
  };

  const resetForm = () => {
    setAmount(''); setCurrency('AED'); setCategory('');
    setDate(getDefaultDate()); setPaymentMethod('');
    setNote(''); setFromMethod(''); setToMethod('');
  };

  const openModal  = (type: ModalType) => { resetForm(); setModal(type); };
  const closeModal = () => { setModal('none'); resetForm(); };

  const validateAmount = () => {
    const n = parseFloat(amount);
    if (!amount || Number.isNaN(n) || n <= 0) { toast.error('Enter a valid amount'); return null; }
    return n;
  };

  const getMethodName = (id: string) => {
    if (!id) return '';
    if (id === 'cash_aed') return 'Cash AED';
    if (id === 'cash_inr') return 'Cash INR';
    if (id === 'cash')     return 'Cash';
    return paymentMethods.find((m) => m.id === id)?.name || id;
  };

  // ── Save handlers ───────────────────────────────────────────────────────────

  const saveIncome = async () => {
    const n = validateAmount();
    if (!n || !category || !paymentMethod || !date) {
      toast.error('Please fill all required fields'); return;
    }
    setSaving(true);
    try {
      const data = {
        userId: user.uid, type: 'income' as const,
        amount: n, currency, category, date, paymentMethod,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'transactions'), data);
      toast.success('Income added');
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
      const data = {
        userId: user.uid, type: 'expense' as const,
        amount: n, currency, category, date, paymentMethod,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'transactions'), data);
      toast.success('Expense added');
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
      const data = {
        userId: user.uid, type: 'transfer' as const,
        amount: n, currency, category: 'Transfer', date,
        paymentMethod: fromMethod, fromMethod, toMethod,
        note: note || null,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'transactions'), data);
      toast.success('Transfer recorded');
      closeModal();
    } catch (err) { console.error(err); toast.error('Failed to save transfer'); }
    finally { setSaving(false); }
  };

  // ── UI helpers ──────────────────────────────────────────────────────────────

  const getTypeColor = (type: string) => {
    if (type === 'income')   return 'var(--success)';
    if (type === 'expense')  return 'var(--danger)';
    return 'var(--primary)';
  };

  const getTypeIcon = (type: string) => {
    if (type === 'income')   return <TrendingUp size={17} color="var(--success)" />;
    if (type === 'expense')  return <TrendingDown size={17} color="var(--danger)" />;
    return <ArrowLeftRight size={17} color="var(--primary)" />;
  };

  const CurrencyToggle = () => (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={labelStyle}>Currency *</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['AED', 'INR'] as const).map((c) => {
          const active = currency === c;
          return (
            <button key={c} type="button" onClick={() => setCurrency(c)}
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
        <input type="number" inputMode="decimal" placeholder="0.00"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          style={{ ...inputStyle, fontSize: 22, fontWeight: 800,
            paddingLeft: currency === 'AED' ? 42 : 32 }}
        />
      </div>
    </div>
  );

  const CashOptions = () => (
    <>
      <option value="cash_aed">Cash AED</option>
      <option value="cash_inr">Cash INR</option>
    </>
  );

  const renderModalContent = () => {
    if (modal === 'transfer') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <AmountInput />
          <CurrencyToggle />
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>From *</label>
            <select value={fromMethod} onChange={(e) => setFromMethod(e.target.value)} style={inputStyle}>
              <option value="">Select source</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.currency ? `(${m.currency})` : ''}</option>
              ))}
              <CashOptions />
            </select>
          </div>
          <div style={{
            gridColumn: '1/-1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 12, padding: '2px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(99,102,241,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowRight size={18} color="var(--primary)" />
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>To *</label>
            <select value={toMethod} onChange={(e) => setToMethod(e.target.value)} style={inputStyle}>
              <option value="">Select destination</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name} {m.currency ? `(${m.currency})` : ''}</option>
              ))}
              <CashOptions />
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Note</label>
            <input type="text" placeholder="Optional note" value={note}
              onChange={(e) => setNote(e.target.value)} style={inputStyle} />
          </div>
        </div>
      );
    }

    const cats = modal === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <AmountInput />
        <CurrencyToggle />
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Category *</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cats.map((c) => {
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
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Payment Method *</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={inputStyle}>
            <option value="">Select method</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>{m.name} {m.currency ? `(${m.currency})` : ''}</option>
            ))}
            <CashOptions />
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Note</label>
          <input type="text" placeholder="Optional note" value={note}
            onChange={(e) => setNote(e.target.value)} style={inputStyle} />
        </div>
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 22, gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Welcome back,</div>
          <div style={{ fontSize: 25, fontWeight: 900 }}>
            {user.displayName?.split(' ')[0] ?? 'Friend'} 👋
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          CURRENT BALANCE WIDGET
      ══════════════════════════════════════════════ */}
      {openingBal ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, color: 'var(--muted)', fontWeight: 900,
            letterSpacing: 0.5, marginBottom: 10,
          }}>
            💰 CURRENT BALANCE
          </div>

          {/* UAE + India total cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* UAE Total */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 20, padding: '18px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>🇦🇪</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>UAE Total</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900,
                color: totalUAEBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {totalUAEBalance < 0 ? '-' : ''}AED {formatNumber(totalUAEBalance)}
              </div>
              {openingBal.asOf && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  since {openingBal.asOf}
                </div>
              )}
            </div>

            {/* India Total */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 20, padding: '18px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>🇮🇳</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>India Total</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900,
                color: totalIndiaBalance >= 0 ? 'var(--warning)' : 'var(--danger)' }}>
                {totalIndiaBalance < 0 ? '-' : ''}₹{formatINR(totalIndiaBalance)}
              </div>
              {openingBal.asOf && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  since {openingBal.asOf}
                </div>
              )}
            </div>
          </div>

          {/* Per-method breakdown */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 18, overflow: 'hidden',
          }}>
            {/* UAE Cash */}
            <BalanceRow
              icon="💵" label="Cash (AED)" sublabel="UAE"
              balance={getUAECashBalance()} currency="AED"
              color="var(--success)"
            />

            {/* UAE methods */}
            {uaeMethods.map((pm, i) => {
              const bal = getMethodCurrentBalance(pm.id);
              return (
                <BalanceRow key={pm.id}
                  icon={cardTypeIcon[pm.type] || '💳'}
                  label={pm.name}
                  sublabel={pm.bankName || ''}
                  balance={bal} currency="AED"
                  color={pm.color || 'var(--primary)'}
                  isLast={i === uaeMethods.length - 1 && indiaMethods.length === 0}
                />
              );
            })}

            {/* Divider */}
            {indiaMethods.length > 0 || true ? (
              <div style={{
                padding: '8px 16px',
                background: 'rgba(245,158,11,0.05)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                fontSize: 11, fontWeight: 800, color: 'var(--warning)',
                letterSpacing: 0.5,
              }}>
                🇮🇳 INDIA
              </div>
            ) : null}

            {/* India Cash */}
            <BalanceRow
              icon="💵" label="Cash (INR)" sublabel="India"
              balance={getIndiaCashBalance()} currency="INR"
              color="var(--warning)"
            />

            {/* India methods */}
            {indiaMethods.map((pm, i) => {
              const bal = getMethodCurrentBalance(pm.id);
              return (
                <BalanceRow key={pm.id}
                  icon={cardTypeIcon[pm.type] || '🏦'}
                  label={pm.name}
                  sublabel={pm.bankName || ''}
                  balance={bal} currency="INR"
                  color={pm.color || 'var(--warning)'}
                  isLast={i === indiaMethods.length - 1}
                />
              );
            })}
          </div>
        </div>
      ) : (
        /* No opening balance set yet */
        <div style={{
          marginBottom: 24, padding: '16px 20px',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Wallet size={28} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              Set Opening Balances
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              Go to <strong style={{ color: 'var(--primary)' }}>Settings → Opening Balances</strong> to see live balance per account.
            </div>
          </div>
        </div>
      )}

      {/* Month Picker */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 18, padding: 14, marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <button type="button" onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ textAlign: 'center', flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800,
            letterSpacing: 0.6, marginBottom: 3 }}>
            MONTHLY SUMMARY
          </div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {getMonthLabel(selectedMonth)}
          </div>
        </div>
        <input type="month" value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonth())}
          style={{ ...inputStyle, width: 150, padding: '9px 10px', fontWeight: 800 }}
        />
        <button type="button" onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* AED Monthly Summary */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900,
          letterSpacing: 0.5, marginBottom: 9,
          display: 'flex', alignItems: 'center', gap: 6 }}>
          🇦🇪 UAE — <AEDMark size={14} color="var(--muted)" /> AED
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard label="Income"  value={aedIncome}  currency="AED" color="var(--success)" icon={<TrendingUp size={20} />} />
          <SummaryCard label="Expense" value={aedExpense} currency="AED" color="var(--danger)"  icon={<TrendingDown size={20} />} />
          <SummaryCard label="This Month" value={aedIncome - aedExpense} currency="AED"
            color={aedIncome - aedExpense >= 0 ? 'var(--primary)' : 'var(--danger)'}
            icon={<Wallet size={20} />} />
        </div>
      </div>

      {/* INR Monthly Summary */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 900,
          letterSpacing: 0.5, marginBottom: 9 }}>
          🇮🇳 India — ₹ INR
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SummaryCard label="Income"  value={inrIncome}  currency="INR" color="var(--success)" icon={<TrendingUp size={20} />} />
          <SummaryCard label="Expense" value={inrExpense} currency="INR" color="var(--danger)"  icon={<TrendingDown size={20} />} />
          <SummaryCard label="This Month" value={inrIncome - inrExpense} currency="INR"
            color={inrIncome - inrExpense >= 0 ? 'var(--primary)' : 'var(--danger)'}
            icon={<Wallet size={20} />} />
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 900,
          letterSpacing: 0.5, marginBottom: 12 }}>
          QUICK ACTIONS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Add Income',   icon: <TrendingUp size={26} />,    color: 'var(--success)', bg: 'rgba(34,197,94,0.12)',   type: 'income'   as ModalType },
            { label: 'Add Expense',  icon: <TrendingDown size={26} />,  color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)',   type: 'expense'  as ModalType },
            { label: 'Transfer',     icon: <ArrowLeftRight size={26} />, color: 'var(--primary)', bg: 'rgba(99,102,241,0.12)',  type: 'transfer' as ModalType },
          ].map((btn) => (
            <button key={btn.label} type="button" onClick={() => openModal(btn.type)}
              style={{
                background: btn.bg, border: `2px solid ${btn.color}`,
                borderRadius: 18, padding: '22px 10px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 10, color: btn.color, fontWeight: 900, fontSize: 14,
              }}>
              {btn.icon}
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 900, letterSpacing: 0.5 }}>
            RECENT TRANSACTIONS
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)',
            background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Loading...</div>
          </div>
        ) : recentTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)',
            background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
            <DollarSign size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>No transactions yet</div>
            <div style={{ fontSize: 13, marginTop: 5 }}>Use the quick actions above!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {recentTransactions.map((tx) => {
              const color = getTypeColor(tx.type);
              const sign  = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';
              return (
                <div key={tx.id} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 17, padding: '14px 16px',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', gap: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 14,
                      background: `${color}1f`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {getTypeIcon(tx.type)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 15,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.type === 'transfer'
                          ? `${getMethodName(tx.fromMethod || '')} → ${getMethodName(tx.toMethod || '')}`
                          : tx.category}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.type !== 'transfer' && `${getMethodName(tx.paymentMethod)} · `}
                        {tx.date}
                      </div>
                    </div>
                  </div>
                  <Money amount={tx.amount || 0} currency={tx.currency}
                    sign={sign} color={color} size={16} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== 'none' && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)', display: 'flex',
            alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
          }}>
          <div style={{
            background: 'var(--card)', borderRadius: '26px 26px 0 0',
            padding: '24px 20px 44px', width: '100%', maxWidth: 520,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.22)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: modal === 'income' ? 'rgba(34,197,94,0.15)'
                    : modal === 'expense' ? 'rgba(239,68,68,0.15)'
                    : 'rgba(99,102,241,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {modal === 'income'   && <TrendingUp size={20} color="var(--success)" />}
                  {modal === 'expense'  && <TrendingDown size={20} color="var(--danger)" />}
                  {modal === 'transfer' && <ArrowLeftRight size={20} color="var(--primary)" />}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    {modal === 'income' ? 'Add Income'
                      : modal === 'expense' ? 'Add Expense'
                      : 'Transfer Funds'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {modal === 'transfer' ? 'Move money between accounts' : `Quick ${modal} entry`}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeModal}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 12,
                  padding: 9, cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>

            {renderModalContent()}

            <button type="button"
              onClick={modal === 'income' ? saveIncome : modal === 'expense' ? saveExpense : saveTransfer}
              disabled={saving}
              style={{
                width: '100%', marginTop: 20, padding: '15px',
                borderRadius: 15, border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                background: modal === 'income' ? 'var(--success)'
                  : modal === 'expense' ? 'var(--danger)' : 'var(--primary)',
                color: '#fff', fontWeight: 900, fontSize: 16, opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving...'
                : modal === 'income' ? 'Save Income'
                : modal === 'expense' ? 'Save Expense'
                : 'Confirm Transfer'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
          .grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Helper sub-components (outside main to avoid re-creation) ─────────────────

function SummaryCard({ label, value, currency, color, icon }: {
  label: string; value: number; currency: 'AED' | 'INR';
  color: string; icon: React.ReactNode;
}) {
  const display = currency === 'INR'
    ? Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 16, padding: '16px 14px',
      border: '1px solid var(--border)', minHeight: 100,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 900, color }}>
          {value < 0 ? '-' : ''}{currency === 'INR' ? '₹' : 'AED '}{display}
        </div>
      </div>
    </div>
  );
}

function BalanceRow({ icon, label, sublabel, balance, currency, color, isLast = false }: {
  icon: string; label: string; sublabel: string;
  balance: number; currency: 'AED' | 'INR';
  color: string; isLast?: boolean;
}) {
  const isPositive = balance >= 0;
  const display    = currency === 'INR'
    ? Math.abs(balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {sublabel}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 900,
        color: isPositive ? color : 'var(--danger)',
        whiteSpace: 'nowrap',
      }}>
        {balance < 0 ? '-' : ''}{currency === 'INR' ? '₹' : 'AED '}{display}
      </div>
    </div>
  );
}