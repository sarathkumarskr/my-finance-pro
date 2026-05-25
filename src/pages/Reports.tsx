import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Calendar,
  PieChart as PieIcon,
  PiggyBank,
  RefreshCw,
  Send,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Currency = 'AED' | 'INR';

type Transaction = {
  id?: string;
  userId?: string;
  type: 'income' | 'expense';
  amount: number;
  currency: Currency;
  country?: 'UAE' | 'India';
  category?: string;
  date: string;
};

type Remittance = {
  id?: string;
  userId?: string;
  amountAED?: number;
  amountINR?: number;
  aedAmount?: number;
  inrAmount?: number;
  exchangeRate?: number;
  rate?: number;
  date: string;
};

type SavingGoal = {
  id?: string;
  userId?: string;
  name: string;
  targetAmount?: number;
  savedAmount?: number;
  currentAmount?: number;
  currency: Currency;
  deadline?: string;
};

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);
const getMonthKey = (date: string) => (date || '').slice(0, 7);

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getPastMonthsFrom = (endMonth: string, count: number) => {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(addMonths(endMonth, -i));
  }
  return months;
};

const getMonthLabel = (month: string) => {
  const [y, m] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(m) - 1] || m} ${(y || '').slice(2)}`;
};

const getLongMonthLabel = (month: string) => {
  if (!month) return '';
  const [y, m] = month.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const num = (v: any) => Number(v || 0);
const getRemAED = (r: Remittance) => num(r.amountAED ?? r.aedAmount);
const getRemINR = (r: Remittance) => num(r.amountINR ?? r.inrAmount);

const getRemRate = (r: Remittance) => {
  const explicit = num(r.exchangeRate ?? r.rate);
  if (explicit > 0) return explicit;
  const aed = getRemAED(r);
  const inr = getRemINR(r);
  return aed > 0 ? inr / aed : 0;
};

const getGoalSaved = (g: SavingGoal) => num(g.savedAmount ?? g.currentAmount);
const getGoalTarget = (g: SavingGoal) => num(g.targetAmount);

const getLatestDataMonth = (
  transactions: Transaction[],
  remittances: Remittance[],
  goals: SavingGoal[]
) => {
  const months = [
    ...transactions.map((t) => getMonthKey(t.date)),
    ...remittances.map((r) => getMonthKey(r.date)),
    ...goals.map((g) => getMonthKey(g.deadline || '')),
  ].filter(Boolean);

  if (months.length === 0) return getCurrentMonth();
  return months.sort().reverse()[0];
};

const fmt = (amount: number, currency: Currency) =>
  currency === 'AED'
    ? `AED ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const shortNum = (v: number, currency?: Currency) => {
  if (currency === 'INR') return `₹${(v / 1000).toFixed(0)}k`;
  if (currency === 'AED') return `${(v / 1000).toFixed(0)}k`;
  return `${(v / 1000).toFixed(0)}k`;
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', fontSize: '13px' }}>
      <div style={{ color: 'var(--muted)', fontWeight: 700, marginBottom: '6px' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color || p.fill }} />
          <span style={{ color: 'var(--muted)' }}>{p.name}:</span>
          <span style={{ fontWeight: 800, color: 'var(--text)' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function ReportCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: '20px', marginBottom: '20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '11px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'var(--card)', border: '1px solid var(--border)', minWidth: '160px', flex: 1 }}>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

export default function Reports({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<6 | 12>(6);
  const [currencyFilter, setCurrencyFilter] = useState<'AED' | 'INR' | 'both'>('AED');
  const [endMonth, setEndMonth] = useState('');

  const loadReports = async (showToast = false, forceLatestMonth = false) => {
    setLoading(true);
    try {
      const [txResult, remResult, goalsResult] = await Promise.allSettled([
        getDocs(query(collection(db, 'transactions'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'remittances'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'savingGoals'), where('userId', '==', user.uid))),
      ]);

      let txData: Transaction[] = [];
      let remData: Remittance[] = [];
      let goalsData: SavingGoal[] = [];

      if (txResult.status === 'fulfilled') {
        txData = txResult.value.docs.map((d) => ({ id: d.id, ...d.data() })) as Transaction[];
        setTransactions(txData);
      }
      if (remResult.status === 'fulfilled') {
        remData = remResult.value.docs.map((d) => ({ id: d.id, ...d.data() })) as Remittance[];
        setRemittances(remData);
      }
      if (goalsResult.status === 'fulfilled') {
        goalsData = goalsResult.value.docs.map((d) => ({ id: d.id, ...d.data() })) as SavingGoal[];
        setSavingGoals(goalsData);
      }

      const latest = getLatestDataMonth(txData, remData, goalsData);
      setEndMonth((prev) => {
        if (forceLatestMonth) return latest;
        if (!prev) return latest;
        return prev;
      });

      if (showToast) toast.success('Analytics matrix updated');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load records dataset');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    loadReports(false, true);
  }, [user.uid]);

  const months = useMemo(() => {
    return getPastMonthsFrom(endMonth || getCurrentMonth(), period);
  }, [endMonth, period]);

  const rangeLabel = months.length > 0
    ? `${getLongMonthLabel(months[0])} → ${getLongMonthLabel(months[months.length - 1])}`
    : '';

  const incomeExpenseData = useMemo(() => {
    return months.map((month) => {
      const monthTx = transactions.filter((t) => getMonthKey(t.date) === month);
      const aedIncome = monthTx.filter((t) => t.type === 'income' && t.currency === 'AED').reduce((s, t) => s + num(t.amount), 0);
      const aedExpense = monthTx.filter((t) => t.type === 'expense' && t.currency === 'AED').reduce((s, t) => s + num(t.amount), 0);
      const inrIncome = monthTx.filter((t) => t.type === 'income' && t.currency === 'INR').reduce((s, t) => s + num(t.amount), 0);
      const inrExpense = monthTx.filter((t) => t.type === 'expense' && t.currency === 'INR').reduce((s, t) => s + num(t.amount), 0);

      return {
        month: getMonthLabel(month),
        'AED Income': Math.round(aedIncome),
        'AED Expense': Math.round(aedExpense),
        'INR Income': Math.round(inrIncome),
        'INR Expense': Math.round(inrExpense),
      };
    });
  }, [transactions, months]);

  const cashFlowData = useMemo(() => {
    return months.map((month) => {
      const monthTx = transactions.filter((t) => getMonthKey(t.date) === month && t.currency === 'AED');
      const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + num(t.amount), 0);
      const expenses = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + num(t.amount), 0);
      const remittance = remittances.filter((r) => getMonthKey(r.date) === month).reduce((s, r) => s + getRemAED(r), 0);

      return {
        month: getMonthLabel(month),
        Income: Math.round(income),
        Expenses: Math.round(expenses),
        Remittance: Math.round(remittance),
        'Net Savings': Math.round(income - expenses),
      };
    });
  }, [transactions, remittances, months]);

  const expensePieData = useMemo(() => {
    const filtered = transactions.filter((t) =>
      t.type === 'expense' &&
      months.some((m) => getMonthKey(t.date) === m) &&
      (currencyFilter === 'both' || t.currency === currencyFilter)
    );

    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const category = t.category || 'Other';
      map[category] = (map[category] || 0) + num(t.amount);
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions, months, currencyFilter]);

  const remittanceData = useMemo(() => {
    return months.map((month) => {
      const monthRem = remittances.filter((r) => getMonthKey(r.date) === month);
      const totalAED = monthRem.reduce((s, r) => s + getRemAED(r), 0);
      const totalINR = monthRem.reduce((s, r) => s + getRemINR(r), 0);
      const avgRate = monthRem.length > 0
        ? monthRem.reduce((s, r) => s + getRemRate(r), 0) / monthRem.length
        : 0;

      return {
        month: getMonthLabel(month),
        'AED Sent': Math.round(totalAED),
        'INR Received': Math.round(totalINR),
        Rate: parseFloat(avgRate.toFixed(2)),
      };
    });
  }, [remittances, months]);

  const savingsRateData = useMemo(() => {
    return months.map((month) => {
      const monthTx = transactions.filter((t) => getMonthKey(t.date) === month && t.currency === 'AED');
      const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + num(t.amount), 0);
      const expenses = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + num(t.amount), 0);
      const rate = income > 0 ? parseFloat((((income - expenses) / income) * 100).toFixed(1)) : 0;

      return { month: getMonthLabel(month), Rate: rate };
    });
  }, [transactions, months]);

  const totals = useMemo(() => {
    const periodTx = transactions.filter((t) => months.some((m) => getMonthKey(t.date) === m));
    const aedIncome = periodTx.filter((t) => t.type === 'income' && t.currency === 'AED').reduce((s, t) => s + num(t.amount), 0);
    const aedExpense = periodTx.filter((t) => t.type === 'expense' && t.currency === 'AED').reduce((s, t) => s + num(t.amount), 0);
    const inrIncome = periodTx.filter((t) => t.type === 'income' && t.currency === 'INR').reduce((s, t) => s + num(t.amount), 0);
    const inrExpense = periodTx.filter((t) => t.type === 'expense' && t.currency === 'INR').reduce((s, t) => s + num(t.amount), 0);
    const remAED = remittances.filter((r) => months.some((m) => getMonthKey(r.date) === m)).reduce((s, r) => s + getRemAED(r), 0);

    return { aedIncome, aedExpense, inrIncome, inrExpense, remAED };
  }, [transactions, remittances, months]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: '14px' }}>Syncing telemetry datasets…</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={28} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>Reports & Analytics</h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '6px' }}>Visual data matrices for cross-border mapping metrics</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '5px 12px', borderRadius: '999px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: '12px', fontWeight: 700 }}>
            <Calendar size={13} /> {rangeLabel}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', height: '40px' }}>
            {([6, 12] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: '0 16px', border: 'none', background: period === p ? 'var(--primary)' : 'transparent', color: period === p ? '#fff' : 'var(--muted)', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}>{p}M</button>
            ))}
          </div>

          <div style={{ display: 'flex', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', height: '40px' }}>
            {(['AED', 'INR', 'both'] as const).map((c) => (
              <button key={c} onClick={() => setCurrencyFilter(c)} style={{ padding: '0 14px', border: 'none', background: currencyFilter === c ? 'var(--primary)' : 'transparent', color: currencyFilter === c ? '#fff' : 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>{c === 'both' ? 'All' : c}</button>
            ))}
          </div>

          <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} style={{ height: '40px', padding: '0 12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '13px', outline: 'none', fontWeight: 700 }} />
          <button onClick={() => { const latest = getLatestDataMonth(transactions, remittances, savingGoals); setEndMonth(latest); }} style={{ height: '40px', padding: '0 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}>Latest</button>
          <button onClick={() => loadReports(true, false)} style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {transactions.length === 0 && remittances.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <BarChart3 size={52} style={{ color: 'var(--border)', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Analytics matrix void</div>
          <div style={{ fontSize: '14px', color: 'var(--muted)' }}>Log system interactions across ledgers to activate analytics graphics.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <StatCard label={`UAE Income (${period}M)`} value={fmt(totals.aedIncome, 'AED')} color="var(--success)" />
            <StatCard label={`UAE Expense (${period}M)`} value={fmt(totals.aedExpense, 'AED')} color="var(--danger)" />
            <StatCard label={`India Income (${period}M)`} value={fmt(totals.inrIncome, 'INR')} color="var(--success)" />
            <StatCard label={`India Expense (${period}M)`} value={fmt(totals.inrExpense, 'INR')} color="var(--danger)" />
            <StatCard label={`Remittance Pool (${period}M)`} value={fmt(totals.remAED, 'AED')} color="#8b5cf6" />
          </div>

          <ReportCard title="Income vs Expense — UAE" subtitle={`Running ${period} months span mapping (AED)`} icon={<BarChart3 size={17} />}>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={incomeExpenseData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => shortNum(v, 'AED')} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="AED Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="AED Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportCard>

          <ReportCard title="Income vs Expense — India" subtitle={`Running ${period} months span mapping (INR)`} icon={<BarChart3 size={17} />}>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={incomeExpenseData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={65} tickFormatter={(v) => shortNum(v, 'INR')} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="INR Income" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="INR Expense" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ReportCard>

          <ReportCard title="UAE Cash Flow Telemetry" subtitle="Transactional trend bounds analysis" icon={<TrendingUp size={17} />}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.25}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                  <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => shortNum(v, 'AED')} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area type="monotone" dataKey="Income" stroke="#22c55e" strokeWidth={2} fill="url(#incGrad)" />
                <Area type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expGrad)" />
                <Area type="monotone" dataKey="Net Savings" stroke="#6366f1" strokeWidth={2} fill="url(#savGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </ReportCard>

          <ReportCard title="Expense Group Allocations" subtitle="Category breakdown matrix distribution" icon={<PieIcon size={17} />}>
            {expensePieData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>Zero breakdown records available for parameters.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', alignItems: 'center' }}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {expensePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v.toLocaleString(), 'Value']} />
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  {expensePieData.map((item, i) => {
                    const total = expensePieData.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
                    return (
                      <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ width: '11px', height: '11px', borderRadius: '3px', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                          <div style={{ height: '5px', background: 'var(--border)', borderRadius: '999px', marginTop: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 800, flexShrink: 0 }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ReportCard>

          {remittances.length > 0 && (
            <ReportCard title="Remittance Dispatch Trajectory" subtitle="AED volume sent versus targeted INR reception logs" icon={<Send size={17} />}>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={remittanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={50} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={65} tickFormatter={(v) => shortNum(v, 'INR')} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar yAxisId="left" dataKey="AED Sent" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="INR Received" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              
              {remittanceData.some((d) => d.Rate > 0) && (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginTop: '18px', marginBottom: '8px' }}>Exchange Rate Spikes Tracking</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={remittanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={45} domain={['auto', 'auto']} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="Rate" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </ReportCard>
          )}

          <ReportCard title="Monthly Savings Performance Score" subtitle="Ratio validation analysis across active UAE flows" icon={<TrendingDown size={17} />}>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={savingsRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Savings Rate']} />
                <Bar dataKey="Rate" radius={[4, 4, 0, 0]}>
                  {savingsRateData.map((entry, i) => (
                    <Cell key={i} fill={entry.Rate >= 20 ? '#22c55e' : entry.Rate >= 10 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
              {[{ label: '≥ 20% Sustainable Strategy', color: '#22c55e' }, { label: '10–19% Balanced Thresholds', color: '#f59e0b' }, { label: '< 10% High Volatility Warning', color: '#ef4444' }].map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} /> {item.label}
                </div>
              ))}
            </div>
          </ReportCard>
        </>
      )}
    </div>
  );
}