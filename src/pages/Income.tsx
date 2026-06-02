import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, RefreshCw, TrendingUp } from 'lucide-react';
import { postDoubleEntry, defaultIncomeCategories, formatCurrency, getToday, type Transaction, type Currency } from '../firestoreHelpers';
import TransactionEditor from '../components/TransactionEditor';

interface PaymentMethod {
  id: string; name: string; type: string;
  country: 'UAE' | 'India' | 'Both'; bankName?: string; color?: string;
}

const cardTypeIcon: Record<string, string> = {
  credit: '💳', debit: '🏦', tabby: '🛍️',
  cash: '💵', upi: '📱', custom: '➕',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--muted)', marginBottom: 6, display: 'block', fontWeight: 600,
};

export default function Income({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [filterCountry, setFilterCountry] = useState<'ALL' | 'UAE' | 'India'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('AED');
  const [category, setCategory] = useState('Salary');
  const [subCategory, setSubCategory] = useState('');
  const [date, setDate] = useState(getToday());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'paymentMethods'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setPaymentMethods(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentMethod)).filter((pm) => pm.id));
    });
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'transactions'), where('userId', '==', user.uid), where('type', '==', 'income'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)).filter((t) => t.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [user.uid]);

  const modalMethods = paymentMethods.filter((pm) =>
    currency === 'AED' ? pm.country === 'UAE' || pm.country === 'Both' : pm.country === 'India' || pm.country === 'Both'
  );

  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods, editingId]);

  const openAddModal = () => {
    setEditingId(null); setAmount(''); setCurrency('AED');
    setCategory('Salary'); setSubCategory(''); setDate(getToday());
    setPaymentMethodId(''); setNote(''); setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTxId(tx.id ?? null);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!amount || Number.isNaN(val) || val <= 0) { toast.error('Enter a valid amount'); return; }
    if (!paymentMethodId) { toast.error('Please select payment method'); return; }
    if (!category.trim()) { toast.error('Please specify a category'); return; }

    setSaving(true);
    const selectedPM = paymentMethods.find((m) => m.id === paymentMethodId);

    const payload = {
      userId: user.uid, type: 'income' as const, amount: val, currency,
      category: category.trim(), subCategory: subCategory.trim() ? subCategory.trim() : null,
      date, paymentMethodId, paymentMethodName: selectedPM?.name ?? null,
      paymentMethodType: selectedPM?.type ?? null,
      note: note.trim() === '' ? null : note.trim(),
      country: (currency === 'AED' ? 'UAE' : 'India') as 'UAE' | 'India',
      debitAccountId: paymentMethodId, creditAccountId: '4000',
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Income record updated');
      } else {
        await postDoubleEntry(payload);
        toast.success('Income posted to ledger');
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this income record?')) return;
    try { await deleteDoc(doc(db, 'transactions', id)); toast.success('Income record deleted'); }
    catch (err) { console.error(err); toast.error('Failed to delete'); }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterCountry === 'ALL') return true;
    return t.country === filterCountry;
  });

  const totalIncome = filteredTransactions.reduce((s, t) => s + t.amount, 0);
  const thisMonthIncome = filteredTransactions.filter((t) => t.date.startsWith(getToday().slice(0, 7))).reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>INCOME LEDGER</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Income Records</div>
        </div>
        <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--success)', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
          <Plus size={16} /> Add Income
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Total Income</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)' }}>{formatCurrency(totalIncome, currency)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>This Month</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{formatCurrency(thisMonthIncome, currency)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Records</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>{filteredTransactions.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['ALL', 'UAE', 'India'] as const).map((c) => (
          <button key={c} onClick={() => setFilterCountry(c)} style={{ border: 'none', background: filterCountry === c ? 'var(--success)' : 'transparent', color: 'var(--text)', padding: '7px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            {c === 'ALL' ? '\uD83C\uDF0D All' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
          </button>
        ))}
      </div>

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
          {filteredTransactions.map((tx) => (
            <div key={tx.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 17, padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: '220px', flex: 1 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                  {defaultIncomeCategories.find(c => c.name.toLowerCase() === tx.category.toLowerCase())?.icon || '💰'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.category}{tx.subCategory && <span style={{ opacity: 0.6, fontSize: 14, fontWeight: 700 }}> › {tx.subCategory}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.paymentMethodName || 'Unknown'} \u2022 {tx.date}
                  </div>
                  {tx.note && (<div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>"{tx.note}"</div>)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexShrink: 0 }}>
                <span style={{ color: 'var(--success)', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap' }}>
                  +{tx.currency === 'INR' ? '₹' : 'AED '}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: tx.currency === 'AED' ? 2 : 0, maximumFractionDigits: 2 })}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onClick={(e) => { e.stopPropagation(); setEditingTxId(tx.id ?? null); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', padding: 6, borderRadius: 8, pointerEvents: 'auto', display: 'flex', alignItems: 'center' }}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(tx.id!)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: '26px 26px 0 0', padding: '24px 20px 44px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -20px 50px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>{editingId ? 'Edit Income' : 'Add Income'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Record income to ledger</div>
                </div>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'var(--bg)', border: 'none', borderRadius: 12, padding: 9, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Amount *</label>
                <input type="number" inputMode="decimal" step="any" placeholder="0.00" required value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, fontSize: 20, fontWeight: 800 }} />
              </div>
              <div>
                <label style={labelStyle}>Currency *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['AED', 'INR'] as const).map((c) => {
                    const active = currency === c;
                    return (
                      <button key={c} type="button" onClick={() => { setCurrency(c); setPaymentMethodId(''); }} style={{ padding: '11px 10px', borderRadius: 12, border: `2px solid ${active ? 'var(--success)' : 'var(--border)'}`, background: active ? 'var(--success)' : 'var(--card)', color: active ? '#fff' : 'var(--text)', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
                        {c === 'AED' ? '\uD83C\uDDE6 AED' : '🇮🇳 INR'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Income Source *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {defaultIncomeCategories.map((cat) => {
                    const active = category === cat.name;
                    return (
                      <button key={cat.id} type="button" onClick={() => setCategory(cat.name)} style={{ padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${active ? 'var(--success)' : 'var(--border)'}`, background: active ? 'var(--success)' : 'var(--card)', color: active ? '#fff' : 'var(--text)', fontSize: 13, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{cat.icon}</span> {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Received Into *</label>
                {modalMethods.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: 'var(--danger)' }}>No payment methods for {currency}. Add one in Cards page.</div>
                ) : (
                  <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} style={inputStyle}>
                    <option value="">Select account</option>
                    {modalMethods.map((m) => (<option key={m.id} value={m.id}>{cardTypeIcon[m.type] || '💳'} {m.name} {m.bankName ? `(${m.bankName})` : ''}</option>))}
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Sub Category (Optional)</label>
                <input type="text" placeholder="e.g. Monthly salary, Project bonus" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Note (Optional)</label>
                <input type="text" placeholder="Additional details" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" disabled={saving} style={{ width: '100%', marginTop: 10, padding: '15px', borderRadius: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--success)', color: '#fff', fontWeight: 900, fontSize: 16, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Processing...' : editingId ? 'Update Income' : 'Save Income'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingTxId && (
        <TransactionEditor user={user} transactionId={editingTxId} onClose={() => setEditingTxId(null)} onUpdate={() => {}} />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}