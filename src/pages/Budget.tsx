// src/pages/Budget.tsx
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Plus, ChevronLeft, ChevronRight, Edit2, Trash2,
  Check, Banknote, CreditCard, TrendingUp,
  AlertTriangle, X, Save, Copy, Flag, Wallet,
  PiggyBank, ShoppingBag, ArrowRightLeft, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAllDebtPaymentsDueForMonth,
  getTabbyDueForMonth,
} from '../firestoreHelpers';
import type { CashFlowItem, TabbyPurchaseEMI } from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

type Country      = 'UAE' | 'India';
type Currency     = 'AED' | 'INR';
type PaymentType  = 'cash' | 'credit' | 'tabby';
type CategoryType = 'savings' | 'expense' | 'debt_payment'; // ← UPDATED: added debt_payment

type SavingsCategory =
  | 'home_loan_emi' | 'car_loan_emi' | 'personal_loan_emi'
  | 'chitti_kuri' | 'mutual_fund_sip' | 'recurring_deposit'
  | 'fixed_deposit' | 'gold_savings' | 'ppf_nps' | 'other_savings';

type ExpenseCategory =
  | 'rent' | 'food_groceries' | 'utilities' | 'transport'
  | 'healthcare' | 'education' | 'entertainment'
  | 'shopping' | 'remittance' | 'other_expense';

type BudgetItem = {
  id?: string;
  userId: string;
  country: Country;
  name: string;
  paymentType: PaymentType;
  defaultAmount: number;
  currency: Currency;
  startMonth: string;
  endMonth: string | null;
  isActive: boolean;
  categoryType: CategoryType;
  savingsCategory?: SavingsCategory;
  expenseCategory?: ExpenseCategory;
  createdAt?: any;
};

type MonthOverride = {
  id?: string;
  userId: string;
  budgetItemId: string;
  month: string;
  amount: number;
  isPaid: boolean;
  paidDate: string | null;
  note: string | null;
  updatedAt?: any;
};

type BudgetIncome = {
  id?: string;
  userId: string;
  country: Country;
  month: string;
  salary: number;
  other: number;
  currency: Currency;
  updatedAt?: any;
};

// Payment method (for Tabby)
type PaymentMethod = {
  id: string;
  userId: string;
  type: string;
  country: string;
  creditLimit?: number;
  tabbyProEnabled?: boolean;
  tabbyEmis?: TabbyPurchaseEMI[];
  statementDate?: number;
  dueDate?: number;
  emis?: any[];
  isDeleted?: boolean;
};

// Debt
type Debt = {
  id: string;
  userId: string;
  name: string;
  lender: string;
  country: Country;
  currency: Currency;
  debtMode: 'i_owe' | 'owed_to_me';
  totalAmount: number;
  paidAmount: number;
  monthlyPayment?: number;
  dueDate?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SAVINGS_CATEGORIES: { value: SavingsCategory; label: string; icon: string }[] = [
  { value: 'home_loan_emi',     label: 'Home Loan EMI',      icon: '🏠' },
  { value: 'car_loan_emi',      label: 'Car Loan EMI',       icon: '🚗' },
  { value: 'personal_loan_emi', label: 'Personal Loan EMI',  icon: '💳' },
  { value: 'chitti_kuri',       label: 'Chitti / Kuri',      icon: '🤝' },
  { value: 'mutual_fund_sip',   label: 'Mutual Fund / SIP',  icon: '📈' },
  { value: 'recurring_deposit', label: 'Recurring Deposit',  icon: '🏦' },
  { value: 'fixed_deposit',     label: 'Fixed Deposit',      icon: '🔒' },
  { value: 'gold_savings',      label: 'Gold Savings',       icon: '🪙' },
  { value: 'ppf_nps',           label: 'PPF / NPS',          icon: '🛡️' },
  { value: 'other_savings',     label: 'Other Savings',      icon: '💰' },
];

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'rent',           label: 'Rent',             icon: '🏠' },
  { value: 'food_groceries', label: 'Food & Groceries', icon: '🛒' },
  { value: 'utilities',      label: 'Utilities',        icon: '💡' },
  { value: 'transport',      label: 'Transport',        icon: '🚌' },
  { value: 'healthcare',     label: 'Healthcare',       icon: '🏥' },
  { value: 'education',      label: 'Education',        icon: '📚' },
  { value: 'entertainment',  label: 'Entertainment',    icon: '🎬' },
  { value: 'shopping',       label: 'Shopping',         icon: '🛒' },
  { value: 'remittance',     label: 'Remittance',       icon: '💸' },
  { value: 'other_expense',  label: 'Other Expense',    icon: '\uD83D\uDCE6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

const paymentColor = (type: PaymentType) => {
  if (type === 'cash')   return 'var(--success)';
  if (type === 'credit') return 'var(--danger)';
  return '#8b5cf6';
};

const paymentLabel = (type: PaymentType) => {
  if (type === 'cash')   return '💵 Cash/Bank';
  if (type === 'credit') return '💳 Credit';
  return '🟣 Tabby';
};

const isItemActiveInMonth = (item: BudgetItem, month: string): boolean => {
  if (!item.isActive) return false;
  if (item.startMonth > month) return false;
  if (item.endMonth && item.endMonth < month) return false;
  return true;
};

const getSavingsCategoryInfo  = (val?: SavingsCategory) =>
  SAVINGS_CATEGORIES.find(c => c.value === val);
const getExpenseCategoryInfo = (val?: ExpenseCategory) =>
  EXPENSE_CATEGORIES.find(c => c.value === val);

// ─── Cash Flow Summary Component ─────────────────────────────────────────────

interface CashFlowSummaryProps {
  totalIncome: number;
  totalExpenses: number;
  totalSavings: number;
  totalDebtPayments: number;
  currency: Currency;
}

function CashFlowSummary({
  totalIncome, totalExpenses, totalSavings, totalDebtPayments, currency,
}: CashFlowSummaryProps) {
  const surplus = totalIncome - totalExpenses - totalSavings - totalDebtPayments;

  return (
    <div style={{
      padding: '14px', background: 'var(--bg)', borderRadius: '12px',
      border: '1px solid var(--border)', marginTop: '8px',
    }}>
      {/* Title */}
      <div style={{
        fontSize: '12px', fontWeight: 700, color: 'var(--text)',
        marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        💰 Cash Flow Forecast
      </div>

      {/* Rows */}
      {[
        {
          label: '📥 Income',
          value: totalIncome,
          color: 'var(--success)',
          sign: '+',
          note: '',
        },
        {
          label: '💸 Expenses',
          value: totalExpenses,
          color: 'var(--danger)',
          sign: '−',
          note: 'cash gone',
        },
        {
          label: '💰 Savings',
          value: totalSavings,
          color: 'var(--success)',
          sign: '−',
          note: 'cash parked',
        },
        ...(totalDebtPayments > 0 ? [{
          label: '💳 Debt Payments',
          value: totalDebtPayments,
          color: '#8b5cf6',
          sign: '−',
          note: 'cash moves',
        }] : []),
      ].map(row => (
        <div key={row.label} style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', fontSize: '12px', marginBottom: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', background: row.color,
            }} />
            <span style={{ color: 'var(--muted)' }}>{row.label}</span>
            {row.note && (
              <span style={{
                fontSize: '10px', color: row.color, opacity: 0.7,
                padding: '1px 5px', borderRadius: '4px',
                background: row.color + '15',
              }}>
                {row.note}
              </span>
            )}
          </div>
          <span style={{ fontWeight: 600, color: row.color }}>
            {row.sign} {formatAmt(row.value, currency)}
          </span>
        </div>
      ))}

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />

      {/* Surplus / Deficit */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 12px', borderRadius: '8px',
        background: surplus >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
      }}>
        <span style={{
          fontWeight: 700, fontSize: '13px',
          color: surplus >= 0 ? 'var(--success)' : 'var(--danger)',
        }}>
          {surplus >= 0 ? '✅ Surplus' : '🚨 Deficit'}
        </span>
        <span style={{
          fontWeight: 800, fontSize: '16px',
          color: surplus >= 0 ? 'var(--success)' : 'var(--danger)',
        }}>
          {surplus >= 0 ? '+' : ''}{formatAmt(surplus, currency)}
        </span>
      </div>

      {/* Insight */}
      <div style={{
        marginTop: '8px', padding: '8px 10px', borderRadius: '8px',
        fontSize: '11px', lineHeight: '1.5',
        background: surplus >= 0 ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
        color: surplus >= 0 ? 'var(--success)' : 'var(--danger)',
      }}>
        {surplus >= 0 ? (
          <>
            <strong>Good!</strong> After all payments, {formatAmt(surplus, currency)} free cash.
            {totalDebtPayments > 0 && (
              <> Debt payments ({formatAmt(totalDebtPayments, currency)}) reduce your liability — net worth unchanged.</>
            )}
          </>
        ) : (
          <>
            <strong>⚠️ Warning:</strong> Cash outflow exceeds income by {formatAmt(Math.abs(surplus), currency)}.
            Consider reducing expenses or arrange additional funds.
          </>
        )}
      </div>
    </div>
  );
}

// ─── Debt Payment Section ─────────────────────────────────────────────────────

interface DebtPaymentSectionProps {
  items: CashFlowItem[];
  currency: Currency;
}

function DebtPaymentSection({ items, currency }: DebtPaymentSectionProps) {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;

  const totalDue = items.reduce((s, i) => s + i.amount, 0);

  const SOURCE_META: Record<string, { label: string; color: string }> = {
    auto_tabby:   { label: '💳 Tabby Installments', color: '#8b5cf6' },
    auto_cc_emi:  { label: '💳 Credit Card EMIs',   color: '#f59e0b' },
    auto_loan:    { label: '🏦 Loan / Debt EMIs',   color: '#ef4444' },
  };

  const grouped: Record<string, CashFlowItem[]> = {};
  items.forEach(item => {
    if (!grouped[item.source]) grouped[item.source] = [];
    grouped[item.source].push(item);
  });

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Section Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px', padding: '6px 10px', borderRadius: '8px',
        background: 'rgba(139,92,246,0.08)',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color: '#8b5cf6',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <ArrowRightLeft size={11} /> Debt Payments
          <span style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
            background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
          }}>
            AUTO
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: '12px', color: '#8b5cf6' }}>
          {formatAmt(totalDue, currency)}
        </div>
      </div>

      {expanded && (
        <>
          {/* Info banner */}
          <div style={{
            padding: '8px 12px', borderRadius: '8px', marginBottom: '8px',
            background: 'rgba(139,92,246,0.05)',
            border: '1px solid rgba(139,92,246,0.15)',
            fontSize: '11px', color: 'var(--muted)',
            display: 'flex', alignItems: 'flex-start', gap: '6px',
          }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: '1px', color: '#8b5cf6' }} />
            <span>
              Cash moves from bank to pay CC/Tabby/Loan.
              Your net worth stays the same — only cash balance decreases.
            </span>
          </div>

          {/* Grouped items */}
          {Object.entries(grouped).map(([source, sourceItems]) => {
            const meta = SOURCE_META[source] || { label: source, color: '#8b5cf6' };
            return (
              <div key={source} style={{ marginBottom: '8px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 700,
                  color: meta.color, marginBottom: '4px', paddingLeft: '4px',
                }}>
                  {meta.label}
                </div>
                {sourceItems.map(item => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '8px',
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    marginBottom: '4px',
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: meta.color, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '12px', fontWeight: 600, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.name}
                      </div>
                      {item.note && (
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{item.note}</div>
                      )}
                      {item.dueDate && (
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          Due: {item.dueDate}
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: meta.color, fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {formatAmt(item.amount, item.currency as Currency)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({
  userId, country, currentMonth, editItem, onClose,
}: {
  userId: string;
  country: Country;
  currentMonth: string;
  editItem?: BudgetItem | null;
  onClose: () => void;
}) {
  const [name,             setName]             = useState(editItem?.name || '');
  const [amount,           setAmount]           = useState(String(editItem?.defaultAmount || ''));
  const [paymentType,      setPaymentType]      = useState<PaymentType>(editItem?.paymentType || 'cash');
  const [startMonth,       setStartMonth]       = useState(editItem?.startMonth || currentMonth);
  const [endMonth,         setEndMonth]         = useState(editItem?.endMonth || '');
  const [categoryType,     setCategoryType]     = useState<'savings' | 'expense'>(
    editItem?.categoryType === 'savings' ? 'savings' : 'expense'
  );
  const [savingsCategory,  setSavingsCategory]  = useState<SavingsCategory>(
    editItem?.savingsCategory || 'other_savings'
  );
  const [expenseCategory,  setExpenseCategory]  = useState<ExpenseCategory>(
    editItem?.expenseCategory || 'other_expense'
  );
  const [saving, setSaving] = useState(false);
  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  const handleSave = async () => {
    if (!name.trim())                 { toast.error('Name required'); return; }
    if (!amount || isNaN(Number(amount))) { toast.error('Valid amount required'); return; }
    setSaving(true);
    try {
      const data: Record<string, any> = {
        userId, country, name: name.trim(), paymentType,
        defaultAmount: Number(amount), currency,
        startMonth, endMonth: endMonth || null, isActive: true,
        categoryType,
        savingsCategory: categoryType === 'savings' ? savingsCategory : null,
        expenseCategory: categoryType === 'expense' ? expenseCategory : null,
      };

      if (editItem?.id) {
        await updateDoc(doc(db, 'budgetItems', editItem.id), data);
        toast.success('Updated!');
      } else {
        await addDoc(collection(db, 'budgetItems'), { ...data, createdAt: serverTimestamp() });
        toast.success('Added!');
      }
      onClose();
    } catch (e: any) {
      console.error('[Budget] Error:', e?.code, e?.message);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const iStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  };
  const lStyle: React.CSSProperties = {
    fontSize: '12px', color: 'var(--muted)',
    display: 'block', marginBottom: '6px', fontWeight: 600,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '460px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
            {editItem ? 'Edit Item' : `Add ${country} Item`}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Category Type Toggle */}
        <label style={lStyle}>Category Type</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {([
            { val: 'expense', label: '🔴 Expense', color: 'var(--danger)' },
            { val: 'savings', label: '💰 Savings', color: 'var(--success)' },
          ] as const).map(({ val, label, color }) => (
            <button key={val} onClick={() => setCategoryType(val)}
              style={{
                flex: 1, padding: '10px', borderRadius: '10px',
                border: `2px solid ${categoryType === val ? color : 'var(--border)'}`,
                background: categoryType === val ? color + '18' : 'var(--bg)',
                color: categoryType === val ? color : 'var(--muted)',
                cursor: 'pointer', fontSize: '13px', fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sub Category */}
        <label style={lStyle}>
          {categoryType === 'savings' ? 'Savings Type' : 'Expense Category'}
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' }}>
          {(categoryType === 'savings' ? SAVINGS_CATEGORIES : EXPENSE_CATEGORIES).map(cat => {
            const isSelected = categoryType === 'savings'
              ? savingsCategory === cat.value
              : expenseCategory === cat.value;
            return (
              <button key={cat.value}
                onClick={() => {
                  if (categoryType === 'savings') setSavingsCategory(cat.value as SavingsCategory);
                  else setExpenseCategory(cat.value as ExpenseCategory);
                }}
                style={{
                  padding: '8px 10px', borderRadius: '8px', textAlign: 'left',
                  border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--primary)18' : 'var(--bg)',
                  color: isSelected ? 'var(--primary)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '12px', fontWeight: isSelected ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <span>{cat.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Name */}
        <label style={lStyle}>Description *</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder={categoryType === 'savings' ? 'e.g. SBI Home Loan, Muthoot Chitti' : 'e.g. Rent, DEWA Bill, School Fees'}
          style={{ ...iStyle, marginBottom: '14px' }}
        />

        {/* Amount */}
        <label style={lStyle}>Default Amount ({currency}) *</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0.00" style={{ ...iStyle, marginBottom: '14px' }}
        />

        {/* Payment Type */}
        <label style={lStyle}>Payment Method</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {(['cash', 'credit', 'tabby'] as PaymentType[]).map(pt => (
            <button key={pt} onClick={() => setPaymentType(pt)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: '8px',
                border: `2px solid ${paymentType === pt ? paymentColor(pt) : 'var(--border)'}`,
                background: paymentType === pt ? paymentColor(pt) + '18' : 'var(--bg)',
                color: paymentType === pt ? paymentColor(pt) : 'var(--muted)',
                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
              }}
            >
              {paymentLabel(pt)}
            </button>
          ))}
        </div>

        {/* Start / End Month */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div>
            <label style={lStyle}>Start Month</label>
            <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} style={iStyle} />
          </div>
          <div>
            <label style={lStyle}>End Month (optional)</label>
            <input type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)} style={iStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: '14px' }}
          >
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{
              flex: 2, padding: '10px', borderRadius: '8px', border: 'none',
              background: 'var(--primary)', color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            <Save size={15} />
            {saving ? 'Saving…' : editItem ? 'Update' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, override, month, userId, onEdit, onDelete,
}: {
  item: BudgetItem;
  override: MonthOverride | undefined;
  month: string;
  userId: string;
  onEdit: (item: BudgetItem) => void;
  onDelete: (item: BudgetItem) => void;
}) {
  const [editingAmt, setEditingAmt] = useState(false);
  const [amtInput,   setAmtInput]   = useState('');
  const [applyFuture, setApplyFuture] = useState(false);
  const [saving,     setSaving]     = useState(false);

  const effectiveAmount = override?.amount ?? item.defaultAmount;
  const isPaid          = override?.isPaid ?? false;

  const catInfo = item.categoryType === 'savings'
    ? getSavingsCategoryInfo(item.savingsCategory)
    : getExpenseCategoryInfo(item.expenseCategory);

  const handleTogglePaid = async () => {
    setSaving(true);
    try {
      const data = {
        userId, budgetItemId: item.id!, month,
        amount: effectiveAmount, isPaid: !isPaid,
        paidDate: !isPaid ? new Date().toISOString().slice(0, 10) : null,
        note: override?.note ?? null, updatedAt: serverTimestamp(),
      };
      if (override?.id) {
        await updateDoc(doc(db, 'budgetMonthOverrides', override.id), data);
      } else {
        await addDoc(collection(db, 'budgetMonthOverrides'), data);
      }
      toast.success(isPaid ? 'Marked pending' : '✅ Paid!');
    } catch (e) {
      console.error(e); toast.error('Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAmt = async () => {
    const newAmt = Number(amtInput);
    if (isNaN(newAmt) || newAmt < 0) { toast.error('Invalid amount'); return; }
    setSaving(true);
    try {
      if (applyFuture) {
        await updateDoc(doc(db, 'budgetItems', item.id!), { defaultAmount: newAmt });
        toast.success('Updated for this & future months');
      } else {
        const data = {
          userId, budgetItemId: item.id!, month, amount: newAmt,
          isPaid, paidDate: override?.paidDate ?? null,
          note: override?.note ?? null, updatedAt: serverTimestamp(),
        };
        if (override?.id) {
          await updateDoc(doc(db, 'budgetMonthOverrides', override.id), data);
        } else {
          await addDoc(collection(db, 'budgetMonthOverrides'), data);
        }
        toast.success('Updated for this month');
      }
      setEditingAmt(false);
    } catch (e) {
      console.error(e); toast.error('Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 12px', borderRadius: '10px',
      background: isPaid ? 'rgba(16,185,129,0.06)' : 'var(--bg)',
      border: `1px solid ${isPaid ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
      marginBottom: '8px',
    }}>
      {/* Paid toggle */}
      <button onClick={handleTogglePaid} disabled={saving}
        style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${isPaid ? 'var(--success)' : 'var(--border)'}`,
          background: isPaid ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {isPaid && <Check size={13} color="#fff" />}
      </button>

      {catInfo && <span style={{ fontSize: '16px', flexShrink: 0 }}>{catInfo.icon}</span>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px', fontWeight: 600,
          color: isPaid ? 'var(--muted)' : 'var(--text)',
          textDecoration: isPaid ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.name}
          {item.endMonth && (
            <span style={{ fontSize: '10px', color: 'var(--warning)', marginLeft: '6px', fontWeight: 400 }}>
              ends {item.endMonth}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: paymentColor(item.paymentType), marginTop: '1px' }}>
          {paymentLabel(item.paymentType)}
          {catInfo && <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>· {catInfo.label}</span>}
        </div>
      </div>

      {/* Inline amount editor */}
      {editingAmt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <input type="number" value={amtInput} onChange={e => setAmtInput(e.target.value)} autoFocus
            style={{ width: '90px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', fontSize: '12px', textAlign: 'right', outline: 'none' }}
          />
          <label style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
            <input type="checkbox" checked={applyFuture} onChange={e => setApplyFuture(e.target.checked)} />
            Future too
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleSaveAmt}
              style={{ padding: '3px 10px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '11px' }}
            >OK</button>
            <button onClick={() => setEditingAmt(false)}
              style={{ padding: '3px 7px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px' }}
            >✕</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => { setAmtInput(String(effectiveAmount)); setEditingAmt(true); }}
          style={{ fontWeight: 700, fontSize: '14px', color: isPaid ? 'var(--muted)' : 'var(--text)', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px' }}
        >
          {formatAmt(effectiveAmount, item.currency)}
        </div>
      )}

      <button onClick={() => onEdit(item)}
        style={{ padding: '5px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer' }}
      >
        <Edit2 size={12} />
      </button>
      <button onClick={() => onDelete(item)}
        style={{ padding: '5px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer' }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Country Panel ────────────────────────────────────────────────────────────

function CountryPanel({
  country, month, userId, items, overrides, income, onSaveIncome,
  autoDebtItems,
}: {
  country: Country;
  month: string;
  userId: string;
  items: BudgetItem[];
  overrides: MonthOverride[];
  income: BudgetIncome;
  onSaveIncome: (country: Country, salary: number, other: number) => void;
  autoDebtItems: CashFlowItem[];   // ← NEW
}) {
  const [showModal,     setShowModal]     = useState(false);
  const [editItem,      setEditItem]      = useState<BudgetItem | null>(null);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput,   setSalaryInput]   = useState(String(income.salary));
  const [otherInput,    setOtherInput]    = useState(String(income.other));

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';
  const flag = country === 'UAE' ? '🇦🇪' : '🇮🇳';

  const activeItems   = items.filter(i => i.country === country && isItemActiveInMonth(i, month));
  const savingsItems  = activeItems.filter(i => i.categoryType === 'savings');
  const expenseItems  = activeItems.filter(i => !i.categoryType || i.categoryType === 'expense');

  const getAmt = (item: BudgetItem) => {
    const ov = overrides.find(o => o.budgetItemId === item.id);
    return ov?.amount ?? item.defaultAmount;
  };

  const totalIncome       = income.salary + income.other;
  const totalSavings      = savingsItems.reduce((s, i) => s + getAmt(i), 0);
  const totalExpenses     = expenseItems.reduce((s, i) => s + getAmt(i), 0);
  const totalDebtPayments = autoDebtItems.reduce((s, i) => s + i.amount, 0);
  const liquidCash        = totalIncome - totalExpenses;

  const paidCount = activeItems.filter(i =>
    overrides.find(o => o.budgetItemId === i.id)?.isPaid
  ).length;

  const handleDelete = async (item: BudgetItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await updateDoc(doc(db, 'budgetItems', item.id!), { isActive: false });
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  };

  const renderGroup = (
    groupItems: BudgetItem[], label: string, color: string,
    icon: React.ReactNode, total: number,
  ) => {
    if (groupItems.length === 0) return null;
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '8px', padding: '6px 10px', borderRadius: '8px',
          background: color + '12',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, color,
            textTransform: 'uppercase', letterSpacing: '0.5px',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            {icon} {label}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color }}>
            {formatAmt(total, currency)}
          </div>
        </div>
        {groupItems.map(item => (
          <ItemRow
            key={item.id} item={item}
            override={overrides.find(o => o.budgetItemId === item.id)}
            month={month} userId={userId}
            onEdit={i => { setEditItem(i); setShowModal(true); }}
            onDelete={handleDelete}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="card" style={{ padding: '20px', flex: 1, minWidth: '300px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800 }}>
              {flag} {country}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              {paidCount}/{activeItems.length} paid · {currency}
            </div>
          </div>
          <button
            onClick={() => { setEditItem(null); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 12px', borderRadius: '8px',
              background: 'var(--primary)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {/* Income */}
        <div style={{
          padding: '12px', background: 'var(--bg)',
          borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: 'var(--success)',
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <TrendingUp size={12} /> Income
          </div>
          {editingSalary ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="number" value={salaryInput}
                onChange={e => setSalaryInput(e.target.value)}
                placeholder="Salary" autoFocus
                style={{ width: '110px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>+</span>
              <input type="number" value={otherInput}
                onChange={e => setOtherInput(e.target.value)}
                placeholder="Other"
                style={{ width: '80px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
              />
              <button
                onClick={() => {
                  onSaveIncome(country, Number(salaryInput) || 0, Number(otherInput) || 0);
                  setEditingSalary(false);
                }}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                ✓
              </button>
              <button
                onClick={() => setEditingSalary(false)}
                style={{ padding: '6px 8px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                <span style={{ fontWeight: 700 }}>{formatAmt(income.salary, currency)}</span>
                {income.other > 0 && (
                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    {' '}+ {formatAmt(income.other, currency)}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSalaryInput(String(income.salary));
                  setOtherInput(String(income.other));
                  setEditingSalary(true);
                }}
                style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Edit2 size={11} /> Edit
              </button>
            </div>
          )}
        </div>

        {/* Items */}
        {activeItems.length === 0 && autoDebtItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>
            No commitments yet.{' '}
            <button
              onClick={() => { setEditItem(null); setShowModal(true); }}
              style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              + Add first item
            </button>
          </div>
        ) : (
          <>
            {renderGroup(savingsItems, 'Savings & Investments', 'var(--success)', <PiggyBank size={11} />, totalSavings)}
            {renderGroup(expenseItems, 'Expenses', 'var(--danger)', <ShoppingBag size={11} />, totalExpenses)}

            {/* ── Auto Debt Payments Section ── */}
            <DebtPaymentSection items={autoDebtItems} currency={currency} />
          </>
        )}

        {/* Cash Flow Summary (replaces old summary) */}
        {(activeItems.length > 0 || autoDebtItems.length > 0) && (
          <CashFlowSummary
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            totalSavings={totalSavings}
            totalDebtPayments={totalDebtPayments}
            currency={currency}
          />
        )}
      </div>

      {showModal && (
        <ItemModal
          userId={userId} country={country} currentMonth={month}
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
        />
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Budget({ user }: { user: User }) {
  const [currentMonth,  setCurrentMonth]  = useState(getCurrentMonth());
  const [budgetItems,   setBudgetItems]   = useState<BudgetItem[]>([]);
  const [overrides,     setOverrides]     = useState<MonthOverride[]>([]);
  const [incomes,       setIncomes]       = useState<BudgetIncome[]>([]);
  const [methods,       setMethods]       = useState<PaymentMethod[]>([]);
  const [debts,         setDebts]         = useState<Debt[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadedCount,   setLoadedCount]   = useState(0);

  // ── Listeners ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const bump = () => setLoadedCount(c => c + 1);

    const unsubs = [
      onSnapshot(
        query(collection(db, 'budgetItems'), where('userId', '==', user.uid)),
        snap => { setBudgetItems(snap.docs.map(d => ({ id: d.id, ...d.data() })) as BudgetItem[]); bump(); },
        () => bump()
      ),
      onSnapshot(
        query(collection(db, 'budgetMonthOverrides'), where('userId', '==', user.uid)),
        snap => { setOverrides(snap.docs.map(d => ({ id: d.id, ...d.data() })) as MonthOverride[]); bump(); },
        () => bump()
      ),
      onSnapshot(
        query(collection(db, 'budgetIncome'), where('userId', '==', user.uid)),
        snap => { setIncomes(snap.docs.map(d => ({ id: d.id, ...d.data() })) as BudgetIncome[]); bump(); },
        () => bump()
      ),
      // ── NEW: payment methods (for Tabby EMIs + CC EMIs) ──
      onSnapshot(
        query(collection(db, 'paymentMethods'), where('userId', '==', user.uid)),
        snap => {
          setMethods(
            snap.docs
              .map(d => ({ id: d.id, ...d.data() } as PaymentMethod))
              .filter(m => !m.isDeleted)
          );
          bump();
        },
        () => bump()
      ),
      // ── NEW: debts (for loan monthly payments) ──
      onSnapshot(
        query(collection(db, 'debts'), where('userId', '==', user.uid)),
        snap => { setDebts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Debt[]); bump(); },
        () => bump()
      ),
    ];

    return () => unsubs.forEach(u => u());
  }, [user.uid]);

  useEffect(() => {
    if (loadedCount >= 5) setLoading(false);   // 5 collections now
  }, [loadedCount]);

  // ── Auto debt items (computed) ─────────────────────────────────────────────

  const allTabbyEmis: TabbyPurchaseEMI[] = methods
    .filter(m => m.type === 'tabby')
    .flatMap(m => (m.tabbyEmis || []) as TabbyPurchaseEMI[]);

  const allCcEmis = methods
    .filter(m => m.type === 'credit')
    .flatMap(m => (m.emis || []).map((e: any) => ({
      ...e,
      id: e.id || e.description,
    })));

  const allAutoDebtItems = getAllDebtPaymentsDueForMonth(
    allTabbyEmis, allCcEmis, debts, currentMonth
  );

  // Split by currency for UAE vs India panels
  const uaeAutoDebt   = allAutoDebtItems.filter(i => i.currency === 'AED');
  const indiaAutoDebt = allAutoDebtItems.filter(i => i.currency === 'INR');

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getIncome = (country: Country): BudgetIncome => {
    const found = incomes.find(i => i.country === country && i.month === currentMonth);
    return found ?? {
      userId: user.uid, country, month: currentMonth,
      salary: 0, other: 0,
      currency: country === 'UAE' ? 'AED' : 'INR',
    };
  };

  const handleSaveIncome = async (country: Country, salary: number, other: number) => {
    const existing = incomes.find(i => i.country === country && i.month === currentMonth);
    const data = {
      userId: user.uid, country, month: currentMonth, salary, other,
      currency: (country === 'UAE' ? 'AED' : 'INR') as Currency,
      updatedAt: serverTimestamp(),
    };
    try {
      if (existing?.id) {
        await updateDoc(doc(db, 'budgetIncome', existing.id), data);
      } else {
        await addDoc(collection(db, 'budgetIncome'), data);
      }
      toast.success('Income saved!');
    } catch (e) { console.error(e); toast.error('Failed'); }
  };

  const monthOverrides = overrides.filter(o => o.month === currentMonth);

  const handleCopyLastMonth = async () => {
    const lastMonth     = addMonths(currentMonth, -1);
    const lastOverrides = overrides.filter(o => o.month === lastMonth);
    if (lastOverrides.length === 0) { toast.error('No previous month data to copy'); return; }
    try {
      let copied = 0;
      for (const ov of lastOverrides) {
        const exists = monthOverrides.find(o => o.budgetItemId === ov.budgetItemId);
        if (!exists) {
          await addDoc(collection(db, 'budgetMonthOverrides'), {
            userId: user.uid, budgetItemId: ov.budgetItemId,
            month: currentMonth, amount: ov.amount,
            isPaid: false, paidDate: null, note: null,
            updatedAt: serverTimestamp(),
          });
          copied++;
        }
      }
      toast.success(`${copied} amounts copied from last month!`);
    } catch { toast.error('Copy failed'); }
  };

  // ── Summary calculations ───────────────────────────────────────────────────

  const uaeIncome   = getIncome('UAE');
  const indiaIncome = getIncome('India');

  const uaeItems   = budgetItems.filter(i => i.country === 'UAE'   && isItemActiveInMonth(i, currentMonth));
  const indiaItems = budgetItems.filter(i => i.country === 'India' && isItemActiveInMonth(i, currentMonth));

  const getAmt = (item: BudgetItem) => {
    const ov = monthOverrides.find(o => o.budgetItemId === item.id);
    return ov?.amount ?? item.defaultAmount;
  };

  const uaeSavings   = uaeItems.filter(i => i.categoryType === 'savings').reduce((s, i) => s + getAmt(i), 0);
  const uaeExpenses  = uaeItems.filter(i => !i.categoryType || i.categoryType === 'expense').reduce((s, i) => s + getAmt(i), 0);
  const indiaSavings = indiaItems.filter(i => i.categoryType === 'savings').reduce((s, i) => s + getAmt(i), 0);
  const indiaExpenses = indiaItems.filter(i => !i.categoryType || i.categoryType === 'expense').reduce((s, i) => s + getAmt(i), 0);

  const uaeDebtTotal   = uaeAutoDebt.reduce((s, i) => s + i.amount, 0);
  const indiaDebtTotal = indiaAutoDebt.reduce((s, i) => s + i.amount, 0);

  const uaeNet   = (uaeIncome.salary + uaeIncome.other)   - uaeSavings   - uaeExpenses   - uaeDebtTotal;
  const indiaNet = (indiaIncome.salary + indiaIncome.other) - indiaSavings - indiaExpenses - indiaDebtTotal;

  const totalPaid  = [...uaeItems, ...indiaItems].filter(i =>
    monthOverrides.find(o => o.budgetItemId === i.id)?.isPaid
  ).length;
  const totalItems = uaeItems.length + indiaItems.length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading budget planner…</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={26} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
              Budget & Cash Flow
            </h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '4px' }}>
            Plan monthly commitments — UAE 🇦🇪 & India 🇮🇳
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleCopyLastMonth}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
          >
            <Copy size={13} /> Copy Last Month
          </button>

          {/* Month Nav */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
              style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={18} />
            </button>
            <div style={{ padding: '8px 16px', fontSize: '14px', fontWeight: 700, color: 'var(--text)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', minWidth: '150px', textAlign: 'center' }}>
              {getMonthLabel(currentMonth)}
            </div>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              style={{ padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {currentMonth !== getCurrentMonth() && (
            <button onClick={() => setCurrentMonth(getCurrentMonth())}
              style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'rgba(99,102,241,0.08)', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          {
            label: '💰 Total Savings',
            value: `AED ${uaeSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}` +
              (indiaSavings > 0 ? ` + ₹${indiaSavings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''),
            color: 'var(--success)',
          },
          {
            label: '🔴 Total Expenses',
            value: `AED ${uaeExpenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}` +
              (indiaExpenses > 0 ? ` + ₹${indiaExpenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''),
            color: 'var(--danger)',
          },
          {
            label: '💳 Debt Payments',
            value: allAutoDebtItems.length > 0
              ? `AED ${uaeDebtTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` +
                (indiaDebtTotal > 0 ? ` + ₹${indiaDebtTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '')
              : 'None this month',
            color: allAutoDebtItems.length > 0 ? '#8b5cf6' : 'var(--muted)',
          },
          {
            label: '✅ Items Paid',
            value: `${totalPaid} / ${totalItems}`,
            color: totalPaid === totalItems && totalItems > 0 ? 'var(--success)' : 'var(--warning)',
          },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{stat.label}</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabby Due This Month — highlight if any */}
      {allTabbyEmis.length > 0 && (() => {
        const { totalDue } = getTabbyDueForMonth(allTabbyEmis, currentMonth);
        if (totalDue <= 0) return null;
        return (
          <div style={{
            padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '24px' }}>💳</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#8b5cf6', fontSize: '14px' }}>
                Tabby Due This Month
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Included in UAE Debt Payments below
              </div>
            </div>
            <div style={{ fontWeight: 800, color: '#8b5cf6', fontSize: '20px' }}>
              {totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED
            </div>
          </div>
        );
      })()}

      {/* UAE + India Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start', marginBottom: '20px' }}>
        <CountryPanel
          country="UAE" month={currentMonth} userId={user.uid}
          items={budgetItems} overrides={monthOverrides}
          income={getIncome('UAE')} onSaveIncome={handleSaveIncome}
          autoDebtItems={uaeAutoDebt}
        />
        <CountryPanel
          country="India" month={currentMonth} userId={user.uid}
          items={budgetItems} overrides={monthOverrides}
          income={getIncome('India')} onSaveIncome={handleSaveIncome}
          autoDebtItems={indiaAutoDebt}
        />
      </div>

      {/* Combined Overview */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flag size={14} style={{ color: 'var(--primary)' }} />
          Combined Overview — {getMonthLabel(currentMonth)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          {[
            {
              label: '🇦🇪 UAE Cash Flow',
              value: `AED ${Math.abs(uaeNet).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
              sub: uaeNet >= 0 ? 'Surplus' : 'Deficit',
              color: uaeNet >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: '🇮🇳 India Cash Flow',
              value: `₹${Math.abs(indiaNet).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
              sub: indiaNet >= 0 ? 'Surplus' : 'Deficit',
              color: indiaNet >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: '💰 Committed Savings',
              value: `AED ${uaeSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}` +
                (indiaSavings > 0 ? ` + ₹${indiaSavings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''),
              sub: 'This month',
              color: 'var(--success)',
            },
            {
              label: '💳 Debt Due',
              value: allAutoDebtItems.length > 0
                ? `AED ${uaeDebtTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}` +
                  (indiaDebtTotal > 0 ? ` + ₹${indiaDebtTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '')
                : 'None',
              sub: 'Tabby + CC + Loans',
              color: '#8b5cf6',
            },
            {
              label: '✅ Payment Progress',
              value: `${totalPaid} / ${totalItems}`,
              sub: totalPaid === totalItems && totalItems > 0 ? '🎉 All done!' : 'In progress',
              color: totalPaid === totalItems && totalItems > 0 ? 'var(--success)' : 'var(--warning)',
            },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{stat.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: stat.color, marginTop: '2px', opacity: 0.8 }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}