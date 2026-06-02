// src/pages/Expenses.tsx
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, RefreshCw, ReceiptText, Info } from 'lucide-react';
import {
  buildTabbyProSchedule,
  canTabbyPurchase,
  isTabbyProEnabled,
  formatCurrency,
} from '../firestoreHelpers';
import type { TabbyPurchaseEMI } from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'AED' | 'INR';
  category: string;
  subCategory?: string | null;
  date: string;
  paymentMethodId?: string;
  paymentMethod?: string;
  paymentMethodName?: string;
  paymentMethodType?: string;
  note: string | null;
  country: 'UAE' | 'India';
  userId: string;
  debitAccountId?: string;
  creditAccountId?: string;
  isReversed?: boolean;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  color?: string;
  creditLimit?: number;
  tabbyProEnabled?: boolean;
  tabbyEmis?: TabbyPurchaseEMI[];
  statementDate?: number;
  dueDate?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  'Rent', 'Food', 'Transport', 'Shopping', 'Medical',
  'Education', 'Entertainment', 'Utilities', 'Bank Fees', 'Other',
];

const cardTypeIcon: Record<string, string> = {
  credit: '💳',
  debit:  '🏦',
  tabby:  '🛒',
  cash:   '💵',
  upi:    '📱',
  custom: '➕',
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0'); }

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getExpenseGLAccount(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('rent') || c.includes('accommodation')) return '5010';
  if (c.includes('food') || c.includes('dining'))         return '5020';
  if (c.includes('transport') || c.includes('fuel'))      return '5030';
  if (c.includes('fee') || c.includes('bank') || c.includes('charge')) return '5040';
  if (c.includes('forex') || c.includes('exchange'))      return '5050';
  if (c.includes('medical') || c.includes('health'))      return '5060';
  if (c.includes('education') || c.includes('school'))    return '5070';
  if (c.includes('entertainment'))                        return '5080';
  return '5090';
}

function fmtAED(n: number) {
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Tabby Preview Banner ─────────────────────────────────────────────────────

interface TabbyPreviewBannerProps {
  amount: number;
  date: string;
  category: string;
  method: PaymentMethod;
}

function TabbyPreviewBanner({ amount, date, category, method }: TabbyPreviewBannerProps) {
  if (!isTabbyProEnabled(method) || amount <= 0 || !date) return null;

  const check = canTabbyPurchase(method, amount);
  const stmtDay = method.statementDate || 23;
  const dueDay  = method.dueDate || 3;

  // Build preview schedule
  const preview = buildTabbyProSchedule(
    amount, date, category || 'Purchase',
    'preview', stmtDay, dueDay
  );

  if (!check.allowed) {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 12, marginTop: 4,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
      }}>
        <div style={{ fontWeight: 700, color: '#ef4444', fontSize: 14, marginBottom: 4 }}>
          ⚠️ Tabby Limit Exceeded
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Available: <strong>{fmtAED(check.available)}</strong>
          {' '}&bull;{' '}
          Trying: <strong>{fmtAED(amount)}</strong>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '14px', borderRadius: 14, marginTop: 4,
      background: 'rgba(139,92,246,0.08)',
      border: '1px dashed rgba(139,92,246,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>💳</span>
        <div>
          <div style={{ fontWeight: 700, color: '#8b5cf6', fontSize: 14 }}>
            Tabby Pro — Auto Split into 4 Installments
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Zero interest &bull; Zero fees
          </div>
        </div>
      </div>

      {/* 4 installment boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {preview.installments.map((inst, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '10px 6px',
            background: 'var(--card)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              {inst.dueDate.substring(5)}
            </div>
            <div style={{ fontWeight: 800, color: '#8b5cf6', fontSize: 15 }}>
              {fmtAED(inst.amount)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              #{inst.installmentNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Footer info */}
      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <span>
          📊 Full expense posted today &bull; Payments spread over 4 months
        </span>
        <span style={{ color: '#8b5cf6', fontWeight: 600 }}>
          Avail after: {fmtAED(check.available - amount)}
        </span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Expenses({ user }: { user: User }) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [transactions,    setTransactions]    = useState<Transaction[]>([]);
  const [paymentMethods,  setPaymentMethods]  = useState<PaymentMethod[]>([]);
  const [filterCountry,   setFilterCountry]   = useState<'ALL' | 'UAE' | 'India'>('ALL');
  const [filterCategory,  setFilterCategory]  = useState<string>('ALL');
  const [isModalOpen,     setIsModalOpen]     = useState(false);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);

  // Form state
  const [amount,          setAmount]          = useState('');
  const [currency,        setCurrency]        = useState<'AED' | 'INR'>('AED');
  const [category,        setCategory]        = useState('Food');
  const [subCategory,     setSubCategory]     = useState('');
  const [date,            setDate]            = useState(getToday());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note,            setNote]            = useState('');

  // Tabby preview state
  const [tabbyLimitError, setTabbyLimitError] = useState<string | null>(null);

  // ── Listeners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, snap => {
      setPaymentMethods(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter(pm => pm.id && !pm.isDeleted)
      );
    });
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('type', '==', 'expense')
    );
    return onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Transaction))
        .filter(t => t.date && !t.isReversed)          // ← FIXED: exclude reversed
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user.uid]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const uniqueCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...transactions.map(t => t.category).filter(Boolean),
  ]));

  const uniqueSubCategories = Array.from(new Set(
    transactions
      .filter(t => t.category === category && t.subCategory)
      .map(t => t.subCategory as string)
  ));

  const modalMethods = paymentMethods.filter(pm =>
    currency === 'AED'
      ? pm.country === 'UAE' || pm.country === 'Both'
      : pm.country === 'India' || pm.country === 'Both'
  );

  // Selected method (for Tabby detection)
  const selectedMethod = paymentMethods.find(m => m.id === paymentMethodId) || null;
  const isTabbyPro     = selectedMethod ? isTabbyProEnabled(selectedMethod) : false;
  const amountNum      = parseFloat(amount) || 0;

  // Auto-select first method when currency changes
  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods.length, editingId]);

  // Tabby limit check on amount/method change
  useEffect(() => {
    if (isTabbyPro && selectedMethod && amountNum > 0) {
      const check = canTabbyPurchase(selectedMethod, amountNum);
      setTabbyLimitError(check.allowed ? null : (check.message || 'Limit exceeded'));
    } else {
      setTabbyLimitError(null);
    }
  }, [isTabbyPro, amountNum, paymentMethodId]);

  // Filtered transactions
  const filteredTransactions = transactions.filter(t => {
    if (filterCountry !== 'ALL' && t.country !== filterCountry) return false;
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
    return true;
  });

  // Summary totals (not filtered by category so totals stay accurate)
  const totalAED = transactions
    .filter(t => t.currency === 'AED' && (filterCountry === 'ALL' || t.country === filterCountry))
    .reduce((s, t) => s + t.amount, 0);

  const totalINR = transactions
    .filter(t => t.currency === 'INR' && (filterCountry === 'ALL' || t.country === filterCountry))
    .reduce((s, t) => s + t.amount, 0);

  // Category breakdown for quick filter
  const categoryTotals = transactions
    .filter(t => filterCountry === 'ALL' || t.country === filterCountry)
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Modal Handlers ─────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingId(null);
    setAmount(''); setCurrency('AED'); setCategory('Food');
    setSubCategory(''); setDate(getToday()); setPaymentMethodId('');
    setNote(''); setTabbyLimitError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingId(tx.id);
    setAmount(tx.amount.toString());
    setCurrency(tx.currency);
    setCategory(tx.category);
    setSubCategory(tx.subCategory || '');
    setDate(tx.date);
    setPaymentMethodId(tx.paymentMethodId || '');
    setNote(tx.note || '');
    setTabbyLimitError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) { toast.error('Enter a valid amount'); return; }
    if (!paymentMethodId) { toast.error('Please select a payment method'); return; }
    if (!category.trim()) { toast.error('Please enter a category'); return; }

    // Tabby limit check
    if (isTabbyPro && selectedMethod) {
      const check = canTabbyPurchase(selectedMethod, val);
      if (!check.allowed) {
        toast.error(check.message || 'Tabby limit exceeded');
        return;
      }
    }

    setSaving(true);

    const selectedPM      = paymentMethods.find(m => m.id === paymentMethodId);
    const debitAccountId  = getExpenseGLAccount(category);
    const creditAccountId = paymentMethodId;

    const payload = {
      userId:            user.uid,
      type:              'expense' as const,
      amount:            val,
      currency,
      category:          category.trim(),
      subCategory:       subCategory.trim() || null,
      date,
      paymentMethodId,
      paymentMethod:     selectedPM?.type   || null,
      paymentMethodName: selectedPM?.name   || null,
      paymentMethodType: selectedPM?.type   || null,
      note:              note.trim() || null,
      country:           (currency === 'AED' ? 'UAE' : 'India') as 'UAE' | 'India',
      debitAccountId,
      creditAccountId,
      updatedAt:         Timestamp.now(),
    };

    try {
      if (editingId) {
        // ── Edit: direct update ──────────────────────────────────────────────
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Expense updated');
      } else {
        // ── New expense ──────────────────────────────────────────────────────
        const txRef = await addDoc(collection(db, 'transactions'), {
          ...payload,
          createdAt: Timestamp.now(),
        });

        // ── Tabby Pro: auto-create installment schedule ──────────────────────
        if (isTabbyPro && selectedMethod && selectedPM) {
          try {
            const stmtDay  = selectedMethod.statementDate || 23;
            const dueDay   = selectedMethod.dueDate || 3;

            const schedule = buildTabbyProSchedule(
              val,
              date,
              category.trim(),
              txRef.id,
              stmtDay,
              dueDay
            );

            const existingEmis = (selectedMethod.tabbyEmis || []) as TabbyPurchaseEMI[];

            await updateDoc(doc(db, 'paymentMethods', selectedMethod.id), {
              tabbyEmis: [...existingEmis, schedule],
              updatedAt: Timestamp.now(),
            });

            toast.success(
              `💳 Tabby Pro: ${fmtAED(val)} split into 4 × ${fmtAED(schedule.emiAmount)}`,
              { duration: 5000, icon: '🛒' }
            );
          } catch (tabbyErr) {
            console.error('Tabby EMI creation failed:', tabbyErr);
            // Expense still posted — just warn about EMI
            toast.error('Expense posted but Tabby schedule failed. Check Cards page.');
          }
        } else {
          toast.success('Expense posted to ledger');
        }
      }

      closeModal();
    } catch (err) {
      console.error('Expense save error:', err);
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      // Check if it's a Tabby transaction — warn user
      const tx = transactions.find(t => t.id === id);
      if (tx?.paymentMethodType === 'tabby') {
        const confirmed = window.confirm(
          'This is a Tabby purchase. Deleting will also remove the linked installment schedule. Continue?'
        );
        if (!confirmed) return;

        // Remove linked Tabby EMI
        const tabbyMethod = paymentMethods.find(m => m.id === tx.paymentMethodId);
        if (tabbyMethod?.tabbyEmis) {
          const updatedEmis = tabbyMethod.tabbyEmis.filter(
            emi => emi.sourceTransactionId !== id
          );
          await updateDoc(doc(db, 'paymentMethods', tabbyMethod.id), {
            tabbyEmis: updatedEmis,
            updatedAt: Timestamp.now(),
          });
        }
      }

      await deleteDoc(doc(db, 'transactions', id));
      toast.success('Expense deleted');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Delete failed');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 100px', maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>ERP LEDGER</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Expenses</div>
        </div>
        <button onClick={openAddModal}
          style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--danger)', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid #ef4444', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>UAE EXPENSES</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#ef4444' }}>
            AED {totalAED.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid #f97316', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>INDIA EXPENSES</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f97316' }}>
            INR {totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ── Top Categories Quick Filter ── */}
      {topCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
          <button
            onClick={() => setFilterCategory('ALL')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filterCategory === 'ALL' ? 'var(--danger)' : 'var(--border)',
              background: filterCategory === 'ALL' ? 'var(--danger)' : 'transparent',
              color: filterCategory === 'ALL' ? '#fff' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            All Categories
          </button>
          {topCategories.map(([cat]) => (
            <button key={cat}
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid',
                borderColor: filterCategory === cat ? 'var(--danger)' : 'var(--border)',
                background: filterCategory === cat ? 'rgba(239,68,68,0.1)' : 'transparent',
                color: filterCategory === cat ? 'var(--danger)' : 'var(--muted)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── Country Filter Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['ALL', 'UAE', 'India'] as const).map(c => (
          <button key={c}
            onClick={() => setFilterCountry(c)}
            style={{
              border: 'none',
              background: filterCountry === c ? 'var(--danger)' : 'transparent',
              color: 'var(--text)', padding: '7px 16px', borderRadius: 9,
              cursor: 'pointer', fontSize: 13, fontWeight: 800,
            }}
          >
            {c === 'ALL' ? '\uD83C\uDF0D All' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
          </button>
        ))}
      </div>

      {/* ── Transaction List ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Loading expenses...</div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <ReceiptText size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No expenses found</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Click Add Expense to record your first entry.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filteredTransactions.map(tx => (
            <div key={tx.id} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 17, padding: '14px 16px',
              display: 'flex', flexWrap: 'wrap', alignItems: 'center',
              justifyContent: 'space-between', gap: 14,
              borderLeft: tx.paymentMethodType === 'tabby' ? '3px solid #8b5cf6' : '1px solid var(--border)',
            }}>
              {/* Left */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, flex: 1 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 14, flexShrink: 0, fontSize: 18,
                  background: tx.paymentMethodType === 'tabby'
                    ? 'rgba(139,92,246,0.12)' : 'rgba(239,68,68,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cardTypeIcon[tx.paymentMethod || tx.paymentMethodType || ''] || '💳'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.category}
                    {tx.subCategory && (
                      <span style={{ opacity: 0.6, fontSize: 13, fontWeight: 700 }}>
                        {' › '}{tx.subCategory}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.paymentMethodName || 'Unknown'} &bull; {tx.date}
                    {tx.paymentMethodType === 'tabby' && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#8b5cf6', fontWeight: 700 }}>
                        💳 4x
                      </span>
                    )}
                  </div>
                  {tx.note && (
                    <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>
                      &ldquo;{tx.note}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: 'var(--danger)', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap' }}>
                    -{tx.currency === 'INR' ? '₹' : 'AED '}
                    {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>{tx.country}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditModal(tx)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(tx.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {isModalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
        >
          <div style={{
            background: 'var(--card)', borderRadius: '26px 26px 0 0',
            padding: '24px 20px 44px', width: '100%', maxWidth: 520,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.3)',
          }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isTabbyPro ? 'rgba(139,92,246,0.15)' : 'rgba(239,68,68,0.15)',
                  color: isTabbyPro ? '#8b5cf6' : 'var(--danger)',
                }}>
                  <ReceiptText size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    {editingId ? 'Edit Expense' : 'Add Expense'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {isTabbyPro ? '💳 Tabby Pro — auto 4-installment split' : 'Double-entry ledger posting'}
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeModal}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 12, padding: 9, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount *</label>
                <input
                  type="number" inputMode="decimal" step="any" placeholder="0.00" required
                  value={amount} onChange={e => setAmount(e.target.value)}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 800 }}
                />
              </div>

              {/* Currency */}
              <div>
                <label style={labelStyle}>Currency *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['AED', 'INR'] as const).map(c => {
                    const active = currency === c;
                    return (
                      <button key={c} type="button"
                        onClick={() => { setCurrency(c); setPaymentMethodId(''); }}
                        style={{
                          padding: '11px 10px', borderRadius: 12,
                          border: `2px solid ${active ? 'var(--danger)' : 'var(--border)'}`,
                          background: active ? 'var(--danger)' : 'var(--card)',
                          color: active ? '#fff' : 'var(--text)',
                          fontWeight: 800, cursor: 'pointer', fontSize: 14,
                        }}
                      >
                        {c === 'AED' ? '🇦🇪 AED' : '🇮🇳 INR'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label style={labelStyle}>Payment Method *</label>
                {modalMethods.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: 'var(--danger)' }}>
                    No {currency} payment methods found. Add accounts in Cards first.
                  </div>
                ) : (
                  <select value={paymentMethodId} onChange={e => setPaymentMethodId(e.target.value)} style={inputStyle}>
                    <option value="">Select payment method</option>
                    {modalMethods.map(m => (
                      <option key={m.id} value={m.id}>
                        {cardTypeIcon[m.type] || '💳'} {m.name}
                        {m.bankName ? ` (${m.bankName})` : ''}
                        {m.type === 'tabby' && m.tabbyProEnabled ? ' — PRO' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tabby Pro Preview Banner */}
              {isTabbyPro && amountNum > 0 && date && (
                <TabbyPreviewBanner
                  amount={amountNum}
                  date={date}
                  category={category}
                  method={selectedMethod!}
                />
              )}

              {/* Tabby limit error */}
              {tabbyLimitError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Info size={14} /> {tabbyLimitError}
                </div>
              )}

              {/* Category + Sub Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <input type="text" list="expense-cat-list" placeholder="e.g. Food" required
                    value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}
                  />
                  <datalist id="expense-cat-list">
                    {uniqueCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Sub Category</label>
                  <input type="text" list="expense-subcat-list" placeholder="Optional"
                    value={subCategory} onChange={e => setSubCategory(e.target.value)} style={inputStyle}
                  />
                  <datalist id="expense-subcat-list">
                    {uniqueSubCategories.map(sc => <option key={sc} value={sc} />)}
                  </datalist>
                </div>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>

              {/* Note */}
              <div>
                <label style={labelStyle}>Note</label>
                <input type="text" placeholder="Optional note..." value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
              </div>

              {/* Tabby Pro info box (non-edit only) */}
              {isTabbyPro && !editingId && (
                <div style={{
                  padding: '10px 14px', borderRadius: 12, fontSize: 13,
                  background: 'rgba(139,92,246,0.05)',
                  border: '1px solid rgba(139,92,246,0.2)',
                  color: 'var(--muted)',
                }}>
                  <strong style={{ color: '#8b5cf6' }}>💳 Tabby Pro Active</strong>
                  <br />Full expense posted today. Tabby installment schedule auto-created.
                  View schedule in Cards → Tabby.
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={saving || (isTabbyPro && !!tabbyLimitError)}
                style={{
                  width: '100%', marginTop: 8, padding: '15px', borderRadius: 15,
                  border: 'none',
                  cursor: (saving || (isTabbyPro && !!tabbyLimitError)) ? 'not-allowed' : 'pointer',
                  background: isTabbyPro ? '#8b5cf6' : 'var(--danger)',
                  color: '#fff', fontWeight: 900, fontSize: 16,
                  opacity: (saving || (isTabbyPro && !!tabbyLimitError)) ? 0.6 : 1,
                }}
              >
                {saving
                  ? (isTabbyPro ? 'Creating Tabby Schedule...' : 'Saving...')
                  : editingId
                  ? 'Update Expense'
                  : isTabbyPro
                  ? '🛒 Post + Create Tabby Schedule'
                  : 'Post Expense'}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}