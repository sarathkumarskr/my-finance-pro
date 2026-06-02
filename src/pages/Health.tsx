import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  HeartPulse,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Target,
  PiggyBank,
  HandCoins,
  ArrowRightLeft,
  Info,
} from 'lucide-react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  formatCurrency,
  type Currency,
  type Transaction,
} from '../firestoreHelpers';

// ─── Local Helper (NOT imported from firestoreHelpers) ──
const getMonthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

type Props = { user: User };
type Country = 'UAE' | 'India';

// ─── Types ───────────────────────────────────
interface Debt {
  id?: string;
  userId: string;
  country: Country;
  currency: Currency;
  totalAmount: number;
  paidAmount: number;
  monthlyPayment?: number;
}

interface BudgetDoc {
  id?: string;
  userId: string;
  country: Country;
  currency: Currency;
  category: string;
  budgetAmount: number;
  month: string;
}

interface SavingGoal {
  id?: string;
  userId: string;
  country: Country;
  currency: Currency;
  targetAmount: number;
  currentAmount: number;
}

interface Remittance {
  id?: string;
  userId: string;
  amountSentAED: number;
  date: string;
}

// ─── Score color helpers ──────────────────────
const scoreColor = (score: number) =>
  score >= 80 ? 'var(--success)' :
  score >= 60 ? 'var(--primary)' :
  score >= 40 ? 'var(--warning)' :
  'var(--danger)';

const scoreBg = (score: number) =>
  score >= 80 ? 'rgba(16,185,129,0.10)' :
  score >= 60 ? 'rgba(99,102,241,0.10)' :
  score >= 40 ? 'rgba(245,158,11,0.10)' :
  'rgba(239,68,68,0.10)';

const scoreLabel = (score: number) =>
  score >= 80 ? 'Excellent \u{1F31F}' :
  score >= 60 ? 'Good \u{1F44D}' :
  score >= 40 ? 'Fair ⚠️' :
  'Needs Attention \u{1F6A8}';

const scoreEmoji = (score: number) =>
  score >= 80 ? '\u{1F7E2}' :
  score >= 60 ? '\u{1F535}' :
  score >= 40 ? '\u{1F7E1}' :
  '\u{1F534}';

// ─── Month helpers ────────────────────────────
const getLast3Months = (): string[] => {
  const months: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(getMonthKey(d));
  }
  return months;
};

// ─── Score calculation ────────────────────────
interface ScoreBreakdown {
  savingsScore:     number; // 0-30
  debtScore:        number; // 0-25
  budgetScore:      number; // 0-25
  consistencyScore: number; // 0-20
  total:            number; // 0-100
  savingsRate:      number;
  debtToIncome:     number;
  budgetAdherence:  number;
  monthsTracked:    number;
}

function calcScore(
  transactions: Transaction[],
  debts: Debt[],
  budgets: BudgetDoc[],
  remittances: Remittance[],
  country: Country
): ScoreBreakdown {
  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';
  const last3   = getLast3Months();
  const curMonth = getMonthKey(new Date());

  // ── 1. Savings Score (30 pts) ──
  const countryTx = transactions.filter(t => t.country === country && t.currency === currency);
  const income3m  = last3.reduce((s, m) => {
    return s + countryTx.filter(t => t.type === 'income' && t.date?.startsWith(m)).reduce((a, t) => a + t.amount, 0);
  }, 0);
  const expense3m = last3.reduce((s, m) => {
    return s + countryTx.filter(t => t.type === 'expense' && t.date?.startsWith(m)).reduce((a, t) => a + t.amount, 0);
  }, 0);

  const savingsRate = income3m > 0 ? ((income3m - expense3m) / income3m) * 100 : 0;
  let savingsScore = 0;
  if      (savingsRate >= 30) savingsScore = 30;
  else if (savingsRate >= 20) savingsScore = 25;
  else if (savingsRate >= 10) savingsScore = 18;
  else if (savingsRate >= 0)  savingsScore = 10;
  else                        savingsScore = 0;

  // ── 2. Debt Score (25 pts) ──
  const countryDebts   = debts.filter(d => d.country === country);
  const totalDebt      = countryDebts.reduce((s, d) => s + Math.max(d.totalAmount - d.paidAmount, 0), 0);
  const monthlyIncome  = income3m / 3;
  const monthlyDebtPay = countryDebts.reduce((s, d) => s + (d.monthlyPayment ?? 0), 0);
  const debtToIncome   = monthlyIncome > 0 ? (monthlyDebtPay / monthlyIncome) * 100 : 0;

  let debtScore = 0;
  if      (totalDebt === 0)   debtScore = 25;
  else if (debtToIncome <= 10) debtScore = 22;
  else if (debtToIncome <= 20) debtScore = 18;
  else if (debtToIncome <= 35) debtScore = 12;
  else if (debtToIncome <= 50) debtScore = 6;
  else                         debtScore = 0;

  // ── 3. Budget Adherence Score (25 pts) ──
  const curBudgets = budgets.filter(b => b.country === country && b.month === curMonth);
  let budgetAdherence = 100;
  let budgetScore = 0;

  if (curBudgets.length === 0) {
    budgetScore = 10;
    budgetAdherence = 0;
  } else {
    const totalBudget = curBudgets.reduce((s, b) => s + b.budgetAmount, 0);
    const budgetTx    = countryTx.filter(t => t.type === 'expense' && t.date?.startsWith(curMonth));
    const totalSpent  = budgetTx.reduce((s, t) => s + t.amount, 0);
    budgetAdherence   = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 150) : 100;

    if      (budgetAdherence <= 70)  budgetScore = 25;
    else if (budgetAdherence <= 90)  budgetScore = 22;
    else if (budgetAdherence <= 100) budgetScore = 18;
    else if (budgetAdherence <= 115) budgetScore = 10;
    else                             budgetScore = 3;
  }

  // ── 4. Consistency Score (20 pts) ──
  const monthsWithData = last3.filter(m =>
    countryTx.some(t => t.date?.startsWith(m))
  ).length;

  let consistencyScore = 0;
  if      (monthsWithData >= 3) consistencyScore = 20;
  else if (monthsWithData === 2) consistencyScore = 12;
  else if (monthsWithData === 1) consistencyScore = 6;
  else                           consistencyScore = 0;

  const total = Math.round(
    Math.min(savingsScore + debtScore + budgetScore + consistencyScore, 100)
  );

  return {
    savingsScore,
    debtScore,
    budgetScore,
    consistencyScore,
    total,
    savingsRate,
    debtToIncome,
    budgetAdherence,
    monthsTracked: monthsWithData,
  };
}

// ─── Recommendation engine ────────────────────
interface Recommendation {
  icon: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

function getRecommendations(
  uaeScore: ScoreBreakdown,
  indiaScore: ScoreBreakdown,
  transactions: Transaction[],
  debts: Debt[],
  budgets: BudgetDoc[]
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (uaeScore.savingsRate < 10) {
    recs.push({
      icon: '💰', priority: 'high',
      title: 'Increase UAE Savings Rate',
      description: `Your UAE savings rate is ${uaeScore.savingsRate.toFixed(1)}%. Aim for at least 20%.`,
    });
  } else if (uaeScore.savingsRate >= 20) {
    recs.push({
      icon: '\u{1F31F}', priority: 'low',
      title: 'Great UAE Savings Rate!',
      description: `You're saving ${uaeScore.savingsRate.toFixed(1)}% of your UAE income. Keep it up!`,
    });
  }

  if (indiaScore.savingsRate < 0) {
    recs.push({
      icon: '\u{1F6A8}', priority: 'high',
      title: 'India Expenses Exceed Income',
      description: 'Your India expenses are higher than income. Review fixed costs.',
    });
  }

  if (uaeScore.debtToIncome > 35) {
    recs.push({
      icon: '🏦', priority: 'high',
      title: 'High Debt-to-Income Ratio',
      description: `${uaeScore.debtToIncome.toFixed(1)}% of UAE income goes to debt payments.`,
    });
  }

  if (indiaScore.debtToIncome > 40) {
    recs.push({
      icon: '🏠', priority: 'high',
      title: 'India EMI Load is High',
      description: `${indiaScore.debtToIncome.toFixed(1)}% of India income goes to EMIs.`,
    });
  }

  if (uaeScore.budgetAdherence === 0) {
    recs.push({
      icon: '📊', priority: 'medium',
      title: 'Set UAE Monthly Budgets',
      description: 'No UAE budgets set this month. Setting budgets helps track spending.',
    });
  } else if (uaeScore.budgetAdherence > 110) {
    recs.push({
      icon: '⚠️', priority: 'high',
      title: 'UAE Budget Exceeded',
      description: `You've spent ${uaeScore.budgetAdherence.toFixed(0)}% of UAE budget.`,
    });
  }

  if (indiaScore.budgetAdherence === 0) {
    recs.push({
      icon: '📊', priority: 'medium',
      title: 'Set India Monthly Budgets',
      description: 'No India budgets set this month.',
    });
  }

  if (uaeScore.monthsTracked < 2) {
    recs.push({
      icon: '📅', priority: 'medium',
      title: 'Track Consistently',
      description: 'Only 1 month of UAE data. Track regularly for accurate scoring.',
    });
  }

  if (uaeScore.total >= 80) {
    recs.push({
      icon: '🎯', priority: 'low',
      title: 'Excellent Financial Health!',
      description: 'UAE finances are in great shape. Consider growing investments.',
    });
  }

  if (debts.filter(d => Math.max(d.totalAmount - d.paidAmount, 0) === 0).length > 0) {
    recs.push({
      icon: '✅', priority: 'low',
      title: 'Debt Cleared!',
      description: 'At least one debt fully paid. Redirect EMI to savings.',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 5);
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function Health({ user }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts,        setDebts]        = useState<Debt[]>([]);
  const [budgets,      setBudgets]      = useState<BudgetDoc[]>([]);
  const [remittances,  setRemittances]  = useState<Remittance[]>([]);
  const [activeTab,    setActiveTab]    = useState<'UAE' | 'India'>('UAE');

  // ── Listeners ──
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'transactions'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaction[];
      list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
    });
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'debts'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Debt[]);
    });
  }, [user.uid]);

  // ✅ FIXED: budgetItems collection
  useEffect(() => {
    if (!user?.uid) return;
    const curMonth = getMonthKey(new Date());
    const q = query(
      collection(db, 'budgetItems'),
      where('userId', '==', user.uid),
      where('isActive', '==', true)
    );
    return onSnapshot(q, snap => {
      const mapped: BudgetDoc[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          country: data.country || 'UAE',
          currency: (data.country === 'India' ? 'INR' : 'AED') as Currency,
          category: data.name || 'Unknown',
          budgetAmount: data.amount || 0,
          month: curMonth,
        };
      });
      setBudgets(mapped);
    });
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'remittances'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      setRemittances(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Remittance[]);
    });
  }, [user.uid]);

  // ── Scores ──
  const uaeScore   = useMemo(() => calcScore(transactions, debts, budgets, remittances, 'UAE'),   [transactions, debts, budgets, remittances]);
  const indiaScore = useMemo(() => calcScore(transactions, debts, budgets, remittances, 'India'), [transactions, debts, budgets, remittances]);
  const overallScore = Math.round((uaeScore.total + indiaScore.total) / 2);

  // ── Recommendations ─
  const recommendations = useMemo(() =>
    getRecommendations(uaeScore, indiaScore, transactions, debts, budgets),
    [uaeScore, indiaScore, transactions, debts, budgets]
  );

  const activeScore = activeTab === 'UAE' ? uaeScore : indiaScore;
  const activeCurrency: Currency = activeTab === 'UAE' ? 'AED' : 'INR';

  // ── Score ring SVG ──
  const ScoreRing = ({ score, size = 160 }: { score: number; size?: number }) => {
    const r   = (size / 2) - 14;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={12} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Health</h1>
          <p className="page-subtitle">
            Score based on savings, debt, budgets &amp; consistency
          </p>
        </div>
      </div>

      {/* ── Overall Score Card ── */}
      <div className="card" style={{
        marginBottom: 20,
        background: 'linear-gradient(135deg, ' + scoreBg(overallScore) + ', var(--card))',
        border: '1.5px solid ' + scoreColor(overallScore) + '33',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>

          {/* Ring */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <ScoreRing score={overallScore} size={160} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 38, fontWeight: 900, color: scoreColor(overallScore), lineHeight: 1 }}>
                {overallScore}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
                out of 100
              </div>
            </div>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(overallScore), marginBottom: 6 }}>
              {scoreEmoji(overallScore)} {scoreLabel(overallScore)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
              Your overall financial health score combining UAE and India finances.
            </div>

            {/* UAE vs India mini scores */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: '\u{1F1E6}\u{1F1EA} UAE Score',   score: uaeScore.total   },
                { label: '\u{1F1EE}\u{1F1F3} India Score', score: indiaScore.total },
              ].map((item, i) => (
                <div key={i} style={{
                  padding: '10px 16px',
                  borderRadius: 12,
                  background: scoreBg(item.score),
                  border: '1px solid ' + scoreColor(item.score) + '33',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor(item.score) }}>
                    {item.score}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: scoreColor(item.score), fontWeight: 600 }}>
                      {scoreLabel(item.score)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Country Tabs ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['UAE', 'India'] as const).map(c => (
          <button key={c}
            className={'btn ' + (activeTab === c ? 'btn-primary' : 'btn-secondary')}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setActiveTab(c)}>
            {c === 'UAE' ? '\u{1F1E6}\u{1F1EA} UAE Details' : '\u{1F1EE}\u{1F1F3} India Details'}
          </button>
        ))}
      </div>

      {/* ── Score Breakdown ── */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>

        {/* Savings */}
        <div className="stat-card" style={{
          border: '1.5px solid ' + scoreColor(activeScore.savingsScore * (100/30)) + '33',
        }}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: scoreBg(activeScore.savingsScore * (100/30)), color: scoreColor(activeScore.savingsScore * (100/30)) }}>
              <PiggyBank size={20} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor(activeScore.savingsScore * (100/30)) }}>
              {activeScore.savingsScore}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>/30</span>
            </span>
          </div>
          <div className="stat-label">Savings Rate</div>
          <div className="stat-amount" style={{ fontSize: 20, color: scoreColor(activeScore.savingsScore * (100/30)) }}>
            {activeScore.savingsRate.toFixed(1)}%
          </div>
          <div className="stat-note">
            {activeScore.savingsRate >= 20 ? '✅ Excellent' : activeScore.savingsRate >= 10 ? '⚠️ Moderate' : '\u{1F6A8} Low'}
          </div>
          <div style={{ marginTop: 10, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(activeScore.savingsScore / 30) * 100}%`, background: scoreColor(activeScore.savingsScore * (100/30)), borderRadius: 99, transition: 'width 0.8s ease' }} />
          </div>
        </div>

        {/* Debt */}
        <div className="stat-card" style={{
          border: '1.5px solid ' + scoreColor(activeScore.debtScore * (100/25)) + '33',
        }}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: scoreBg(activeScore.debtScore * (100/25)), color: scoreColor(activeScore.debtScore * (100/25)) }}>
              <HandCoins size={20} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor(activeScore.debtScore * (100/25)) }}>
              {activeScore.debtScore}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>/25</span>
            </span>
          </div>
          <div className="stat-label">Debt Ratio</div>
          <div className="stat-amount" style={{ fontSize: 20, color: scoreColor(activeScore.debtScore * (100/25)) }}>
            {activeScore.debtToIncome.toFixed(1)}%
          </div>
          <div className="stat-note">
            {activeScore.debtToIncome === 0 ? '✅ Debt Free' : activeScore.debtToIncome <= 20 ? '✅ Healthy' : activeScore.debtToIncome <= 35 ? '⚠️ Moderate' : '\u{1F6A8} High'}
          </div>
          <div style={{ marginTop: 10, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(activeScore.debtScore / 25) * 100}%`, background: scoreColor(activeScore.debtScore * (100/25)), borderRadius: 99, transition: 'width 0.8s ease' }} />
          </div>
        </div>

        {/* Budget */}
        <div className="stat-card" style={{
          border: '1.5px solid ' + scoreColor(activeScore.budgetScore * (100/25)) + '33',
        }}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: scoreBg(activeScore.budgetScore * (100/25)), color: scoreColor(activeScore.budgetScore * (100/25)) }}>
              <Target size={20} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor(activeScore.budgetScore * (100/25)) }}>
              {activeScore.budgetScore}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>/25</span>
            </span>
          </div>
          <div className="stat-label">Budget Control</div>
          <div className="stat-amount" style={{ fontSize: 20, color: scoreColor(activeScore.budgetScore * (100/25)) }}>
            {activeScore.budgetAdherence === 0 ? 'N/A' : `${activeScore.budgetAdherence.toFixed(0)}%`}
          </div>
          <div className="stat-note">
            {activeScore.budgetAdherence === 0 ? '— No budgets set' : activeScore.budgetAdherence <= 90 ? '✅ Under budget' : activeScore.budgetAdherence <= 100 ? '✅ On budget' : '\u{1F6A8} Over budget'}
          </div>
          <div style={{ marginTop: 10, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(activeScore.budgetScore / 25) * 100}%`, background: scoreColor(activeScore.budgetScore * (100/25)), borderRadius: 99, transition: 'width 0.8s ease' }} />
          </div>
        </div>

        {/* Consistency */}
        <div className="stat-card" style={{
          border: '1.5px solid ' + scoreColor(activeScore.consistencyScore * (100/20)) + '33',
        }}>
          <div className="stat-top">
            <div className="stat-icon" style={{ background: scoreBg(activeScore.consistencyScore * (100/20)), color: scoreColor(activeScore.consistencyScore * (100/20)) }}>
              <CheckCircle size={20} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor(activeScore.consistencyScore * (100/20)) }}>
              {activeScore.consistencyScore}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>/20</span>
            </span>
          </div>
          <div className="stat-label">Consistency</div>
          <div className="stat-amount" style={{ fontSize: 20, color: scoreColor(activeScore.consistencyScore * (100/20)) }}>
            {activeScore.monthsTracked}/3
          </div>
          <div className="stat-note">
            {activeScore.monthsTracked >= 3 ? '✅ 3 months tracked' : activeScore.monthsTracked === 2 ? '⚠️ 2 months tracked' : '\u{1F6A8} Limited data'}
          </div>
          <div style={{ marginTop: 10, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(activeScore.consistencyScore / 20) * 100}%`, background: scoreColor(activeScore.consistencyScore * (100/20)), borderRadius: 99, transition: 'width 0.8s ease' }} />
          </div>
        </div>

      </div>

      {/* ── Detailed Stats ── */}
      <div className="grid grid-2" style={{ marginBottom: 20 }}>

        {/* Score breakdown visual */}
        <div className="card">
          <h3 className="section-title">
            {activeTab === 'UAE' ? '\u{1F1E6}\u{1F1EA}' : '\u{1F1EE}\u{1F1F3}'} {activeTab} Score Breakdown
          </h3>

          {[
            { label: 'Savings Rate',   score: activeScore.savingsScore,    max: 30, icon: '💰' },
            { label: 'Debt Ratio',     score: activeScore.debtScore,       max: 25, icon: '🏦' },
            { label: 'Budget Control', score: activeScore.budgetScore,     max: 25, icon: '📊' },
            { label: 'Consistency',    score: activeScore.consistencyScore, max: 20, icon: '📅' },
          ].map((item, i) => {
            const pct = (item.score / item.max) * 100;
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.icon} {item.label}</span>
                  <span style={{ fontWeight: 800, color: scoreColor(pct) }}>
                    {item.score} / {item.max}
                  </span>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: scoreColor(pct),
                    borderRadius: 99,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            );
          })}

          {/* Total */}
          <div style={{
            marginTop: 8, padding: '12px 16px',
            borderRadius: 12,
            background: scoreBg(activeScore.total),
            border: '1px solid ' + scoreColor(activeScore.total) + '33',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {activeTab === 'UAE' ? '\u{1F1E6}\u{1F1EA} UAE' : '\u{1F1EE}\u{1F1F3} India'} Total Score
            </span>
            <span style={{ fontSize: 24, fontWeight: 900, color: scoreColor(activeScore.total) }}>
              {activeScore.total} / 100
            </span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="card">
          <h3 className="section-title">Key Metrics (Last 3 Months)</h3>

          {[
            {
              label: 'Average Monthly Income',
              value: formatCurrency(
                transactions.filter(t => t.country === activeTab && t.type === 'income' && t.currency === activeCurrency)
                  .reduce((s, t) => s + t.amount, 0) / Math.max(activeScore.monthsTracked, 1),
                activeCurrency
              ),
              icon: <TrendingUp size={16} />,
              color: 'var(--success)',
            },
            {
              label: 'Average Monthly Expense',
              value: formatCurrency(
                transactions.filter(t => t.country === activeTab && t.type === 'expense' && t.currency === activeCurrency)
                  .reduce((s, t) => s + t.amount, 0) / Math.max(activeScore.monthsTracked, 1),
                activeCurrency
              ),
              icon: <TrendingDown size={16} />,
              color: 'var(--danger)',
            },
            {
              label: 'Monthly Debt Payments',
              value: formatCurrency(
                debts.filter(d => d.country === activeTab).reduce((s, d) => s + (d.monthlyPayment ?? 0), 0),
                activeCurrency
              ),
              icon: <HandCoins size={16} />,
              color: 'var(--warning)',
            },
            {
              label: 'Active Debts',
              value: `${debts.filter(d => d.country === activeTab && Math.max(d.totalAmount - d.paidAmount, 0) > 0).length} debts`,
              icon: <AlertTriangle size={16} />,
              color: debts.filter(d => d.country === activeTab && Math.max(d.totalAmount - d.paidAmount, 0) > 0).length === 0 ? 'var(--success)' : 'var(--warning)',
            },
            {
              label: 'Budgets Set This Month',
              value: `${budgets.filter(b => b.country === activeTab).length} categories`,
              icon: <Target size={16} />,
              color: budgets.filter(b => b.country === activeTab).length > 0 ? 'var(--success)' : 'var(--muted)',
            },
          ].map((item, i) => (
            <div key={i} className="country-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                <span style={{ color: item.color }}>{item.icon}</span>
                {item.label}
              </span>
              <strong style={{ color: item.color }}>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recommendations ─ */}
      <div className="card">
        <h3 className="section-title">
          {'💡 Smart Recommendations'}
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginLeft: 8 }}>
            ({recommendations.length} insights)
          </span>
        </h3>

        {recommendations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)' }}>
            <CheckCircle size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p style={{ fontWeight: 600 }}>Add more transactions to get personalized recommendations!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recommendations.map((rec, i) => {
              const borderColor =
                rec.priority === 'high'   ? 'rgba(239,68,68,0.25)' :
                rec.priority === 'medium' ? 'rgba(245,158,11,0.25)' :
                'rgba(16,185,129,0.25)';
              const bgColor =
                rec.priority === 'high'   ? 'rgba(239,68,68,0.05)' :
                rec.priority === 'medium' ? 'rgba(245,158,11,0.05)' :
                'rgba(16,185,129,0.05)';
              const badgeColor =
                rec.priority === 'high'   ? 'var(--danger)' :
                rec.priority === 'medium' ? 'var(--warning)' :
                'var(--success)';
              const badgeBg =
                rec.priority === 'high'   ? 'rgba(239,68,68,0.12)' :
                rec.priority === 'medium' ? 'rgba(245,158,11,0.12)' :
                'rgba(16,185,129,0.12)';

              return (
                <div key={i} style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: '1.5px solid ' + borderColor,
                  background: bgColor,
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>{rec.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                        {rec.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 99,
                        background: badgeBg, color: badgeColor,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {rec.priority}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                      {rec.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── How Score is Calculated ── */}
      <div className="card" style={{
        marginTop: 20,
        background: 'rgba(99,102,241,0.04)',
        border: '1px solid rgba(99,102,241,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Info size={16} style={{ color: 'var(--primary)' }} />
          <h3 className="section-title" style={{ margin: 0, color: 'var(--primary)' }}>
            How Your Score is Calculated
          </h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { label: 'Savings Rate',    pts: '30 pts', desc: 'Based on last 3 months income vs expenses' },
            { label: 'Debt Ratio',      pts: '25 pts', desc: 'Monthly debt payments vs monthly income' },
            { label: 'Budget Control',  pts: '25 pts', desc: 'This month spending vs set budgets' },
            { label: 'Consistency',     pts: '20 pts', desc: 'How regularly you track transactions' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>
                {item.label}
                <span style={{ float: 'right', color: 'var(--primary)', fontWeight: 800 }}>{item.pts}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}