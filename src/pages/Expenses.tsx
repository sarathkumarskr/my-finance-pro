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
import { Plus, Edit2, Trash2, X, RefreshCw, ReceiptText } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
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
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  color?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  'Rent', 'Food', 'Transport', 'Shopping', 'Medical',
  'Education', 'Entertainment', 'Utilities', 'Bank Fees', 'Other',
];

const cardTypeIcon: Record<string, string> = {
  credit: '💳', debit: '🏦', tabby: '🛍️',
  cash: '💵', upi: '📱', custom: '➕',
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

// GL Account Mapper (Chart of Accounts 5000-5999 = Expenses)
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
  return '5090'; // General Expenses
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Expenses({ user }: { user: User }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [filterCountry, setFilterCountry]   = useState<'ALL' | 'UAE' | 'India'>('ALL');
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);

  // Form state
  const [amount, setAmount]               = useState('');
  const [currency, setCurrency]           = useState<'AED' | 'INR'>('AED');
  const [category, setCategory]           = useState('Food');
  const [subCategory, setSubCategory]     = useState('');
  const [date, setDate]                   = useState(getToday());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note, setNote]                   = useState('');

  // ── Firestore: Payment Methods ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPaymentMethods(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id)
      );
    });
    return unsub;
  }, [user.uid]);

  // ── Firestore: Expenses ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('type', '==', 'expense')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Transaction))
          .filter((t) => t.date)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        setTransactions(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user.uid]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const uniqueCategories = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...transactions.map((t) => t.category).filter(Boolean),
    ])
  );

  const uniqueSubCategories = Array.from(
    new Set(
      transactions
        .filter((t) => t.category === category && t.subCategory)
        .map((t) => t.subCategory as string)
    )
  );

  const modalMethods = paymentMethods.filter((pm) =>
    currency === 'AED'
      ? pm.country === 'UAE' || pm.country === 'Both'
      : pm.country === 'India' || pm.country === 'Both'
  );

  // Auto-select first payment method when currency changes
  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods.length, editingId]);

  const filteredTransactions = transactions.filter((t) => {
    if (filterCountry === 'ALL') return true;
    return t.country === filterCountry;
  });

  // Summary totals
  const totalAED = filteredTransactions
    .filter((t) => t.currency === 'AED')
    .reduce((s, t) => s + t.amount, 0);

  const totalINR = filteredTransactions
    .filter((t) => t.currency === 'INR')
    .reduce((s, t) => s + t.amount, 0);

  // ── Modal Handlers ─────────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingId(null);
    setAmount('');
    setCurrency('AED');
    setCategory('Food');
    setSubCategory('');
    setDate(getToday());
    setPaymentMethodId('');
    setNote('');
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
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const val = parseFloat(amount);
    if (!amount || Number.isNaN(val) || val <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!paymentMethodId) {
      toast.error('Please select a payment method');
      return;
    }
    if (!category.trim()) {
      toast.error('Please enter a category');
      return;
    }

    setSaving(true);

    const selectedPM = paymentMethods.find((m) => m.id === paymentMethodId);

    // Double-Entry: Debit Expense GL, Credit Payment Method (Asset/Liability)
    const debitAccountId  = getExpenseGLAccount(category);
    const creditAccountId = paymentMethodId;

    const payload = {
      userId:             user.uid,
      type:               'expense' as const,
      amount:             val,
      currency,
      category:           category.trim(),
      subCategory:        subCategory.trim() || null,
      date,
      paymentMethodId,
      paymentMethod:      selectedPM?.type    || null,
      paymentMethodName:  selectedPM?.name    || null,
      paymentMethodType:  selectedPM?.type    || null,
      note:               note.trim() || null,
      country:            (currency === 'AED' ? 'UAE' : 'India') as 'UAE' | 'India',
      debitAccountId,
      creditAccountId,
      updatedAt:          Timestamp.now(),
    };

    try {
      if (editingId) {
        // Edit: direct update
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Expense updated');
      } else {
        // New: addDoc with createdAt
        await addDoc(collection(db, 'transactions'), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        toast.success('Expense posted to ledger');
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
      await deleteDoc(doc(db, 'transactions', id));
      toast.success('Expense deleted');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Delete failed');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding: '22px 16px 100px',
      maxWidth: 900,
      margin: '0 auto',
      color: 'var(--text)',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 22,
      }}>
        <div>
          <div style={{
            fontSize: 13,
            color: 'var(--muted)',
            fontWeight: 800,
            letterSpacing: 0.5,
          }}>
            ERP LEDGER
          </div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Expenses</div>
        </div>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'var(--danger)',
            color: '#fff',
            border: 'none',
            padding: '11px 16px',
            borderRadius: 14,
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid #ef4444',
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
            UAE EXPENSES
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#ef4444' }}>
            AED {totalAED.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid #f97316',
          borderRadius: 12,
          padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
            INDIA EXPENSES
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f97316' }}>
            INR {totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 20,
        background: 'var(--card)',
        padding: 6,
        borderRadius: 12,
        border: '1px solid var(--border)',
        width: 'fit-content',
      }}>
        {(['ALL', 'UAE', 'India'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilterCountry(c)}
            style={{
              border: 'none',
              background: filterCountry === c ? 'var(--danger)' : 'transparent',
              color: 'var(--text)',
              padding: '7px 16px',
              borderRadius: 9,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {c === 'ALL' ? '🌍 All' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
          </button>
        ))}
      </div>

      {/* ── Transaction List ── */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: 42,
          color: 'var(--muted)',
          background: 'var(--card)',
          borderRadius: 18,
          border: '1px solid var(--border)',
        }}>
          <RefreshCw
            size={24}
            style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }}
          />
          <div>Loading expenses...</div>
        </div>

      ) : filteredTransactions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 48,
          color: 'var(--muted)',
          background: 'var(--card)',
          borderRadius: 18,
          border: '1px solid var(--border)',
        }}>
          <ReceiptText size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No expenses found</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>
            Click Add Expense to record your first entry.
          </div>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filteredTransactions.map((tx) => (
            <div
              key={tx.id}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 17,
                padding: '14px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              {/* Left */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minWidth: 220,
                flex: 1,
              }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: 'rgba(239,68,68,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 18,
                }}>
                  {cardTypeIcon[tx.paymentMethod || ''] || '💳'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontWeight: 900,
                    fontSize: 15,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {tx.category}
                    {tx.subCategory && (
                      <span style={{
                        opacity: 0.6,
                        fontSize: 13,
                        fontWeight: 700,
                      }}>
                        {' \u203a '}{tx.subCategory}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {tx.paymentMethodName || 'Unknown'} &bull; {tx.date}
                  </div>
                  {tx.note && (
                    <div style={{
                      fontSize: 12,
                      fontStyle: 'italic',
                      color: 'var(--muted)',
                      marginTop: 2,
                    }}>
                      &ldquo;{tx.note}&rdquo;
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginLeft: 'auto',
                flexShrink: 0,
              }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    color: 'var(--danger)',
                    fontWeight: 900,
                    fontSize: 16,
                    whiteSpace: 'nowrap',
                  }}>
                    -{tx.currency === 'INR' ? '\u20b9' : 'AED '}
                    {tx.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <div style={{
                    fontSize: 10,
                    color: 'var(--muted)',
                    marginTop: 2,
                    fontWeight: 600,
                  }}>
                    {tx.country}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => openEditModal(tx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 6,
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(tx.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      padding: 6,
                    }}
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
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
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
          <div style={{
            background: 'var(--card)',
            borderRadius: '26px 26px 0 0',
            padding: '24px 20px 44px',
            width: '100%',
            maxWidth: 520,
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.3)',
          }}>

            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  background: 'rgba(239,68,68,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--danger)',
                }}>
                  <ReceiptText size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    {editingId ? 'Edit Expense' : 'Add Expense'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Double-entry ledger posting
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

            {/* Form */}
            <form onSubmit={handleSubmit} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ ...inputStyle, fontSize: 20, fontWeight: 800 }}
                />
              </div>

              {/* Currency */}
              <div>
                <label style={labelStyle}>Currency *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['AED', 'INR'] as const).map((c) => {
                    const active = currency === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCurrency(c);
                          setPaymentMethodId('');
                        }}
                        style={{
                          padding: '11px 10px',
                          borderRadius: 12,
                          border: `2px solid ${active ? 'var(--danger)' : 'var(--border)'}`,
                          background: active ? 'var(--danger)' : 'var(--card)',
                          color: active ? '#fff' : 'var(--text)',
                          fontWeight: 800,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        {c === 'AED' ? '\ud83c\uddae\ud83c\uddea AED' : '\ud83c\uddee\ud83c\uddf3 INR'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label style={labelStyle}>Payment Method *</label>
                {modalMethods.length === 0 ? (
                  <div style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 13,
                    color: 'var(--danger)',
                  }}>
                    No {currency} payment methods found.
                    Add accounts in the Cards section first.
                  </div>
                ) : (
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select payment method</option>
                    {modalMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {cardTypeIcon[m.type] || '💳'} {m.name}
                        {m.bankName ? ` (${m.bankName})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Category + Sub Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <input
                    type="text"
                    list="expense-cat-list"
                    placeholder="e.g. Food"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={inputStyle}
                  />
                  <datalist id="expense-cat-list">
                    {uniqueCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle}>Sub Category</label>
                  <input
                    type="text"
                    list="expense-subcat-list"
                    placeholder="Optional"
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    style={inputStyle}
                  />
                  <datalist id="expense-subcat-list">
                    {uniqueSubCategories.map((sc) => (
                      <option key={sc} value={sc} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Note */}
              <div>
                <label style={labelStyle}>Note</label>
                <input
                  type="text"
                  placeholder="Optional note..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: '15px',
                  borderRadius: 15,
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'var(--danger)',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 16,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                  ? 'Update Expense'
                  : 'Post Expense'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}