import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, X, RefreshCw, Wallet } from 'lucide-react';

interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: 'AED' | 'INR';
  category: string;
  date: string;
  paymentMethodId?: string;
  paymentMethod?: string;
  paymentMethodName?: string;
  paymentMethodType?: string;
  note: string | null;
  country: 'UAE' | 'India';
  userId: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  color?: string;
}

const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Other',
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

function pad2(n: number) { return String(n).padStart(2, '0'); }
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function Income({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [filterCountry, setFilterCountry] = useState<'ALL' | 'UAE' | 'India'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form Field tracking states mapped with Dashboard
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'AED' | 'INR'>('AED');
  const [category, setCategory] = useState('Salary');
  const [date, setDate] = useState(getToday());
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note, setNote] = useState('');

  // Real-time Payment Methods Stream
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'paymentMethods'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setPaymentMethods(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id)
      );
    });
    return unsubscribe;
  }, [user.uid]);

  // Real-time Inbound Transaction Streams Listener
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('type', '==', 'income')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Transaction))
        .filter((t) => t.date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [user.uid]);

  // Compute subset dynamically depending on active balance currency
  const modalMethods = paymentMethods.filter((pm) =>
    currency === 'AED'
      ? pm.country === 'UAE' || pm.country === 'Both'
      : pm.country === 'India'
  );

  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods, paymentMethodId, editingId]);

  const openAddModal = () => {
    setEditingId(null);
    setAmount('');
    setCurrency('AED');
    setCategory('Salary');
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
    setDate(tx.date);
    setPaymentMethodId(tx.paymentMethodId || '');
    setNote(tx.note || '');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!amount || Number.isNaN(val) || val <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!paymentMethodId) {
      toast.error('Select operational deposit destination account');
      return;
    }

    setSaving(true);
    const selectedPM = paymentMethods.find((m) => m.id === paymentMethodId);

    const payload = {
      userId: user.uid,
      type: 'income' as const,
      amount: val,
      currency,
      category,
      date,
      paymentMethodId,
      paymentMethod: selectedPM?.type || null,
      paymentMethodName: selectedPM?.name || null,
      paymentMethodType: selectedPM?.type || null,
      note: note.trim() === '' ? null : note.trim(), // Explicit null layout conversion
      country: currency === 'AED' ? ('UAE' as const) : ('India' as const),
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Capital stream trace configuration modified');
      } else {
        await addDoc(collection(db, 'transactions'), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        toast.success('Capital inbound entry logged successfully');
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error('Database streaming target configuration broken');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this inflow tracking record permanently?')) {
      try {
        await deleteDoc(doc(db, 'transactions', id));
        toast.success('Inbound trace trace completely dropped');
      } catch (err) {
        console.error(err);
        toast.error('Transaction interception layer breakdown');
      }
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterCountry === 'ALL') return true;
    return t.country === filterCountry;
  });

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>
      {/* Dynamic Workspace Tracking Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>LEDGER OVERVIEW</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Income Streams</div>
        </div>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'var(--success)',
            color: '#fff',
            border: 'none',
            padding: '11px 16px',
            borderRadius: 14,
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          <Plus size={16} /> Add Income
        </button>
      </div>

      {/* Quick Realm filter switch */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['ALL', 'UAE', 'India'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilterCountry(c)}
            style={{
              border: 'none',
              background: filterCountry === c ? 'var(--success)' : 'transparent',
              color: 'var(--text)',
              padding: '7px 16px',
              borderRadius: 9,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {c === 'ALL' ? '🌍 All Realms' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
          </button>
        ))}
      </div>

      {/* Core Streams Matrix output handler */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Syncing positive balance parameters...</div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <Wallet size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No positive balance inflows mapped</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Click Add Income to inject capital logs.</div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: '220px', flex: 1 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 18,
                  }}
                >
                  {cardTypeIcon[tx.paymentMethod || ''] || '💵'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.category}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.paymentMethodName || 'Asset Pool'} • {tx.date}
                  </div>
                  {tx.note && (
                    <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>
                      "{tx.note}"
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexShrink: 0 }}>
                <span style={{ color: 'var(--success)', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap' }}>
                  +{tx.currency === 'INR' ? '₹' : 'AED '}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: tx.currency === 'AED' ? 2 : 0, maximumFractionDigits: 2 })}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => openEditModal(tx)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(tx.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swipe Overlay Layout configuration parameters for Capital Input */}
      {isModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                  <Wallet size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>{editingId ? 'Modify Income Trace' : 'Log Capital Inflow'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Log active positive asset parameters</div>
                </div>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'var(--bg)', border: 'none', borderRadius: 12, padding: 9, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Sum Value *</label>
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

              <div>
                <label style={labelStyle}>Currency / Realm *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['AED', 'INR'] as const).map((c) => {
                    const active = currency === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { setCurrency(c); setPaymentMethodId(''); }}
                        style={{
                          padding: '11px 10px',
                          borderRadius: 12,
                          border: `2px solid ${active ? 'var(--success)' : 'var(--border)'}`,
                          background: active ? 'var(--success)' : 'var(--card)',
                          color: active ? '#fff' : 'var(--text)',
                          fontWeight: 800,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Received Into *</label>
                {modalMethods.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: 'var(--danger)' }}>
                    No target ledger accounts specified for {currency}. Add methods in Cards screen first.
                  </div>
                ) : (
                  <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} style={inputStyle}>
                    <option value="">Select target destination</option>
                    {modalMethods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {cardTypeIcon[m.type] || '💳'} {m.name} {m.bankName ? `(${m.bankName})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={labelStyle}>Inflow Category *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {INCOME_CATEGORIES.map((c) => {
                    const active = category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 999,
                          border: `1.5px solid ${active ? 'var(--success)' : 'var(--border)'}`,
                          background: active ? 'var(--success)' : 'var(--card)',
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

              <div>
                <label style={labelStyle}>Effective Value Date *</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Commentary Trace</label>
                <input type="text" placeholder="Client, gig reference or salary notes" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '15px',
                  borderRadius: 15,
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'var(--success)',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 16,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving transaction metrics...' : editingId ? 'Apply Target Modifications' : 'Post Income Asset'}
              </button>
            </form>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}