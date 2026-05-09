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
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type Country = 'UAE' | 'India';
type Currency = 'AED' | 'INR';
type PaymentType = 'cash' | 'credit' | 'tabby';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + n, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (month: string) => {
  const [y, m] = month.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const formatAmt = (amount: number, currency: Currency) =>
  currency === 'AED'
    ? `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const paymentColor = (type: PaymentType) => {
  if (type === 'cash') return 'var(--success)';
  if (type === 'credit') return 'var(--danger)';
  return '#8b5cf6';
};

const paymentLabel = (type: PaymentType) => {
  if (type === 'cash') return '💵 Cash';
  if (type === 'credit') return '💳 Credit';
  return '🟣 Tabby';
};

const isItemActiveInMonth = (item: BudgetItem, month: string): boolean => {
  if (!item.isActive) return false;
  if (item.startMonth > month) return false;
  if (item.endMonth && item.endMonth < month) return false;
  return true;
};

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

function ItemModal({
  userId, country, currentMonth, editItem, onClose,
}: {
  userId: string;
  country: Country;
  currentMonth: string;
  editItem?: BudgetItem | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(editItem?.name || '');
  const [amount, setAmount] = useState(String(editItem?.defaultAmount || ''));
  const [paymentType, setPaymentType] = useState<PaymentType>(editItem?.paymentType || 'cash');
  const [startMonth, setStartMonth] = useState(editItem?.startMonth || currentMonth);
  const [endMonth, setEndMonth] = useState(editItem?.endMonth || '');
  const [saving, setSaving] = useState(false);
  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!amount || isNaN(Number(amount))) { toast.error('Valid amount required'); return; }
    setSaving(true);
    try {
      const data = {
        userId, country, name: name.trim(), paymentType,
        defaultAmount: Number(amount), currency,
        startMonth, endMonth: endMonth || null, isActive: true,
      };
      if (editItem?.id) {
        await updateDoc(doc(db, 'budgetItems', editItem.id), data);
        toast.success('Updated!');
      } else {
        await addDoc(collection(db, 'budgetItems'), { ...data, createdAt: serverTimestamp() });
        toast.success('Added!');
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
            {editItem ? 'Edit' : `Add ${country} Item`}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Name */}
        <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
          Description *
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. India Remittance, Rent, BOTIM"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: '14px', outline: 'none',
            boxSizing: 'border-box', marginBottom: '14px',
          }}
        />

        {/* Amount */}
        <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
          Default Amount ({currency}) *
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: '14px', outline: 'none',
            boxSizing: 'border-box', marginBottom: '14px',
          }}
        />

        {/* Payment Type */}
        <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
          Payment Method
        </label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {(['cash', 'credit', 'tabby'] as PaymentType[]).map((pt) => (
            <button
              key={pt}
              onClick={() => setPaymentType(pt)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: '8px',
                border: `2px solid ${paymentType === pt ? paymentColor(pt) : 'var(--border)'}`,
                background: paymentType === pt ? paymentColor(pt) + '18' : 'var(--bg)',
                color: paymentType === pt ? paymentColor(pt) : 'var(--muted)',
                cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              }}
            >
              {paymentLabel(pt)}
            </button>
          ))}
        </div>

        {/* Start / End Month */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Start Month
            </label>
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              style={{
                width: '100%', padding: '8px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              End Month (optional)
            </label>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              style={{
                width: '100%', padding: '8px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', cursor: 'pointer', fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '10px', borderRadius: '8px',
              border: 'none', background: 'var(--primary)', color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              opacity: saving ? 0.7 : 1,
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
  const [amtInput, setAmtInput] = useState('');
  const [applyFuture, setApplyFuture] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveAmount = override?.amount ?? item.defaultAmount;
  const isPaid = override?.isPaid ?? false;

  const handleTogglePaid = async () => {
    setSaving(true);
    try {
      const data = {
        userId, budgetItemId: item.id!, month,
        amount: effectiveAmount,
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
      console.error(e);
      toast.error('Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 12px', borderRadius: '10px',
      background: isPaid ? '#f0fdf4' : 'var(--bg)',
      border: `1px solid ${isPaid ? '#bbf7d0' : 'var(--border)'}`,
      marginBottom: '8px',
    }}>
      {/* Paid toggle */}
      <button
        onClick={handleTogglePaid}
        disabled={saving}
        style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${isPaid ? 'var(--success)' : 'var(--border)'}`,
          background: isPaid ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {isPaid && <Check size={13} color="#fff" />}
      </button>

      {/* Info */}
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
        </div>
      </div>

      {/* Amount */}
      {editingAmt ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <input
            type="number"
            value={amtInput}
            onChange={(e) => setAmtInput(e.target.value)}
            autoFocus
            style={{
              width: '90px', padding: '4px 8px', borderRadius: '6px',
              border: '1px solid var(--primary)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: '12px', textAlign: 'right', outline: 'none',
            }}
          />
          <label style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
            <input type="checkbox" checked={applyFuture} onChange={(e) => setApplyFuture(e.target.checked)} />
            Future months too
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handleSaveAmt}
              style={{
                padding: '3px 10px', borderRadius: '6px', border: 'none',
                background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '11px',
              }}
            >
              OK
            </button>
            <button
              onClick={() => setEditingAmt(false)}
              style={{
                padding: '3px 7px', borderRadius: '6px',
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--muted)', cursor: 'pointer', fontSize: '11px',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => { setAmtInput(String(effectiveAmount)); setEditingAmt(true); }}
          title="Click to edit"
          style={{
            fontWeight: 700, fontSize: '14px',
            color: isPaid ? 'var(--muted)' : 'var(--text)',
            cursor: 'pointer', padding: '2px 6px', borderRadius: '6px',
            border: '1px dashed transparent',
          }}
        >
          {formatAmt(effectiveAmount, item.currency)}
        </div>
      )}

      {/* Edit / Delete */}
      <button
        onClick={() => onEdit(item)}
        style={{
          padding: '5px', borderRadius: '6px', border: '1px solid var(--border)',
          background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer',
        }}
      >
        <Edit2 size={12} />
      </button>
      <button
        onClick={() => onDelete(item)}
        style={{
          padding: '5px', borderRadius: '6px', border: '1px solid var(--border)',
          background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer',
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Country Panel ────────────────────────────────────────────────────────────

function CountryPanel({
  country, month, userId, items, overrides, income, onSaveIncome,
}: {
  country: Country;
  month: string;
  userId: string;
  items: BudgetItem[];
  overrides: MonthOverride[];
  income: BudgetIncome;
  onSaveIncome: (country: Country, salary: number, other: number) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<BudgetItem | null>(null);
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState(String(income.salary));
  const [otherInput, setOtherInput] = useState(String(income.other));

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';
  const flag = country === 'UAE' ? '🇦🇪' : '🇮🇳';

  const activeItems = items.filter(
    (i) => i.country === country && isItemActiveInMonth(i, month)
  );

  const getAmt = (item: BudgetItem) => {
    const ov = overrides.find((o) => o.budgetItemId === item.id);
    return ov?.amount ?? item.defaultAmount;
  };

  const cashItems = activeItems.filter((i) => i.paymentType === 'cash');
  const creditItems = activeItems.filter((i) => i.paymentType === 'credit');
  const tabbyItems = activeItems.filter((i) => i.paymentType === 'tabby');

  const totalIncome = income.salary + income.other;
  const totalCash = cashItems.reduce((s, i) => s + getAmt(i), 0);
  const totalCredit = creditItems.reduce((s, i) => s + getAmt(i), 0);
  const totalTabby = tabbyItems.reduce((s, i) => s + getAmt(i), 0);
  const totalAll = totalCash + totalCredit + totalTabby;
  const liquidCash = totalIncome - totalCash;
  const netBalance = totalIncome - totalAll;

  const paidCount = activeItems.filter((i) =>
    overrides.find((o) => o.budgetItemId === i.id)?.isPaid
  ).length;

  const handleDelete = async (item: BudgetItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await updateDoc(doc(db, 'budgetItems', item.id!), { isActive: false });
      toast.success('Removed');
    } catch {
      toast.error('Failed');
    }
  };

  const renderGroup = (groupItems: BudgetItem[], label: string, color: string) => {
    if (groupItems.length === 0) return null;
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, color,
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
        }}>
          {label}
        </div>
        {groupItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            override={overrides.find((o) => o.budgetItemId === item.id)}
            month={month}
            userId={userId}
            onEdit={(i) => { setEditItem(i); setShowModal(true); }}
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
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
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
              <input
                type="number"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                placeholder="Salary"
                autoFocus
                style={{
                  width: '110px', padding: '6px 10px', borderRadius: '8px',
                  border: '1px solid var(--primary)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: '13px', outline: 'none',
                }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>+</span>
              <input
                type="number"
                value={otherInput}
                onChange={(e) => setOtherInput(e.target.value)}
                placeholder="Other"
                style={{
                  width: '80px', padding: '6px 10px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: '13px', outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  onSaveIncome(country, Number(salaryInput) || 0, Number(otherInput) || 0);
                  setEditingSalary(false);
                }}
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: 'none',
                  background: 'var(--primary)', color: '#fff',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                }}
              >
                ✓
              </button>
              <button
                onClick={() => setEditingSalary(false)}
                style={{
                  padding: '6px 8px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px',
                }}
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
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <Edit2 size={11} /> Edit
              </button>
            </div>
          )}
        </div>

        {/* Items */}
        {activeItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>
            No commitments yet.{' '}
            <button
              onClick={() => { setEditItem(null); setShowModal(true); }}
              style={{
                color: 'var(--primary)', background: 'none',
                border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
              }}
            >
              + Add first item
            </button>
          </div>
        ) : (
          <>
            {renderGroup(cashItems, '💵 Cash Payments', 'var(--success)')}
            {renderGroup(creditItems, '💳 Credit Card', 'var(--danger)')}
            {renderGroup(tabbyItems, '🟣 Tabby', '#8b5cf6')}
          </>
        )}

        {/* Summary */}
        {activeItems.length > 0 && (
          <div style={{
            marginTop: '8px', padding: '14px', background: 'var(--bg)',
            borderRadius: '12px', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
              📊 Summary
            </div>

            {[
              { label: 'Total Income', value: totalIncome, color: 'var(--success)', sign: '+' },
              { label: `Cash (${cashItems.length} items)`, value: totalCash, color: 'var(--text)', sign: '−' },
              ...(totalCredit > 0 ? [{ label: 'Credit Card', value: totalCredit, color: 'var(--danger)', sign: '−' }] : []),
              ...(totalTabby > 0 ? [{ label: 'Tabby', value: totalTabby, color: '#8b5cf6', sign: '−' }] : []),
            ].map((row) => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '12px', marginBottom: '6px',
              }}>
                <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                <span style={{ fontWeight: 600, color: row.color }}>
                  {row.sign} {formatAmt(row.value, currency)}
                </span>
              </div>
            ))}

            <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />

            {/* Liquid Cash */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Banknote size={12} /> Liquid Cash
              </span>
              <span style={{ fontWeight: 700, color: liquidCash >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatAmt(liquidCash, currency)}
              </span>
            </div>

            {/* Net */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 12px', borderRadius: '8px',
              background: netBalance >= 0 ? '#f0fdf4' : '#fef2f2',
            }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                Net Balance
              </span>
              <span style={{ fontWeight: 800, fontSize: '15px', color: netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatAmt(Math.abs(netBalance), currency)}
                {netBalance < 0 && ' ⚠️'}
              </span>
            </div>

            {netBalance < 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                marginTop: '8px', padding: '8px', borderRadius: '8px',
                background: '#fef2f2', fontSize: '11px', color: 'var(--danger)',
              }}>
                <AlertTriangle size={12} />
                Over budget by {formatAmt(Math.abs(netBalance), currency)}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <ItemModal
          userId={userId}
          country={country}
          currentMonth={month}
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
        />
      )}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Budget({ user }: { user: User }) {
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth());
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [overrides, setOverrides] = useState<MonthOverride[]>([]);
  const [incomes, setIncomes] = useState<BudgetIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubItems = onSnapshot(
      query(collection(db, 'budgetItems'), where('userId', '==', user.uid)),
      (snap) => {
        setBudgetItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BudgetItem[]);
        setLoadedCount((c) => c + 1);
      },
      (err) => { console.error('budgetItems error:', err); setLoadedCount((c) => c + 1); }
    );

    const unsubOverrides = onSnapshot(
      query(collection(db, 'budgetMonthOverrides'), where('userId', '==', user.uid)),
      (snap) => {
        setOverrides(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MonthOverride[]);
        setLoadedCount((c) => c + 1);
      },
      (err) => { console.error('overrides error:', err); setLoadedCount((c) => c + 1); }
    );

    const unsubIncome = onSnapshot(
      query(collection(db, 'budgetIncome'), where('userId', '==', user.uid)),
      (snap) => {
        setIncomes(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BudgetIncome[]);
        setLoadedCount((c) => c + 1);
      },
      (err) => { console.error('income error:', err); setLoadedCount((c) => c + 1); }
    );

    return () => { unsubItems(); unsubOverrides(); unsubIncome(); };
  }, [user.uid]);

  // Loading complete when all 3 listeners fired
  useEffect(() => {
    if (loadedCount >= 3) setLoading(false);
  }, [loadedCount]);

  const getIncome = (country: Country): BudgetIncome => {
    const found = incomes.find((i) => i.country === country && i.month === currentMonth);
    return found ?? {
      userId: user.uid, country, month: currentMonth,
      salary: 0, other: 0,
      currency: country === 'UAE' ? 'AED' : 'INR',
    };
  };

  const handleSaveIncome = async (country: Country, salary: number, other: number) => {
    const existing = incomes.find((i) => i.country === country && i.month === currentMonth);
    const data = {
      userId: user.uid, country, month: currentMonth,
      salary, other,
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
    } catch (e) {
      console.error(e);
      toast.error('Failed');
    }
  };

  const monthOverrides = overrides.filter((o) => o.month === currentMonth);

  const handleCopyLastMonth = async () => {
    const lastMonth = addMonths(currentMonth, -1);
    const lastOverrides = overrides.filter((o) => o.month === lastMonth);
    if (lastOverrides.length === 0) {
      toast.error('No previous month data to copy');
      return;
    }
    try {
      let copied = 0;
      for (const ov of lastOverrides) {
        const exists = monthOverrides.find((o) => o.budgetItemId === ov.budgetItemId);
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
    } catch {
      toast.error('Copy failed');
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: '16px',
      }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: '14px' }}>
          Loading budget planner…
        </span>
      </div>
    );
  }

  // Summary stats
  const uaeIncome = getIncome('UAE');
  const indiaIncome = getIncome('India');
  const uaeItems = budgetItems.filter((i) => i.country === 'UAE' && isItemActiveInMonth(i, currentMonth));
  const indiaItems = budgetItems.filter((i) => i.country === 'India' && isItemActiveInMonth(i, currentMonth));
  const getAmt = (item: BudgetItem) => {
    const ov = monthOverrides.find((o) => o.budgetItemId === item.id);
    return ov?.amount ?? item.defaultAmount;
  };
  const uaeNet = (uaeIncome.salary + uaeIncome.other) - uaeItems.reduce((s, i) => s + getAmt(i), 0);
  const indiaNet = (indiaIncome.salary + indiaIncome.other) - indiaItems.reduce((s, i) => s + getAmt(i), 0);
  const totalPaid = [...uaeItems, ...indiaItems].filter((i) =>
    monthOverrides.find((o) => o.budgetItemId === i.id)?.isPaid
  ).length;
  const totalItems = uaeItems.length + indiaItems.length;

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Wallet size={26} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Budget & Forecast
            </h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '4px' }}>
            Plan your monthly commitments — UAE 🇦🇪 & India 🇮🇳
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleCopyLastMonth}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '12px',
            }}
          >
            <Copy size={13} /> Copy Last Month
          </button>

          {/* Month Nav */}
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
              borderRight: '1px solid var(--border)', minWidth: '150px', textAlign: 'center',
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
                border: '1px solid var(--primary)', background: 'var(--primary)15',
                color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* UAE + India Panels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px', alignItems: 'start', marginBottom: '20px',
      }}>
        <CountryPanel
          country="UAE" month={currentMonth} userId={user.uid}
          items={budgetItems} overrides={monthOverrides}
          income={getIncome('UAE')} onSaveIncome={handleSaveIncome}
        />
        <CountryPanel
          country="India" month={currentMonth} userId={user.uid}
          items={budgetItems} overrides={monthOverrides}
          income={getIncome('India')} onSaveIncome={handleSaveIncome}
        />
      </div>

      {/* Combined Summary */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{
          fontSize: '13px', fontWeight: 700, color: 'var(--text)',
          marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Flag size={14} style={{ color: 'var(--primary)' }} />
          Combined Overview — {getMonthLabel(currentMonth)}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}>
          {[
            {
              label: '🇦🇪 UAE Net',
              value: formatAmt(Math.abs(uaeNet), 'AED'),
              sub: uaeNet >= 0 ? 'Surplus' : 'Deficit',
              color: uaeNet >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: '🇮🇳 India Net',
              value: formatAmt(Math.abs(indiaNet), 'INR'),
              sub: indiaNet >= 0 ? 'Surplus' : 'Deficit',
              color: indiaNet >= 0 ? 'var(--success)' : 'var(--danger)',
            },
            {
              label: '✅ Items Paid',
              value: `${totalPaid} / ${totalItems}`,
              sub: totalPaid === totalItems && totalItems > 0 ? 'All done!' : 'In progress',
              color: totalPaid === totalItems && totalItems > 0 ? 'var(--success)' : 'var(--warning)',
            },
            {
              label: '📅 Current Month',
              value: getMonthLabel(currentMonth),
              sub: currentMonth === getCurrentMonth() ? 'This month' : 'Viewing past/future',
              color: 'var(--primary)',
            },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '14px', borderRadius: '10px',
              background: 'var(--bg)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>{stat.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: stat.color, marginTop: '2px', opacity: 0.8 }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}