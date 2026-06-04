// src/pages/Income.tsx
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, RefreshCw, TrendingUp } from 'lucide-react';
import {
  postDoubleEntry,
  formatCurrency,
  getToday,
  listenGLAccounts,
} from '../firestoreHelpers';
import type { Transaction, Currency, GLAccount } from '../firestoreHelpers';
import TransactionEditor from '../components/TransactionEditor';
import SmartCategoryPicker from '../components/SmartCategoryPicker';
import SubCategoryInput from '../components/SubCategoryInput';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  color?: string;
  isDeleted?: boolean;
}

// Extended Transaction type for categoryName
interface IncomeTx extends Transaction {
  categoryName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const cardTypeIcon: Record<string, string> = {
  credit: '💳',
  debit:  '🏦',
  tabby:  '🛍️',
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Income({ user }: { user: User }) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [transactions, setTransactions]     = useState<IncomeTx[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [glAccounts, setGlAccounts]         = useState<GLAccount[]>([]);
  const [filterCountry, setFilterCountry]   = useState<'ALL' | 'UAE' | 'India'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [editingTxId, setEditingTxId]       = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);

  // Form state
  const [amount, setAmount]                 = useState('');
  const [currency, setCurrency]             = useState<Currency>('AED');
  const [categoryCode, setCategoryCode]     = useState('');    // GL code
  const [categoryName, setCategoryName]     = useState('');    // for display
  const [subCategory, setSubCategory]       = useState('');
  const [date, setDate]                     = useState(getToday());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note, setNote]                     = useState('');

  // ── Listeners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'paymentMethods'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setPaymentMethods(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id && !pm.isDeleted)
      );
    });
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('type', '==', 'income')
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as IncomeTx))
        .filter((t) => t.date && !t.isReversed)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user.uid]);

  // GL Accounts listener (for category dropdown)
  useEffect(() => {
    if (!user?.uid) return;
    return listenGLAccounts(user.uid, setGlAccounts);
  }, [user?.uid]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const modalMethods = paymentMethods.filter((pm) =>
    currency === 'AED'
      ? pm.country === 'UAE' || pm.country === 'Both'
      : pm.country === 'India' || pm.country === 'Both'
  );

  // Auto-select first method when currency changes
  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods.length, editingId]);

  // Get account display info
  const getAccountDisplay = (code: string): { icon: string; name: string } => {
    const acc = glAccounts.find(a => a.code === code);
    return {
      icon: acc?.icon || '💰',
      name: acc?.name || code,
    };
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter((t) => {
    if (filterCountry !== 'ALL' && t.country !== filterCountry) return false;
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
    return true;
  });

  // Totals (separated by currency — FIXED)
  const totalAED = transactions
    .filter((t) => t.currency === 'AED' && (filterCountry === 'ALL' || t.country === filterCountry))
    .reduce((s, t) => s + t.amount, 0);

  const totalINR = transactions
    .filter((t) => t.currency === 'INR' && (filterCountry === 'ALL' || t.country === filterCountry))
    .reduce((s, t) => s + t.amount, 0);

  // This month totals (separated)
  const currentMonth = getToday().slice(0, 7);
  const thisMonthAED = transactions
    .filter((t) =>
      t.currency === 'AED' &&
      t.date.startsWith(currentMonth) &&
      (filterCountry === 'ALL' || t.country === filterCountry)
    )
    .reduce((s, t) => s + t.amount, 0);

  const thisMonthINR = transactions
    .filter((t) =>
      t.currency === 'INR' &&
      t.date.startsWith(currentMonth) &&
      (filterCountry === 'ALL' || t.country === filterCountry)
    )
    .reduce((s, t) => s + t.amount, 0);

  // Top categories for filter chips
  const categoryTotals = transactions
    .filter((t) => filterCountry === 'ALL' || t.country === filterCountry)
    .reduce((acc, t) => {
      const key = t.categoryName || t.category;
      acc[key] = (acc[key] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Modal Handlers ─────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingId(null);
    setAmount('');
    setCurrency('AED');
    setCategoryCode('');
    setCategoryName('');
    setSubCategory('');
    setDate(getToday());
    setPaymentMethodId('');
    setNote('');
    setIsModalOpen(true);
  };

  const openEditModal = (tx: IncomeTx) => {
    // Use TransactionEditor for editing (consistent UX)
    setEditingTxId(tx.id ?? null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleCategoryChange = (code: string, account: GLAccount) => {
    setCategoryCode(code);
    setCategoryName(account.name);
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
    if (!categoryCode) {
      toast.error('Please select an income source');
      return;
    }

    setSaving(true);
    const selectedPM = paymentMethods.find((m) => m.id === paymentMethodId);

    const payload = {
      userId: user.uid,
      type: 'income' as const,
      amount: val,
      currency,
      category: categoryCode,                    // GL code stored
      categoryName: categoryName,                // human-readable
      subCategory: subCategory.trim() || null,
      date,
      paymentMethodId,
      paymentMethod: selectedPM?.type || null,
      paymentMethodName: selectedPM?.name || null,
      paymentMethodType: selectedPM?.type || null,
      note: note.trim() || null,
      country: (currency === 'AED' ? 'UAE' : 'India') as 'UAE' | 'India',
      debitAccountId: paymentMethodId,           // payment method (asset)
      creditAccountId: categoryCode,             // income GL account
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Income updated');
      } else {
        await postDoubleEntry(payload);
        toast.success('Income posted to ledger');
      }
      closeModal();
    } catch (err) {
      console.error('Income save error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this income record?')) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
      toast.success('Income deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>
            INCOME LEDGER
          </div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Income</div>
        </div>
        <button onClick={openAddModal}
          style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--success)', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}
        >
          <Plus size={16} /> Add Income
        </button>
      </div>

      {/* Summary Cards — AED + INR separated */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid #10b981', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>UAE INCOME</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>
            AED {totalAED.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
          </div>
          {thisMonthAED > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              This month: AED {thisMonthAED.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>INDIA INCOME</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>
            INR {totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          {thisMonthINR > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              This month: ₹{thisMonthINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {/* Top Categories Quick Filter */}
      {topCategories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
          <button
            onClick={() => setFilterCategory('ALL')}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid',
              borderColor: filterCategory === 'ALL' ? 'var(--success)' : 'var(--border)',
              background: filterCategory === 'ALL' ? 'var(--success)' : 'transparent',
              color: filterCategory === 'ALL' ? '#fff' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            All Sources
          </button>
          {topCategories.map(([catName]) => {
            const acc = glAccounts.find(a => a.name === catName);
            const filterValue = acc?.code || catName;
            return (
              <button key={catName}
                onClick={() => setFilterCategory(filterValue)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid',
                  borderColor: filterCategory === filterValue ? 'var(--success)' : 'var(--border)',
                  background: filterCategory === filterValue ? 'rgba(16,185,129,0.1)' : 'transparent',
                  color: filterCategory === filterValue ? 'var(--success)' : 'var(--muted)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {acc?.icon && <span>{acc.icon}</span>}
                {catName}
              </button>
            );
          })}
        </div>
      )}

      {/* Country Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['ALL', 'UAE', 'India'] as const).map((c) => (
          <button key={c} onClick={() => setFilterCountry(c)}
            style={{
              border: 'none',
              background: filterCountry === c ? 'var(--success)' : 'transparent',
              color: filterCountry === c ? '#fff' : 'var(--text)',
              padding: '7px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800,
            }}
          >
            {c === 'ALL' ? '🌍 All' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Loading income records...</div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <TrendingUp size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No income records yet</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Click "Add Income" to record your first entry</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filteredTransactions.map((tx) => {
            const display = getAccountDisplay(tx.category);
            return (
              <div key={tx.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 17, padding: '14px 16px',
                display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                justifyContent: 'space-between', gap: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, flex: 1 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 14,
                    background: 'rgba(16,185,129,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 18,
                  }}>
                    {display.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.categoryName || display.name}
                      {tx.subCategory && (
                        <span style={{ opacity: 0.6, fontSize: 14, fontWeight: 700 }}>
                          {' › '}{tx.subCategory}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.paymentMethodName || 'Unknown'} • {tx.date}
                    </div>
                    {tx.note && (
                      <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>
                        "{tx.note}"
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap' }}>
                      +{tx.currency === 'INR' ? '₹' : 'AED '}
                      {tx.amount.toLocaleString(undefined, {
                        minimumFractionDigits: tx.currency === 'AED' ? 2 : 0,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 600 }}>
                      {tx.country}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      onClick={(e) => { e.stopPropagation(); openEditModal(tx); }}
                      style={{
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--muted)', cursor: 'pointer', padding: 6, borderRadius: 8,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(tx.id!)}
                      style={{
                        background: 'transparent', border: 'none',
                        color: 'var(--danger)', cursor: 'pointer', padding: 6,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Income Modal ── */}
      {isModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)', display: 'flex',
            alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{
            background: 'var(--card)', borderRadius: '26px 26px 0 0',
            padding: '24px 20px 44px', width: '100%', maxWidth: 520,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.22)',
          }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 14,
                  background: 'rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--success)',
                }}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>
                    Add Income
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Double-entry ledger posting
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeModal}
                style={{
                  background: 'var(--bg)', border: 'none', borderRadius: 12,
                  padding: 9, cursor: 'pointer', color: 'var(--text)',
                  display: 'flex', alignItems: 'center',
                }}
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
                  type="number" inputMode="decimal" step="any"
                  placeholder="0.00" required
                  value={amount} onChange={(e) => setAmount(e.target.value)}
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
                      <button key={c} type="button"
                        onClick={() => { setCurrency(c); setPaymentMethodId(''); }}
                        style={{
                          padding: '11px 10px', borderRadius: 12,
                          border: `2px solid ${active ? 'var(--success)' : 'var(--border)'}`,
                          background: active ? 'var(--success)' : 'var(--card)',
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
                <label style={labelStyle}>Received Into *</label>
                {modalMethods.length === 0 ? (
                  <div style={{
                    padding: 12, borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 13, color: 'var(--danger)',
                  }}>
                    No {currency} payment methods found. Add accounts in Cards page first.
                  </div>
                ) : (
                  <select value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select account</option>
                    {modalMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {cardTypeIcon[m.type] || '💳'} {m.name}
                        {m.bankName ? ` (${m.bankName})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Income Source — Smart Picker */}
              <div>
                <label style={labelStyle}>Income Source *</label>
                <SmartCategoryPicker
                  value={categoryCode}
                  onChange={handleCategoryChange}
                  accounts={glAccounts}
                  accountClass="Income"
                  allowCreate={true}
                  userId={user.uid}
                  placeholder="Select income source"
                />
              </div>

              {/* Sub Category — Smart Autocomplete */}
              <div>
                <label style={labelStyle}>Sub Category (optional)</label>
                <SubCategoryInput
                  value={subCategory}
                  onChange={setSubCategory}
                  category={categoryCode}
                  transactions={transactions}
                  placeholder="e.g. Monthly salary, Project name..."
                />
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required
                  value={date} onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Note */}
              <div>
                <label style={labelStyle}>Note (Optional)</label>
                <input type="text"
                  placeholder="Additional details..."
                  value={note} onChange={(e) => setNote(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Submit */}
              <button type="submit" disabled={saving}
                style={{
                  width: '100%', marginTop: 8, padding: '15px',
                  borderRadius: 15, border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'var(--success)', color: '#fff',
                  fontWeight: 900, fontSize: 16,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Processing...' : 'Post Income'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Editor for edit mode */}
      {editingTxId && (
        <TransactionEditor
          user={user}
          transactionId={editingTxId}
          onClose={() => setEditingTxId(null)}
          onUpdate={() => {}}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}