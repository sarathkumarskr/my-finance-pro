import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  getDocs,
  limit,
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
} from 'lucide-react';

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
  currency: 'AED' | 'INR' | string;
}

type ModalType = 'none' | 'income' | 'expense' | 'transfer';

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Investment',
  'Gift',
  'Other',
];

const EXPENSE_CATEGORIES = [
  'Rent',
  'Food',
  'Transport',
  'Shopping',
  'Medical',
  'Education',
  'Entertainment',
  'Utilities',
  'Other',
];

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

/**
 * AED latest symbol is not reliably available as a normal Unicode character
 * in all browsers/fonts yet. So this inline SVG mark keeps display stable.
 */
function AEDMark({
  size = 15,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="AED"
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <path
        d="M7 4h5.6c4.4 0 7.4 3 7.4 8s-3 8-7.4 8H7V4Z"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 9h12.8"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M3.5 15h12.8"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatNumber(value: number) {
  return Math.abs(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function Money({
  amount,
  currency,
  sign = '',
  color,
  size = 14,
}: {
  amount: number;
  currency: 'AED' | 'INR';
  sign?: string;
  color?: string;
  size?: number;
}) {
  const finalSign = amount < 0 ? '-' : sign;
  const display = formatNumber(amount);

  if (currency === 'INR') {
    return (
      <span
        style={{
          color,
          fontWeight: 800,
          fontSize: size,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {finalSign}
        ₹{display}
      </span>
    );
  }

  return (
    <span
      style={{
        color,
        fontWeight: 800,
        fontSize: size,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {finalSign}
      {display}
      <AEDMark size={size} color={color || 'currentColor'} />
      <span style={{ fontSize: Math.max(size - 4, 10), opacity: 0.8 }}>
        AED
      </span>
    </span>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function getToday() {
  const d = new Date();

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}`;
}

function getCurrentMonth() {
  const d = new Date();

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function getMonthLabel(month: string) {
  const [year, monthNo] = month.split('-').map(Number);

  const d = new Date(year, (monthNo || 1) - 1, 1);

  return d.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function shiftMonth(month: string, diff: number) {
  const [year, monthNo] = month.split('-').map(Number);

  const d = new Date(year, (monthNo || 1) - 1 + diff, 1);

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function Dashboard({ user }: { user: User }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const [modal, setModal] = useState<ModalType>('none');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'AED' | 'INR'>('AED');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(getToday());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [note, setNote] = useState('');
  const [fromMethod, setFromMethod] = useState('');
  const [toMethod, setToMethod] = useState('');

  useEffect(() => {
    if (user?.uid) {
      fetchData();
    }
  }, [user?.uid]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const txSnap = await getDocs(
        query(collection(db, 'transactions'), where('userId', '==', user.uid))
      );

      const pmSnap = await getDocs(
        query(collection(db, 'paymentMethods'), where('userId', '==', user.uid))
      );

      const txList = txSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Transaction))
        .filter((t) => t.date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

      setTransactions(txList);

      setPaymentMethods(
        pmSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
      );
    } catch (err: any) {
      console.error('Dashboard fetchData error:', err);

      if (err?.code === 'permission-denied') {
        toast.error('Firestore permission denied');
      } else {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Refreshed!');
  };

  const getDefaultDateForModal = () => {
    const currentMonth = getCurrentMonth();

    if (selectedMonth === currentMonth) {
      return getToday();
    }

    return `${selectedMonth}-01`;
  };

  const resetForm = () => {
    setAmount('');
    setCurrency('AED');
    setCategory('');
    setDate(getDefaultDateForModal());
    setPaymentMethod('');
    setNote('');
    setFromMethod('');
    setToMethod('');
  };

  const openModal = (type: ModalType) => {
    resetForm();
    setModal(type);
  };

  const closeModal = () => {
    setModal('none');
    resetForm();
  };

  const validateAmount = () => {
    const n = parseFloat(amount);

    if (!amount || Number.isNaN(n) || n <= 0) {
      toast.error('Enter a valid amount');
      return null;
    }

    return n;
  };

  const saveIncome = async () => {
    const n = validateAmount();
    if (!n) return;

    if (!category || !paymentMethod || !date) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        type: 'income' as const,
        amount: n,
        currency,
        category,
        date,
        paymentMethod,
        note,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, 'transactions'), data);

      setTransactions((prev) =>
        [{ id: ref.id, ...data }, ...prev].sort((a, b) =>
          String(b.date).localeCompare(String(a.date))
        )
      );

      toast.success('Income added');
      closeModal();
    } catch (err) {
      console.error('saveIncome error:', err);
      toast.error('Failed to save income');
    } finally {
      setSaving(false);
    }
  };

  const saveExpense = async () => {
    const n = validateAmount();
    if (!n) return;

    if (!category || !paymentMethod || !date) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        type: 'expense' as const,
        amount: n,
        currency,
        category,
        date,
        paymentMethod,
        note,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, 'transactions'), data);

      setTransactions((prev) =>
        [{ id: ref.id, ...data }, ...prev].sort((a, b) =>
          String(b.date).localeCompare(String(a.date))
        )
      );

      toast.success('Expense added');
      closeModal();
    } catch (err) {
      console.error('saveExpense error:', err);
      toast.error('Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const saveTransfer = async () => {
    const n = validateAmount();
    if (!n) return;

    if (!fromMethod || !toMethod || !date) {
      toast.error('Please fill all required fields');
      return;
    }

    if (fromMethod === toMethod) {
      toast.error('From and To cannot be same');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        type: 'transfer' as const,
        amount: n,
        currency,
        category: 'Transfer',
        date,
        paymentMethod: fromMethod,
        fromMethod,
        toMethod,
        note,
        country: currency === 'AED' ? 'UAE' : 'India',
        createdAt: Timestamp.now(),
      };

      const ref = await addDoc(collection(db, 'transactions'), data);

      setTransactions((prev) =>
        [{ id: ref.id, ...data }, ...prev].sort((a, b) =>
          String(b.date).localeCompare(String(a.date))
        )
      );

      toast.success('Transfer recorded');
      closeModal();
    } catch (err) {
      console.error('saveTransfer error:', err);
      toast.error('Failed to save transfer');
    } finally {
      setSaving(false);
    }
  };

  const monthTx = transactions.filter(
    (t) => typeof t.date === 'string' && t.date.startsWith(selectedMonth)
  );

  const aedIncome = monthTx
    .filter((t) => t.type === 'income' && t.currency === 'AED')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const aedExpense = monthTx
    .filter((t) => t.type === 'expense' && t.currency === 'AED')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const inrIncome = monthTx
    .filter((t) => t.type === 'income' && t.currency === 'INR')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const inrExpense = monthTx
    .filter((t) => t.type === 'expense' && t.currency === 'INR')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const recentTransactions = transactions.slice(0, 10);

  const getMethodName = (id: string) => {
    if (!id) return '';
    if (id === 'cash_aed') return 'Cash AED';
    if (id === 'cash_inr') return 'Cash INR';
    if (id === 'cash') return 'Cash';

    return paymentMethods.find((m) => m.id === id)?.name || id;
  };

  const getTypeColor = (type: string) => {
    if (type === 'income') return 'var(--success)';
    if (type === 'expense') return 'var(--danger)';
    return 'var(--primary)';
  };

  const getTypeIcon = (type: string) => {
    if (type === 'income') {
      return <TrendingUp size={17} color="var(--success)" />;
    }

    if (type === 'expense') {
      return <TrendingDown size={17} color="var(--danger)" />;
    }

    return <ArrowLeftRight size={17} color="var(--primary)" />;
  };

  const CurrencyToggle = () => (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={labelStyle}>Currency *</label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['AED', 'INR'] as const).map((c) => {
          const active = currency === c;

          return (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              style={{
                padding: '11px 10px',
                borderRadius: 12,
                border: `2px solid ${
                  active ? 'var(--primary)' : 'var(--border)'
                }`,
                background: active ? 'var(--primary)' : 'var(--card)',
                color: active ? '#fff' : 'var(--text)',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {c === 'AED' ? (
                <>
                  <AEDMark size={16} color={active ? '#fff' : 'var(--text)'} />
                  AED
                </>
              ) : (
                <>₹ INR</>
              )}
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
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            fontWeight: 800,
            pointerEvents: 'none',
          }}
        >
          {currency === 'AED' ? <AEDMark size={18} /> : '₹'}
        </div>

        <input
          type="number"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{
            ...inputStyle,
            fontSize: 22,
            fontWeight: 800,
            paddingLeft: currency === 'AED' ? 42 : 32,
          }}
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <AmountInput />
          <CurrencyToggle />

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>From *</label>
            <select
              value={fromMethod}
              onChange={(e) => setFromMethod(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select source</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.currency ? `(${m.currency})` : ''}
                </option>
              ))}
              <CashOptions />
            </select>
          </div>

          <div
            style={{
              gridColumn: '1/-1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '2px 0',
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: 'rgba(99,102,241,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowRight size={18} color="var(--primary)" />
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>To *</label>
            <select
              value={toMethod}
              onChange={(e) => setToMethod(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select destination</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.currency ? `(${m.currency})` : ''}
                </option>
              ))}
              <CashOptions />
            </select>
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Note</label>
            <input
              type="text"
              placeholder="Optional note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={inputStyle}
            />
          </div>

          {amount && fromMethod && toMethod && (
            <div
              style={{
                gridColumn: '1/-1',
                padding: 14,
                borderRadius: 14,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                TRANSFER PREVIEW
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'var(--card)',
                    fontSize: 12,
                    fontWeight: 700,
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getMethodName(fromMethod)}
                </div>

                <div style={{ textAlign: 'center', color: 'var(--primary)' }}>
                  <ArrowRight size={16} />
                  <Money
                    amount={parseFloat(amount || '0')}
                    currency={currency}
                    color="var(--primary)"
                    size={13}
                  />
                </div>

                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'var(--card)',
                    fontSize: 12,
                    fontWeight: 700,
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getMethodName(toMethod)}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    const cats = modal === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <AmountInput />
        <CurrencyToggle />

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Category *</label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {cats.map((c) => {
              const active = category === c;

              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1.5px solid ${
                      active ? 'var(--primary)' : 'var(--border)'
                    }`,
                    background: active ? 'var(--primary)' : 'var(--card)',
                    color: active ? '#fff' : 'var(--text)',
                    fontSize: 13,
                    cursor: 'pointer',
                    fontWeight: 700,
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

          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select method</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.currency ? `(${m.currency})` : ''}
              </option>
            ))}
            <CashOptions />
          </select>
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Date *</label>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Note</label>

          <input
            type="text"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
    );
  };

  const SummaryCard = ({
    label,
    value,
    currency,
    color,
    icon,
  }: {
    label: string;
    value: number;
    currency: 'AED' | 'INR';
    color: string;
    icon: React.ReactNode;
  }) => (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 16,
        padding: '16px 14px',
        border: '1px solid var(--border)',
        minHeight: 116,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ color }}>{icon}</div>

      <div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          {label}
        </div>

        <Money amount={value} currency={currency} color={color} size={17} />
      </div>
    </div>
  );

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 22,
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Welcome back,
          </div>
          <div style={{ fontSize: 25, fontWeight: 900 }}>
            {user.displayName?.split(' ')[0] ?? 'Friend'} 👋
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 12,
            cursor: 'pointer',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
          }}
          title="Refresh"
        >
          <RefreshCw
            size={20}
            style={{
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </button>
      </div>

      {/* Month Picker */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          padding: 14,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ textAlign: 'center', flex: 1, minWidth: 180 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontWeight: 800,
              letterSpacing: 0.6,
              marginBottom: 3,
            }}
          >
            DASHBOARD MONTH
          </div>

          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {getMonthLabel(selectedMonth)}
          </div>
        </div>

        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value || getCurrentMonth())}
          style={{
            ...inputStyle,
            width: 150,
            padding: '9px 10px',
            fontWeight: 800,
          }}
        />

        <button
          type="button"
          onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* AED Summary */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontWeight: 900,
            letterSpacing: 0.5,
            marginBottom: 9,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          🇦🇪 UAE —
          <AEDMark size={14} color="var(--muted)" />
          AED
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <SummaryCard
            label="Income"
            value={aedIncome}
            currency="AED"
            color="var(--success)"
            icon={<TrendingUp size={20} />}
          />
          <SummaryCard
            label="Expense"
            value={aedExpense}
            currency="AED"
            color="var(--danger)"
            icon={<TrendingDown size={20} />}
          />
          <SummaryCard
            label="Balance"
            value={aedIncome - aedExpense}
            currency="AED"
            color={
              aedIncome - aedExpense >= 0
                ? 'var(--primary)'
                : 'var(--danger)'
            }
            icon={<Wallet size={20} />}
          />
        </div>
      </div>

      {/* INR Summary */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontWeight: 900,
            letterSpacing: 0.5,
            marginBottom: 9,
          }}
        >
          🇮🇳 India — ₹ INR
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          <SummaryCard
            label="Income"
            value={inrIncome}
            currency="INR"
            color="var(--success)"
            icon={<TrendingUp size={20} />}
          />
          <SummaryCard
            label="Expense"
            value={inrExpense}
            currency="INR"
            color="var(--danger)"
            icon={<TrendingDown size={20} />}
          />
          <SummaryCard
            label="Balance"
            value={inrIncome - inrExpense}
            currency="INR"
            color={
              inrIncome - inrExpense >= 0
                ? 'var(--primary)'
                : 'var(--danger)'
            }
            icon={<Wallet size={20} />}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 26 }}>
        <div
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            fontWeight: 900,
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          QUICK ACTIONS
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {[
            {
              label: 'Add Income',
              icon: <TrendingUp size={26} />,
              color: 'var(--success)',
              bg: 'rgba(34,197,94,0.12)',
              type: 'income' as ModalType,
            },
            {
              label: 'Add Expense',
              icon: <TrendingDown size={26} />,
              color: 'var(--danger)',
              bg: 'rgba(239,68,68,0.12)',
              type: 'expense' as ModalType,
            },
            {
              label: 'Transfer',
              icon: <ArrowLeftRight size={26} />,
              color: 'var(--primary)',
              bg: 'rgba(99,102,241,0.12)',
              type: 'transfer' as ModalType,
            },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={() => openModal(btn.type)}
              style={{
                background: btn.bg,
                border: `2px solid ${btn.color}`,
                borderRadius: 18,
                padding: '22px 10px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                color: btn.color,
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              {btn.icon}
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              fontWeight: 900,
              letterSpacing: 0.5,
            }}
          >
            RECENT TRANSACTIONS
          </div>

          <span
            style={{
              fontSize: 13,
              color: 'var(--primary)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            See all →
          </span>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 42,
              color: 'var(--muted)',
              background: 'var(--card)',
              borderRadius: 18,
              border: '1px solid var(--border)',
            }}
          >
            Loading...
          </div>
        ) : recentTransactions.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: 'var(--muted)',
              background: 'var(--card)',
              borderRadius: 18,
              border: '1px solid var(--border)',
            }}
          >
            <DollarSign size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              No transactions yet
            </div>
            <div style={{ fontSize: 13, marginTop: 5 }}>
              Use the quick actions above!
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {recentTransactions.map((tx) => {
              const color = getTypeColor(tx.type);
              const sign =
                tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '';

              return (
                <div
                  key={tx.id}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 17,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        background: `${color}1f`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {getTypeIcon(tx.type)}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 15,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tx.type === 'transfer'
                          ? `${getMethodName(tx.fromMethod || '')} → ${getMethodName(
                              tx.toMethod || ''
                            )}`
                          : tx.category}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tx.type !== 'transfer' &&
                          `${getMethodName(tx.paymentMethod)} · `}
                        {tx.date}
                      </div>
                    </div>
                  </div>

                  <Money
                    amount={tx.amount || 0}
                    currency={tx.currency}
                    sign={sign}
                    color={color}
                    size={16}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== 'none' && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '26px 26px 0 0',
              padding: '24px 20px 44px',
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 -20px 50px rgba(0,0,0,0.22)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background:
                      modal === 'income'
                        ? 'rgba(34,197,94,0.15)'
                        : modal === 'expense'
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(99,102,241,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {modal === 'income' && (
                    <TrendingUp size={20} color="var(--success)" />
                  )}
                  {modal === 'expense' && (
                    <TrendingDown size={20} color="var(--danger)" />
                  )}
                  {modal === 'transfer' && (
                    <ArrowLeftRight size={20} color="var(--primary)" />
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    {modal === 'income'
                      ? 'Add Income'
                      : modal === 'expense'
                      ? 'Add Expense'
                      : 'Transfer Funds'}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {modal === 'transfer'
                      ? 'Move money between accounts'
                      : `Quick ${modal} entry`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                style={{
                  background: 'var(--bg)',
                  border: 'none',
                  borderRadius: 12,
                  padding: 9,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {renderModalContent()}

            <button
              type="button"
              onClick={
                modal === 'income'
                  ? saveIncome
                  : modal === 'expense'
                  ? saveExpense
                  : saveTransfer
              }
              disabled={saving}
              style={{
                width: '100%',
                marginTop: 20,
                padding: '15px',
                borderRadius: 15,
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                background:
                  modal === 'income'
                    ? 'var(--success)'
                    : modal === 'expense'
                    ? 'var(--danger)'
                    : 'var(--primary)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 16,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? 'Saving...'
                : modal === 'income'
                ? 'Save Income'
                : modal === 'expense'
                ? 'Save Expense'
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

        @media (max-width: 720px) {
          div[style*="repeat(3, 1fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}