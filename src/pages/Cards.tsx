// Cards.tsx — Full Tabby Pro Implementation

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc,
  onSnapshot, query, Timestamp,
  updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import {
  Plus, Pencil, Trash2, X, ChevronDown, ChevronUp,
  CreditCard, Wallet, Building2, Smartphone,
  Calculator, TrendingDown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  formatCurrency,
  getTabbyOutstanding,
  getTabbyAvailableLimit,
  getTabbyDueForMonth,
  isTabbyProEnabled,
  buildTabbyProSchedule,
  getCurrentMonth,
} from '../firestoreHelpers';
import type { TabbyPurchaseEMI, TabbyInstallment } from '../firestoreHelpers';

// ── Types ──────────────────────────────────────────────────────────────────────

type CardType = 'credit' | 'debit' | 'cash' | 'upi' | 'tabby' | 'custom';
type Country  = 'UAE' | 'India' | 'Both';
type ConversionType =
  | 'zero_interest'
  | 'reducing_balance'
  | 'flat_rate'
  | 'minimum_payment';

interface EMI {
  id: string;
  description: string;
  conversionType: ConversionType;
  principalAmount: number;
  interestRate: number | null;
  totalPayable: number;
  totalInterest: number;
  monthlyAmount: number;
  minimumDue: number | null;
  tenure: number;
  remainingMonths: number;
  paidMonths: number;
  startDate: string;
  outstandingPrincipal: number;
}

interface PaymentMethod {
  id: string;
  userId: string;
  name: string;
  type: CardType;
  country: Country;
  bankName: string | null;
  color: string | null;
  isCashDefault: boolean;
  creditLimit: number | null;
  openingUsed: number | null;
  statementDate: number | null;
  dueDate: number | null;
  emis: EMI[];
  tabbyProEnabled?: boolean;
  tabbyEmis?: TabbyPurchaseEMI[];
}

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'AED' | 'INR';
  paymentMethodId?: string;
  fromMethod?: string;
  toMethod?: string;
  date: string;
  userId: string;
}

interface OpeningBalance {
  perMethod: Record<string, number>;
  asOf: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CARD_TYPES: { value: CardType; label: string; icon: string }[] = [
  { value: 'credit', label: 'Credit Card', icon: '💳' },
  { value: 'debit',  label: 'Debit Card',  icon: '🏦' },
  { value: 'cash',   label: 'Cash',        icon: '💵' },
  { value: 'upi',    label: 'UPI / GPay',  icon: '📱' },
  { value: 'tabby',  label: 'Tabby',       icon: '🛒' },
  { value: 'custom', label: 'Other',       icon: '➕' },
];

const COUNTRIES: { value: Country; label: string; flag: string }[] = [
  { value: 'UAE',   label: 'UAE',   flag: '🇦🇪' },
  { value: 'India', label: 'India', flag: '🇮🇳' },
  { value: 'Both',  label: 'Both',  flag: '🌐' },
];

const CONVERSION_TYPES: {
  value: ConversionType; label: string; icon: string; desc: string;
}[] = [
  { value: 'zero_interest',    label: '0% Plan',          icon: '✅', desc: 'No interest, fixed monthly' },
  { value: 'reducing_balance', label: 'Reducing Balance', icon: '📉', desc: 'Interest on outstanding (bank EMI)' },
  { value: 'flat_rate',        label: 'Flat Rate',        icon: '📊', desc: 'Fixed interest on principal' },
  { value: 'minimum_payment',  label: 'Min Payment',      icon: '⚠️', desc: 'Revolving — pay minimum monthly' },
];

const COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
];

const UAE_BANKS = [
  'ENBD','FAB','ADCB','Mashreq','DIB',
  'CBD','RAK Bank','HSBC UAE','Citibank UAE','Other',
];

const INDIA_BANKS = [
  'SBI','HDFC','ICICI','Axis','Kotak',
  'PNB','BOB','Canara','IndusInd','Federal','Other',
];

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', marginBottom: 6,
  display: 'block', fontWeight: 600,
};

// ── Pure Calculation Helpers ───────────────────────────────────────────────────

interface CalcResult {
  monthlyAmount: number;
  totalPayable: number;
  totalInterest: number;
}

function calcZeroInterest(principal: number, tenure: number): CalcResult {
  const monthly = tenure > 0 ? principal / tenure : 0;
  return { monthlyAmount: monthly, totalPayable: principal, totalInterest: 0 };
}

function calcReducingBalance(principal: number, monthlyRate: number, tenure: number): CalcResult {
  if (monthlyRate <= 0) return calcZeroInterest(principal, tenure);
  const r   = monthlyRate / 100;
  const pow = Math.pow(1 + r, tenure);
  const emi = tenure > 0 ? (principal * r * pow) / (pow - 1) : 0;
  return {
    monthlyAmount: emi,
    totalPayable:  emi * tenure,
    totalInterest: emi * tenure - principal,
  };
}

function calcFlatRate(principal: number, monthlyRate: number, tenure: number): CalcResult {
  const totalInterest = principal * (monthlyRate / 100) * tenure;
  const monthly       = tenure > 0 ? (principal + totalInterest) / tenure : 0;
  return { monthlyAmount: monthly, totalPayable: principal + totalInterest, totalInterest };
}

function calcMinPaymentSummary(
  outstanding: number, monthlyRate: number, minimumDue: number,
): { monthsToPayoff: number; totalInterest: number } {
  if (minimumDue <= 0 || monthlyRate <= 0) return { monthsToPayoff: 0, totalInterest: 0 };
  let bal = outstanding, months = 0, totalInt = 0;
  while (bal > 0.01 && months < 600) {
    const interest = bal * (monthlyRate / 100);
    totalInt += interest;
    bal = bal + interest - minimumDue;
    if (bal < 0) bal = 0;
    months++;
  }
  return { monthsToPayoff: months, totalInterest: totalInt };
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtAED(n: number) {
  return `AED ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtINR(n: number) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmt(n: number, country: string) { return country === 'India' ? fmtINR(n) : fmtAED(n); }
function pad2(n: number) { return String(n).padStart(2, '0'); }

function getDaysLeft(day: number): number {
  const now = new Date();
  let due = new Date(now.getFullYear(), now.getMonth(), day);
  if (due <= now) due = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function UtilizationBar({ used, limit, color = 'var(--primary)' }: { used: number; limit: number; color?: string }) {
  const pct   = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : color;
  return (
    <div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: barColor, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        <span style={{ color: barColor, fontWeight: 700 }}>{pct.toFixed(1)}% utilization</span>
        <span>Available: {fmtAED(Math.max(limit - used, 0))}</span>
      </div>
    </div>
  );
}

function DueBadge({ dueDate, statementDate }: { dueDate: number; statementDate: number | null }) {
  const days  = getDaysLeft(dueDate);
  const color = days <= 3 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)';
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      <span style={{ padding: '4px 10px', borderRadius: 99, background: `${color}18`, border: `1px solid ${color}40`, fontSize: 12, color, fontWeight: 700 }}>
        {days <= 0 ? '⚠️ Overdue!' : `⏰ Due in ${days}d (${dueDate}th)`}
      </span>
      {statementDate && (
        <span style={{ padding: '4px 10px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
          \uD83D\uDCC4 Statement: {statementDate}th
        </span>
      )}
    </div>
  );
}

function InfoRow({ label, value, color = 'var(--text)', bold = false }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 900 : 600 }}>{value}</span>
    </div>
  );
}

// ── EMI Card ───────────────────────────────────────────────────────────────────

function EMICard({ emi, country, onRemove }: { emi: EMI; country: string; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const progress  = emi.tenure > 0 ? (emi.paidMonths / emi.tenure) * 100 : 0;
  const typeInfo  = CONVERSION_TYPES.find((c) => c.value === emi.conversionType);
  const isMinPay  = emi.conversionType === 'minimum_payment';
  const minPaySummary = isMinPay && emi.interestRate && emi.minimumDue
    ? calcMinPaymentSummary(emi.outstandingPrincipal, emi.interestRate, emi.minimumDue)
    : null;

  return (
    <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => setExpanded(p => !p)}>
        <span style={{ fontSize: 20 }}>{typeInfo?.icon ?? '💳'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emi.description}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {typeInfo?.label}{emi.interestRate ? ` · ${emi.interestRate}%/mo` : ''}{!isMinPay ? ` · ${emi.remainingMonths} months left` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: isMinPay ? 'var(--danger)' : 'var(--warning)' }}>
            {isMinPay ? `${fmt(emi.minimumDue ?? 0, country)}/mo min` : `${fmt(emi.monthlyAmount, country)}/mo`}
          </div>
          {!isMinPay && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Outstanding: {fmt(emi.outstandingPrincipal, country)}</div>}
        </div>
        <div style={{ color: 'var(--muted)', flexShrink: 0 }}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </div>

      {!isMinPay && (
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, textAlign: 'right' }}>{emi.paidMonths}/{emi.tenure} months paid</div>
        </div>
      )}

      {isMinPay && emi.interestRate && (
        <div style={{ margin: '0 14px 10px', padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12 }}>
          <div style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠️ Revolving Credit — Interest Accruing</div>
          {minPaySummary && (
            <div style={{ color: 'var(--muted)', marginTop: 4 }}>
              At {emi.interestRate}%/mo + min {fmt(emi.minimumDue ?? 0, country)}/mo: payoff in ~{minPaySummary.monthsToPayoff} months, total interest: {fmt(minPaySummary.totalInterest, country)}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)' }}>
          <InfoRow label="Principal" value={fmt(emi.principalAmount, country)} />
          <InfoRow label="Outstanding" value={fmt(emi.outstandingPrincipal, country)} color="var(--warning)" bold />
          {emi.totalInterest > 0 && <InfoRow label="Total Interest" value={fmt(emi.totalInterest, country)} color="var(--danger)" />}
          <InfoRow label="Total Payable" value={fmt(emi.totalPayable, country)} />
          {emi.interestRate && <InfoRow label="Interest Rate" value={`${emi.interestRate}% / month`} />}
          <InfoRow label="Started" value={emi.startDate} />
          {!isMinPay && (<><InfoRow label="Tenure" value={`${emi.tenure} months`} /><InfoRow label="Remaining" value={`${emi.remainingMonths} months`} /></>)}
          <button type="button" onClick={onRemove} style={{ marginTop: 12, width: '100%', padding: '9px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Trash2 size={14} /> Remove EMI
          </button>
        </div>
      )}
    </div>
  );
}

// ── EMI Form ───────────────────────────────────────────────────────────────────

function EMIForm({ pm, onSave, onCancel }: { pm: PaymentMethod; onSave: (emi: EMI) => void; onCancel: () => void }) {
  const country = pm.country === 'India' ? 'India' : 'UAE';
  const [convType,   setConvType]   = useState<ConversionType>('zero_interest');
  const [desc,       setDesc]       = useState('');
  const [principal,  setPrincipal]  = useState('');
  const [rate,       setRate]       = useState('');
  const [tenure,     setTenure]     = useState('');
  const [paidMonths, setPaidMonths] = useState('0');
  const [startDate,  setStartDate]  = useState(getCurrentMonth());
  const [minimumDue, setMinimumDue] = useState('');
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [minSummary, setMinSummary] = useState<{ monthsToPayoff: number; totalInterest: number } | null>(null);

  const isZero    = convType === 'zero_interest';
  const isMin     = convType === 'minimum_payment';
  const needsRate = !isZero && !isMin;

  const calculate = () => {
    const p = parseFloat(principal);
    const t = parseInt(tenure);
    const r = parseFloat(rate);
    const m = parseFloat(minimumDue);
    if (!p || p <= 0) { toast.error('Enter principal amount'); return; }
    if (isMin) {
      if (!r || r <= 0) { toast.error('Enter interest rate'); return; }
      if (!m || m <= 0) { toast.error('Enter minimum due amount'); return; }
      const summary = calcMinPaymentSummary(p, r, m);
      setMinSummary(summary);
      setCalcResult({ monthlyAmount: m, totalPayable: p + summary.totalInterest, totalInterest: summary.totalInterest });
      return;
    }
    if (!t || t <= 0) { toast.error('Enter tenure'); return; }
    let result: CalcResult;
    if (isZero) result = calcZeroInterest(p, t);
    else if (convType === 'reducing_balance') {
      if (!r || r <= 0) { toast.error('Enter interest rate'); return; }
      result = calcReducingBalance(p, r, t);
    } else {
      if (!r || r <= 0) { toast.error('Enter interest rate'); return; }
      result = calcFlatRate(p, r, t);
    }
    setCalcResult(result);
  };

  const handleSave = () => {
    if (!desc.trim()) { toast.error('Enter description'); return; }
    if (!principal)   { toast.error('Enter amount'); return; }
    const p    = parseFloat(principal);
    const t    = parseInt(tenure) || 0;
    const paid = parseInt(paidMonths) || 0;
    const r    = parseFloat(rate) || 0;
    const m    = parseFloat(minimumDue) || 0;
    if (!calcResult) { toast.error('Calculate first'); return; }

    let outstanding = p;
    if (!isMin && paid > 0) {
      if (isZero || convType === 'flat_rate') {
        outstanding = Math.max(p - (calcResult.monthlyAmount * paid), 0);
      } else {
        let bal = p;
        for (let i = 0; i < paid; i++) {
          const interest  = bal * (r / 100);
          const princ     = calcResult.monthlyAmount - interest;
          bal = Math.max(bal - princ, 0);
        }
        outstanding = bal;
      }
    }

    const emi: EMI = {
      id: Date.now().toString(),
      description: desc.trim(),
      conversionType: convType,
      principalAmount: p,
      interestRate: needsRate || isMin ? r : null,
      totalPayable: calcResult.totalPayable,
      totalInterest: calcResult.totalInterest,
      monthlyAmount: calcResult.monthlyAmount,
      minimumDue: isMin ? m : null,
      tenure: isMin ? 0 : t,
      remainingMonths: isMin ? 0 : Math.max(t - paid, 0),
      paidMonths: paid,
      startDate,
      outstandingPrincipal: isMin ? p : outstanding,
    };
    onSave(emi);
  };

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calculator size={18} color="var(--primary)" />
          <span style={{ fontWeight: 800, fontSize: 15 }}>Add EMI / Conversion</span>
        </div>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Conversion Type *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {CONVERSION_TYPES.map((ct) => {
              const active = convType === ct.value;
              return (
                <button key={ct.value} type="button"
                  onClick={() => { setConvType(ct.value); setCalcResult(null); setMinSummary(null); }}
                  style={{ padding: '10px 8px', borderRadius: 12, border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'rgba(99,102,241,0.15)' : 'var(--bg)', color: active ? 'var(--primary)' : 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ fontSize: 16, marginBottom: 3 }}>{ct.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{ct.label}</div>
                  <div style={{ fontSize: 11, color: active ? 'var(--primary)' : 'var(--muted)', marginTop: 2 }}>{ct.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description *</label>
          <input type="text" placeholder="e.g. Balance Transfer, iPhone EMI" value={desc} onChange={e => setDesc(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>{isMin ? 'Outstanding Balance *' : 'Principal Amount *'}</label>
          <input type="number" inputMode="decimal" placeholder={country === 'India' ? '50000' : '12000'} value={principal} onChange={e => { setPrincipal(e.target.value); setCalcResult(null); }} style={inputStyle} />
        </div>

        {(needsRate || isMin) && (
          <div>
            <label style={labelStyle}>Monthly Interest Rate (%) *</label>
            <input type="number" inputMode="decimal" placeholder="e.g. 3.5" value={rate} onChange={e => { setRate(e.target.value); setCalcResult(null); }} style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>UAE banks usually 2\u20134% per month on outstanding</div>
          </div>
        )}

        {!isMin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Tenure (months) *</label>
              <input type="number" inputMode="numeric" placeholder="12" value={tenure} onChange={e => { setTenure(e.target.value); setCalcResult(null); }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Months Already Paid</label>
              <input type="number" inputMode="numeric" placeholder="0" value={paidMonths} onChange={e => setPaidMonths(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        {isMin && (
          <div>
            <label style={labelStyle}>Minimum Monthly Due *</label>
            <input type="number" inputMode="decimal" placeholder={country === 'India' ? '2000' : '500'} value={minimumDue} onChange={e => { setMinimumDue(e.target.value); setCalcResult(null); }} style={inputStyle} />
          </div>
        )}

        <div>
          <label style={labelStyle}>Start Month</label>
          <input type="month" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>

        <button type="button" onClick={calculate} style={{ padding: '12px', borderRadius: 12, border: '2px solid var(--primary)', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Calculator size={16} /> Calculate
        </button>

        {calcResult && (
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', marginBottom: 10 }}>📊 CALCULATION RESULT</div>
            <InfoRow label="Monthly Payment" value={fmt(calcResult.monthlyAmount, country)} color="var(--primary)" bold />
            <InfoRow label="Total Payable" value={fmt(calcResult.totalPayable, country)} />
            {calcResult.totalInterest > 0 && <InfoRow label="Total Interest Cost" value={fmt(calcResult.totalInterest, country)} color="var(--danger)" />}
            {isMin && minSummary && (
              <>
                <InfoRow label="Months to Pay Off" value={`~${minSummary.monthsToPayoff} months`} color="var(--warning)" />
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'var(--danger)' }}>
                  ⚠️ Paying only minimum is very costly! Consider increasing payment to reduce interest.
                </div>
              </>
            )}
            {calcResult.totalInterest === 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', fontSize: 12, color: 'var(--success)' }}>
                ✅ 0% plan — no interest cost!
              </div>
            )}
          </div>
        )}

        <button type="button" onClick={handleSave} disabled={!calcResult}
          style={{ padding: '13px', borderRadius: 12, border: 'none', background: calcResult ? 'var(--primary)' : 'var(--border)', color: calcResult ? '#fff' : 'var(--muted)', fontWeight: 900, fontSize: 15, cursor: calcResult ? 'pointer' : 'not-allowed' }}
        >
          Save EMI / Conversion
        </button>
      </div>
    </div>
  );
}

// ── Tabby Card Block ───────────────────────────────────────────────────────────

function TabbyCardBlock({ pm, onEdit, onDelete, deleting }: {
  pm: PaymentMethod;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [showPurchases, setShowPurchases] = useState(false);
  const tabbyEmis    = (pm.tabbyEmis || []) as TabbyPurchaseEMI[];
  const outstanding  = getTabbyOutstanding(tabbyEmis);
  const limit        = pm.creditLimit || 0;
  const available    = getTabbyAvailableLimit(limit, tabbyEmis);
  const utilization  = limit > 0 ? Math.min((outstanding / limit) * 100, 100) : 0;
  const currentMonth = getCurrentMonth();
  const { installments: thisMonthDue, totalDue } = getTabbyDueForMonth(tabbyEmis, currentMonth);
  const activePurchases = tabbyEmis.filter(e => !e.isFullyPaid);
  const isPro        = isTabbyProEnabled(pm);

  const dueDay       = pm.dueDate || 3;
  const today        = new Date();
  const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), dueDay);
  const daysUntilDue = Math.floor((dueThisMonth.getTime() - today.getTime()) / 86_400_000);
  const dueColor     = daysUntilDue > 7 ? '#10b981' : daysUntilDue >= 0 ? '#f59e0b' : '#ef4444';
  const dueText      = daysUntilDue > 0 ? `${daysUntilDue} days to due` : daysUntilDue === 0 ? 'Due TODAY' : `${Math.abs(daysUntilDue)}d overdue`;

  return (
    <div style={{ background: 'var(--bg)', border: '1.5px solid rgba(139,92,246,0.35)', borderRadius: 16, overflow: 'hidden', marginBottom: 10 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          🛒
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {pm.name}
            {isPro && (
              <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(139,92,246,0.2)', color: '#8b5cf6', fontSize: 11, fontWeight: 700 }}>PRO</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Tabby · Stmt: {pm.statementDate || '?'}th · Due: {pm.dueDate || '?'}rd
          </div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 20, background: `${dueColor}15`, color: dueColor, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
          {dueText}
        </div>
      </div>

      {/* Limit / Outstanding / Available */}
      <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Limit',       value: fmtAED(limit),       color: 'var(--muted)' },
          { label: 'Outstanding', value: fmtAED(outstanding), color: outstanding > 0 ? '#ef4444' : '#10b981' },
          { label: 'Available',   value: fmtAED(available),   color: '#10b981' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--card)', borderRadius: 10, padding: '8px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginTop: 3 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Utilization bar */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, width: `${utilization}%`, background: utilization > 80 ? '#ef4444' : utilization > 50 ? '#f59e0b' : '#8b5cf6', transition: 'width 0.5s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{utilization.toFixed(1)}% utilized</div>
      </div>

      {/* Due this month */}
      {thisMonthDue.length > 0 && (
        <div style={{ margin: '0 16px 12px', padding: '12px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 14 }}>📅 Due This Month</span>
            <span style={{ fontWeight: 800, color: '#8b5cf6', fontSize: 18 }}>{fmtAED(totalDue)}</span>
          </div>
          {thisMonthDue.map((inst, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>{inst.purchaseName}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Installment {inst.installmentNumber}/4 · Due {inst.dueDate}</div>
              </div>
              <span style={{ fontWeight: 700, color: '#8b5cf6', marginLeft: 12 }}>{fmtAED(inst.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Active purchases */}
      {activePurchases.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <button onClick={() => setShowPurchases(!showPurchases)}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 13 }}
          >
            <span>{activePurchases.length} active purchase{activePurchases.length !== 1 ? 's' : ''}</span>
            {showPurchases ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showPurchases && (
            <div style={{ marginTop: 8 }}>
              {activePurchases.map(emi => {
                const paidCount = emi.installments.filter(i => i.isPaid).length;
                return (
                  <div key={emi.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{emi.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Purchased: {emi.purchaseDate}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtAED(emi.totalAmount)}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{paidCount}/4 paid</div>
                      </div>
                    </div>
                    {/* 4-dot progress */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                      {emi.installments.map((inst, idx) => (
                        <div key={idx} style={{ flex: 1, height: 6, borderRadius: 3, background: inst.isPaid ? '#10b981' : 'var(--border)', transition: 'background 0.3s' }} title={`${inst.dueDate}: ${fmtAED(inst.amount)}`} />
                      ))}
                    </div>
                    {/* Installment grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {emi.installments.map((inst, idx) => (
                        <div key={idx} style={{ textAlign: 'center', fontSize: 11, padding: '4px', borderRadius: 6, background: inst.isPaid ? 'rgba(16,185,129,0.1)' : 'var(--hover)', color: inst.isPaid ? '#10b981' : 'var(--muted)' }}>
                          <div style={{ fontWeight: 700 }}>{fmtAED(inst.amount)}</div>
                          <div>{inst.dueDate.substring(5)}</div>
                          {inst.isPaid && <div>✅</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* No purchases yet */}
      {activePurchases.length === 0 && outstanding === 0 && (
        <div style={{ padding: '0 16px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          ✅ No outstanding Tabby balance
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8 }}>
        <button type="button" onClick={onEdit}
          style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Pencil size={14} /> Edit
        </button>
        <button type="button" onClick={onDelete} disabled={deleting}
          style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deleting ? 0.5 : 1 }}
        >
          <Trash2 size={14} /> {deleting ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Cards({ user }: { user: User }) {
  const [methods,      setMethods]      = useState<PaymentMethod[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [openingBal,   setOpeningBal]   = useState<OpeningBalance | null>(null);
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});
  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<PaymentMethod | null>(null);
  const [showEMIFor,   setShowEMIFor]   = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  // form state
  const [fName,           setFName]           = useState('');
  const [fType,           setFType]           = useState<CardType>('debit');
  const [fCountry,        setFCountry]        = useState<Country>('UAE');
  const [fBank,           setFBank]           = useState('');
  const [fColor,          setFColor]          = useState(COLORS[0]);
  const [fCreditLimit,    setFCreditLimit]    = useState('');
  const [fOpeningUsed,    setFOpeningUsed]    = useState('');
  const [fStatementDate,  setFStatementDate]  = useState('');
  const [fDueDate,        setFDueDate]        = useState('');
  const [fTabbyPro,       setFTabbyPro]       = useState(false);   // NEW

  // ── Listeners ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(
      query(collection(db, 'paymentMethods'), where('userId', '==', user.uid)),
      snap => {
        setMethods(snap.docs.map(d => ({
          id: d.id, ...d.data(),
          emis:      (d.data().emis ?? []) as EMI[],
          tabbyEmis: (d.data().tabbyEmis ?? []) as TabbyPurchaseEMI[],
        } as PaymentMethod)));
      },
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'transactions'), where('userId', '==', user.uid)),
      snap => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction))),
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'openingBalances'), where('userId', '==', user.uid)),
      snap => {
        if (!snap.empty) {
          const data = snap.docs[0].data() as OpeningBalance;
          setOpeningBal({ perMethod: data.perMethod ?? {}, asOf: data.asOf ?? '1970-01-01' });
        }
      },
    ));

    return () => unsubs.forEach(u => u());
  }, [user.uid]);

  // ── Balance calculation ────────────────────────────────────────────────────────

  const getMethodBalance = (pm: PaymentMethod): number => {
    const asOf = openingBal?.asOf ?? '1970-01-01';
    const txs  = transactions.filter(t => t.date > asOf);   // FIXED: > not >=

    // Tabby: use tabbyEmis outstanding instead of transaction-based
    if (pm.type === 'tabby') {
      return getTabbyOutstanding((pm.tabbyEmis || []) as TabbyPurchaseEMI[]);
    }

    if (pm.type === 'credit') {
      const openingUsed = pm.openingUsed ?? 0;
      return txs.reduce((sum, tx) => {
        if (tx.type === 'expense'  && tx.paymentMethodId === pm.id) return sum + tx.amount;
        if (tx.type === 'income'   && tx.paymentMethodId === pm.id) return sum - tx.amount;
        if (tx.type === 'transfer') {
          if (tx.toMethod   === pm.id) return sum - tx.amount;
          if (tx.fromMethod === pm.id) return sum + tx.amount;
        }
        return sum;
      }, openingUsed);
    }

    const opening = openingBal?.perMethod?.[pm.id] ?? 0;
    return txs.reduce((sum, tx) => {
      if (tx.type === 'income'   && tx.paymentMethodId === pm.id) return sum + tx.amount;
      if (tx.type === 'expense'  && tx.paymentMethodId === pm.id) return sum - tx.amount;
      if (tx.type === 'transfer') {
        if (tx.fromMethod === pm.id) return sum - tx.amount;
        if (tx.toMethod   === pm.id) return sum + tx.amount;
      }
      return sum;
    }, opening);
  };

  // ── Form helpers ───────────────────────────────────────────────────────────────

  const resetForm = () => {
    setFName(''); setFType('debit'); setFCountry('UAE');
    setFBank(''); setFColor(COLORS[0]); setFCreditLimit('');
    setFOpeningUsed(''); setFStatementDate(''); setFDueDate('');
    setFTabbyPro(false); setEditTarget(null);
  };

  const openEdit = (pm: PaymentMethod) => {
    setEditTarget(pm);
    setFName(pm.name); setFType(pm.type); setFCountry(pm.country);
    setFBank(pm.bankName ?? ''); setFColor(pm.color ?? COLORS[0]);
    setFCreditLimit(pm.creditLimit != null ? String(pm.creditLimit) : '');
    setFOpeningUsed(pm.openingUsed != null ? String(pm.openingUsed) : '');
    setFStatementDate(pm.statementDate != null ? String(pm.statementDate) : '');
    setFDueDate(pm.dueDate != null ? String(pm.dueDate) : '');
    setFTabbyPro(pm.tabbyProEnabled ?? false);
    setShowForm(true);
  };

  const saveMethod = async () => {
    if (!fName.trim()) { toast.error('Enter a name'); return; }
    setSaving(true);
    try {
      const isTabby  = fType === 'tabby';
      const isCredit = fType === 'credit';
      const needsLimit = isTabby || isCredit;

      const data: Record<string, unknown> = {
        userId: user.uid,
        name:     fName.trim(),
        type:     fType,
        country:  fCountry,
        bankName: fBank || null,
        color:    fColor,
        isCashDefault: fType === 'cash',
        creditLimit:   needsLimit && fCreditLimit ? parseFloat(fCreditLimit) : null,
        openingUsed:   needsLimit && fOpeningUsed ? parseFloat(fOpeningUsed) : null,
        statementDate: needsLimit && fStatementDate ? parseInt(fStatementDate) : null,
        dueDate:       needsLimit && fDueDate ? parseInt(fDueDate) : null,
        // Tabby Pro toggle
        tabbyProEnabled: isTabby ? fTabbyPro : null,
        updatedAt: Timestamp.now(),
      };

      if (editTarget) {
        await updateDoc(doc(db, 'paymentMethods', editTarget.id), data);
        toast.success('Updated!');
      } else {
        await addDoc(collection(db, 'paymentMethods'), {
          ...data, emis: [], tabbyEmis: [], createdAt: Timestamp.now(),
        });
        toast.success('Account added!');
      }
      setShowForm(false); resetForm();
    } catch (e) {
      console.error(e); toast.error('Failed to save');
    } finally { setSaving(false); }
  };

  const deleteMethod = async (id: string) => {
    if (!window.confirm('Delete this account?')) return;
    setDeleting(id);
    try {
      // Soft delete
      await updateDoc(doc(db, 'paymentMethods', id), { isDeleted: true, updatedAt: Timestamp.now() });
      toast.success('Deleted');
    } catch { toast.error('Failed'); }
    finally   { setDeleting(null); }
  };

  // ── EMI helpers ────────────────────────────────────────────────────────────────

  const saveEMI = async (pm: PaymentMethod, emi: EMI) => {
    const updated = [...(pm.emis ?? []), emi];
    await updateDoc(doc(db, 'paymentMethods', pm.id), { emis: updated });
    toast.success('EMI saved!');
    setShowEMIFor(null);
  };

  const removeEMI = async (pm: PaymentMethod, emiId: string) => {
    const updated = pm.emis.filter(e => e.id !== emiId);
    await updateDoc(doc(db, 'paymentMethods', pm.id), { emis: updated });
    toast.success('EMI removed');
  };

  // ── Grouping ───────────────────────────────────────────────────────────────────

  const visibleMethods = methods.filter(m => !m.isDeleted);
  const tabbyMethods   = visibleMethods.filter(m => m.type === 'tabby');
  const banks          = Array.from(new Set(visibleMethods.filter(m => m.bankName && m.type !== 'tabby').map(m => m.bankName!)));
  const cashMethods    = visibleMethods.filter(m => m.type === 'cash');
  const otherMethods   = visibleMethods.filter(m => m.type !== 'cash' && m.type !== 'tabby' && !m.bankName);

  // ── Summary totals ─────────────────────────────────────────────────────────────

  const uaeLiquid = visibleMethods
    .filter(m => m.country !== 'India' && m.type !== 'credit' && m.type !== 'tabby')
    .reduce((s, m) => s + getMethodBalance(m), 0);

  const indiaLiquid = visibleMethods
    .filter(m => m.country === 'India' && m.type !== 'credit')
    .reduce((s, m) => s + getMethodBalance(m), 0);

  const creditCards     = visibleMethods.filter(m => m.type === 'credit');
  const totalUsed       = creditCards.reduce((s, m) => s + getMethodBalance(m), 0);
  const totalLimit      = creditCards.reduce((s, m) => s + (m.creditLimit ?? 0), 0);
  const totalMonthlyEMI = creditCards.reduce((s, m) => s + m.emis.reduce((es, e) => es + e.monthlyAmount, 0), 0);

  // Tabby summary
  const tabbyOutstanding = tabbyMethods.reduce((s, m) => s + getTabbyOutstanding((m.tabbyEmis || []) as TabbyPurchaseEMI[]), 0);
  const tabbyLimit       = tabbyMethods.reduce((s, m) => s + (m.creditLimit || 0), 0);
  const tabbyDueMonth    = tabbyMethods.reduce((s, m) => {
    const { totalDue } = getTabbyDueForMonth((m.tabbyEmis || []) as TabbyPurchaseEMI[], getCurrentMonth());
    return s + totalDue;
  }, 0);

  // ── Card renderer ──────────────────────────────────────────────────────────────

  const renderCard = (pm: PaymentMethod) => {
    // Tabby gets its own renderer
    if (pm.type === 'tabby') {
      return (
        <TabbyCardBlock
          key={pm.id}
          pm={pm}
          onEdit={() => openEdit(pm)}
          onDelete={() => deleteMethod(pm.id)}
          deleting={deleting === pm.id}
        />
      );
    }

    const isCredit   = pm.type === 'credit';
    const balance    = getMethodBalance(pm);
    const limit      = pm.creditLimit ?? 0;
    const available  = limit - balance;
    const country    = pm.country === 'India' ? 'India' : 'UAE';
    const isExpanded = expanded[pm.id] ?? false;
    const typeInfo   = CARD_TYPES.find(c => c.value === pm.type);
    const totalEMIMonthly = pm.emis.reduce((s, e) => s + e.monthlyAmount, 0);

    const usedAmount       = isCredit ? (balance < 0 ? Math.abs(balance) : balance) : 0;
    const currentAvailable = Math.max(0, limit - usedAmount);
    const utilization      = limit > 0 ? Math.min((usedAmount / limit) * 100, 100) : 0;

    return (
      <div key={pm.id} style={{ background: 'var(--bg)', border: `1.5px solid ${(pm.color ?? '#6366f1')}35`, borderRadius: 16, overflow: 'hidden', marginBottom: 10 }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
          onClick={() => setExpanded(p => ({ ...p, [pm.id]: !p[pm.id] }))}
        >
          <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: (pm.color ?? '#6366f1') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {typeInfo?.icon ?? '💳'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {typeInfo?.label}{pm.bankName ? ` · ${pm.bankName}` : ''} · {pm.country === 'India' ? '🇮🇳' : pm.country === 'UAE' ? '🇦🇪' : '🌐'}
              {isCredit && pm.emis.length > 0 ? ` · ${pm.emis.length} EMI` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {!isCredit && (
              <div style={{ fontSize: 14, fontWeight: 900, color: balance >= 0 ? (pm.color ?? 'var(--success)') : 'var(--danger)' }}>
                {balance < 0 ? '-' : ''}{fmt(Math.abs(balance), country)}
              </div>
            )}
          </div>
          <div style={{ color: 'var(--muted)', flexShrink: 0 }}>{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
        </div>

        {/* Credit utilization bar */}
        {isCredit && limit > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: 'var(--muted)' }}>Limit: <strong>{fmt(limit, country)}</strong></span>
              <span style={{ color: 'var(--muted)' }}>Avail: <strong style={{ color: 'var(--success)' }}>{fmt(currentAvailable, country)}</strong></span>
            </div>
            <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${utilization}%`, background: utilization > 85 ? 'var(--danger)' : utilization > 60 ? 'var(--warning)' : 'var(--primary)', borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
              <span>Used: {fmt(usedAmount, country)}</span>
              {balance < 0 && <span style={{ color: 'var(--success)' }}>Overpaid: {fmt(Math.abs(balance), country)}</span>}
            </div>
          </div>
        )}

        {/* Due badge — credit only */}
        {isCredit && pm.dueDate && (
          <div style={{ padding: '0 16px 12px' }}>
            <DueBadge dueDate={pm.dueDate} statementDate={pm.statementDate} />
          </div>
        )}

        {/* Expanded */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
            {isCredit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Limit',     value: fmt(limit, country),                    color: 'var(--muted)' },
                  { label: 'Used',      value: fmt(balance, country),                  color: 'var(--warning)' },
                  { label: 'Available', value: fmt(Math.max(available, 0), country),   color: available > 0 ? 'var(--success)' : 'var(--danger)' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--card)', borderRadius: 12, padding: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: item.color, marginTop: 4 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* EMIs */}
            {isCredit && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', letterSpacing: 0.5 }}>
                    💳 EMI / CONVERSIONS
                    {pm.emis.length > 0 && (
                      <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', fontSize: 11 }}>
                        {fmt(totalEMIMonthly, country)}/mo total
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowEMIFor(showEMIFor === pm.id ? null : pm.id)}
                    style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--primary)', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={13} /> Add EMI
                  </button>
                </div>

                {showEMIFor === pm.id && (
                  <EMIForm pm={pm} onSave={emi => saveEMI(pm, emi)} onCancel={() => setShowEMIFor(null)} />
                )}

                {pm.emis.length === 0 && showEMIFor !== pm.id ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
                    No EMIs yet — tap "Add EMI" to track conversions
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pm.emis.map(emi => (
                      <EMICard key={emi.id} emi={emi} country={country} onRemove={() => removeEMI(pm, emi.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => openEdit(pm)}
                style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Pencil size={14} /> Edit
              </button>
              <button type="button" onClick={() => deleteMethod(pm.id)} disabled={deleting === pm.id}
                style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: deleting === pm.id ? 0.5 : 1 }}
              >
                <Trash2 size={14} /> {deleting === pm.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Section helper ─────────────────────────────────────────────────────────────

  const renderSection = (title: string, icon: React.ReactNode, items: PaymentMethod[], color: string) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)', letterSpacing: 0.5 }}>{title}</span>
        </div>
        {items.map(pm => renderCard(pm))}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Cards & Accounts</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{visibleMethods.length} account{visibleMethods.length !== 1 ? 's' : ''}</div>
        </div>
        <button type="button" onClick={() => { resetForm(); setShowForm(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 14, background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
        >
          <Plus size={18} /> Add
        </button>
      </div>

      {/* Summary strip */}
      {visibleMethods.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: tabbyMethods.length > 0 ? 'repeat(4, 1fr)' : creditCards.length > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>🇦🇪 UAE Liquid</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--success)', marginTop: 4 }}>{fmtAED(uaeLiquid)}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>🇮🇳 India Liquid</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--warning)', marginTop: 4 }}>{fmtINR(indiaLiquid)}</div>
          </div>
          {creditCards.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '14px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>💳 Credit Used</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--danger)', marginTop: 4 }}>{fmtAED(totalUsed)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>of {fmtAED(totalLimit)}</div>
              {totalMonthlyEMI > 0 && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4, fontWeight: 700 }}>EMI: {fmtAED(totalMonthlyEMI)}/mo</div>}
            </div>
          )}
          {tabbyMethods.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.05))', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 16, padding: '14px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>🛒 Tabby</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#8b5cf6', marginTop: 4 }}>{fmtAED(tabbyOutstanding)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>of {fmtAED(tabbyLimit)}</div>
              {tabbyDueMonth > 0 && <div style={{ fontSize: 11, color: '#8b5cf6', marginTop: 4, fontWeight: 700 }}>Due: {fmtAED(tabbyDueMonth)}</div>}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {visibleMethods.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', borderRadius: 20, border: '1px solid var(--border)' }}>
          <CreditCard size={48} style={{ color: 'var(--muted)', marginBottom: 12 }} />
          <div style={{ fontWeight: 800, fontSize: 18 }}>No accounts yet</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>Add your cards and bank accounts</div>
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }}
            style={{ marginTop: 20, padding: '12px 28px', borderRadius: 14, background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
          >
            + Add Account
          </button>
        </div>
      )}

      {/* Tabby section */}
      {tabbyMethods.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16 }}>🛒</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)', letterSpacing: 0.5 }}>TABBY / BNPL</span>
          </div>
          {tabbyMethods.map(pm => renderCard(pm))}
        </div>
      )}

      {/* Banks */}
      {banks.map(bank => {
        const bm   = visibleMethods.filter(m => m.bankName === bank);
        const flag = bm[0]?.country === 'India' ? '🇮🇳' : bm[0]?.country === 'UAE' ? '🇦🇪' : '🌐';
        return (
          <div key={bank} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={16} color="var(--primary)" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)' }}>{flag} {bank}</span>
            </div>
            {bm.map(pm => renderCard(pm))}
          </div>
        );
      })}

      {renderSection('CASH', <Wallet size={16} color="var(--success)" />, cashMethods, '#10b981')}
      {renderSection('OTHERS', <Smartphone size={16} color="var(--primary)" />, otherMethods, '#6366f1')}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); resetForm(); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
        >
          <div style={{ background: 'var(--card)', borderRadius: '26px 26px 0 0', padding: '24px 20px 44px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 900, fontSize: 20 }}>{editTarget ? 'Edit Account' : 'Add Account'}</div>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Type */}
              <div>
                <label style={labelStyle}>Account Type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {CARD_TYPES.map(ct => {
                    const active = fType === ct.value;
                    return (
                      <button key={ct.value} type="button" onClick={() => setFType(ct.value)}
                        style={{ padding: '10px 6px', borderRadius: 12, border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--card)', color: active ? '#fff' : 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                      >
                        <span style={{ fontSize: 20 }}>{ct.icon}</span>
                        {ct.label}
                      </button>
                    );
                  })}
                </div>
                {editTarget && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>Type cannot be changed after creation.</div>}
              </div>

              {/* Country */}
              <div>
                <label style={labelStyle}>Country *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {COUNTRIES.map(c => {
                    const active = fCountry === c.value;
                    return (
                      <button key={c.value} type="button" onClick={() => { setFCountry(c.value); setFBank(''); }}
                        style={{ flex: 1, padding: '10px', borderRadius: 12, border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : 'var(--card)', color: active ? '#fff' : 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                      >
                        {c.flag} {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bank — for credit/debit (not tabby) */}
              {(fType === 'credit' || fType === 'debit') && (
                <div>
                  <label style={labelStyle}>Bank</label>
                  <select value={fBank} onChange={e => setFBank(e.target.value)} style={inputStyle}>
                    <option value="">Select bank (optional)</option>
                    {(fCountry === 'India' ? INDIA_BANKS : UAE_BANKS).map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              {/* Name */}
              <div>
                <label style={labelStyle}>Account Name *</label>
                <input type="text"
                  placeholder={fType === 'credit' ? 'e.g. ENBD Credit Card' : fType === 'tabby' ? 'e.g. Tabby' : fType === 'cash' ? 'e.g. Cash UAE' : 'e.g. ENBD Debit'}
                  value={fName} onChange={e => setFName(e.target.value)} style={inputStyle}
                />
              </div>

              {/* Credit card fields */}
              {fType === 'credit' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Credit Limit</label>
                      <input type="number" placeholder="15000" value={fCreditLimit} onChange={e => setFCreditLimit(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Opening Used Balance</label>
                      <input type="number" placeholder="3200" value={fOpeningUsed} onChange={e => setFOpeningUsed(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Statement Date</label>
                      <input type="number" placeholder="20" min="1" max="31" value={fStatementDate} onChange={e => setFStatementDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Due Date</label>
                      <input type="number" placeholder="15" min="1" max="31" value={fDueDate} onChange={e => setFDueDate(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  {fOpeningUsed && fCreditLimit && (
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 13 }}>
                      <div style={{ color: 'var(--warning)', fontWeight: 700 }}>
                        Opening: {fCountry === 'India' ? '₹' : 'AED '}{parseFloat(fOpeningUsed || '0').toLocaleString()} used
                      </div>
                      <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 12 }}>
                        Available: {fCountry === 'India' ? '₹' : 'AED '}{Math.max(parseFloat(fCreditLimit) - parseFloat(fOpeningUsed), 0).toLocaleString()}
                      </div>
                      <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: 11 }}>💡 Add EMI details after saving the card</div>
                    </div>
                  )}
                </>
              )}

              {/* TABBY FIELDS — NEW */}
              {fType === 'tabby' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Credit Limit (AED)</label>
                      <input type="number" placeholder="5000" value={fCreditLimit} onChange={e => setFCreditLimit(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Current Outstanding</label>
                      <input type="number" placeholder="0" value={fOpeningUsed} onChange={e => setFOpeningUsed(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Statement Date (day)</label>
                      <input type="number" min="1" max="31" placeholder="23" value={fStatementDate} onChange={e => setFStatementDate(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Due Date (day)</label>
                      <input type="number" min="1" max="31" placeholder="3" value={fDueDate} onChange={e => setFDueDate(e.target.value)} style={inputStyle} />
                    </div>
                  </div>

                  {/* Tabby Pro Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(139,92,246,0.08)', borderRadius: 14, border: '1px solid rgba(139,92,246,0.25)' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 15 }}>
                        💳 Tabby Pro
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Auto-split every purchase into 4 equal installments
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => setFTabbyPro(p => !p)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: fTabbyPro ? '#8b5cf6' : 'var(--muted)', padding: 0 }}
                    >
                      {fTabbyPro ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                    </button>
                  </div>

                  {/* Tabby Pro explanation */}
                  {fTabbyPro && (
                    <div style={{ padding: '12px 14px', background: 'rgba(139,92,246,0.05)', borderRadius: 12, fontSize: 13, color: 'var(--muted)', borderLeft: '3px solid #8b5cf6' }}>
                      <strong style={{ color: '#8b5cf6' }}>How Tabby Pro works:</strong>
                      <br />\u2022 Every purchase auto-splits into 4 equal installments
                      <br />\u2022 Purchases before {fStatementDate || '23'}th → first due next month {fDueDate || '3'}rd
                      <br />\u2022 Purchases after {fStatementDate || '23'}th → first due month-after-next {fDueDate || '3'}rd
                      <br />\u2022 Zero interest, zero fees
                    </div>
                  )}

                  {fCreditLimit && (
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13 }}>
                      <div style={{ color: '#8b5cf6', fontWeight: 700 }}>Limit: {fmtAED(parseFloat(fCreditLimit || '0'))}</div>
                      <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 12 }}>
                        Available: {fmtAED(Math.max(parseFloat(fCreditLimit) - parseFloat(fOpeningUsed || '0'), 0))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Color */}
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setFColor(c)}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: fColor === c ? '3px solid white' : 'none', outlineOffset: 2, transform: fColor === c ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.15s' }}
                    />
                  ))}
                </div>
              </div>

              <button type="button" onClick={saveMethod} disabled={saving}
                style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 900, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginTop: 4 }}
              >
                {saving ? 'Saving...' : editTarget ? 'Update Account' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}