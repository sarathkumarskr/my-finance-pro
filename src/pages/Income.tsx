// Income.tsx - Full replacement with Edit support
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowUpRight,
  Plus,
  Search,
  X,
  Trash2,
  Calendar,
  Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type Transaction,
  type Country,
  type Currency,
  defaultIncomeCategories,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  listenTransactions,
  formatCurrency,
  getToday,
} from '../firestoreHelpers';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };

type PaymentMethod = {
  id: string;
  userId: string;
  type: 'credit' | 'debit' | 'tabby' | 'cash' | 'upi' | 'custom';
  name: string;
  bankName?: string;
  country: Country | 'Both';
  isCashDefault?: boolean;
  color?: string;
  createdAt?: any;
};

export default function Income({ user }: Props) {
  const [transactions, setTransactions]         = useState<Transaction[]>([]);
  const [savedMethods, setSavedMethods]         = useState<PaymentMethod[]>([]);
  const [showModal, setShowModal]               = useState(false);
  const [editingTx, setEditingTx]               = useState<Transaction | null>(null);
  const [filterCountry, setFilterCountry]       = useState<'all' | Country>('all');
  const [searchTerm, setSearchTerm]             = useState('');

  // form
  const [amount, setAmount]                     = useState('');
  const [category, setCategory]                 = useState('salary');
  const [country, setCountry]                   = useState<Country>('UAE');
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [note, setNote]                         = useState('');
  const [date, setDate]                         = useState(getToday());
  const [saving, setSaving]                     = useState(false);

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  // ── Listeners ──
  useEffect(() => {
    return listenTransactions(user.uid, 'income', setTransactions);
  }, [user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setSavedMethods(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id)
      );
    });
  }, [user.uid]);

  // ── Available methods by country ──
  const availableMethods = useMemo(() => {
    return savedMethods.filter(
      (m) => m.country === country || m.country === 'Both'
    );
  }, [savedMethods, country]);

  const selectedMethod = useMemo(() => {
    return availableMethods.find((m) => m.id === selectedMethodId) || null;
  }, [availableMethods, selectedMethodId]);

  // Auto-select first method (only when adding new)
  useEffect(() => {
    if (editingTx) return;
    if (availableMethods.length === 0) { setSelectedMethodId(''); return; }
    const exists = availableMethods.some((m) => m.id === selectedMethodId);
    if (!exists) setSelectedMethodId(availableMethods[0].id);
  }, [availableMethods, selectedMethodId, editingTx]);

  // ── Open Edit Modal ──
  const openEditModal = (tx: Transaction) => {
    setEditingTx(tx);
    setAmount(String(tx.amount));
    setCategory(tx.category);
    setCountry(tx.country);
    setSelectedMethodId(tx.paymentMethodId || '');
    setNote(tx.note || '');
    setDate(tx.date);
    setShowModal(true);
  };

  // ── Open Add Modal ──
  const openAddModal = () => {
    setEditingTx(null);
    setAmount('');
    setCategory('salary');
    setCountry('UAE');
    setNote('');
    setDate(getToday());
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTx(null);
    setAmount('');
    setCategory('salary');
    setNote('');
    setDate(getToday());
  };

  // ── Filters ──
  const filtered = transactions.filter((t) => {
    const matchCountry = filterCountry === 'all' || t.country === filterCountry;
    const matchSearch  =
      searchTerm === '' ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.paymentMethodName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCountry && matchSearch;
  });

  const totalAED = transactions
    .filter((t) => t.currency === 'AED')
    .reduce((s, t) => s + t.amount, 0);
  const totalINR = transactions
    .filter((t) => t.currency === 'INR')
    .reduce((s, t) => s + t.amount, 0);

  // ── Save (Add or Edit) ──
  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount'); return;
    }
    if (!selectedMethod && !editingTx) {
      toast.error('Select a payment method'); return;
    }
    setSaving(true);
    try {
      if (editingTx) {
        // ── EDIT MODE ──
        const updateData: Partial<Transaction> = {
          amount: parseFloat(amount),
          category,
          note: note || '',
          date,
          country,
          currency,
        };
        if (selectedMethod) {
          updateData.paymentMethodId   = selectedMethod.id;
          updateData.paymentMethod     = selectedMethod.type;
          updateData.paymentMethodName = selectedMethod.name;
          updateData.paymentMethodType = selectedMethod.type;
        }
        await updateTransaction(editingTx.id!, updateData);
        toast.success('Income updated!');
      } else {
        // ── ADD MODE ──
        await addTransaction({
          userId: user.uid,
          type: 'income',
          amount: parseFloat(amount),
          currency, country, category,
          paymentMethod: selectedMethod!.type,
          paymentMethodId: selectedMethod!.id,
          paymentMethodName: selectedMethod!.name,
          paymentMethodType: selectedMethod!.type,
          note: note || '',
          date,
        });
        toast.success('Income added!');
      }
      closeModal();
    } catch (err) {
      toast.error('Failed to save'); console.error(err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this income entry?')) return;
    try {
      await deleteTransaction(id);
      toast.success('Deleted!');
    } catch { toast.error('Failed to delete'); }
  };

  const getCategoryIcon = (catId: string) =>
    defaultIncomeCategories.find((c) => c.id === catId)?.icon || '💰';
  const getCategoryName = (catId: string) =>
    defaultIncomeCategories.find((c) => c.id === catId)?.name || catId;
  const getPaymentIcon  = (type: string) => {
    const icons: Record<string, string> = {
      cash: '💵', debit: '🏦', credit: '💳',
      tabby: '🛍️', upi: '📱', custom: '➕',
    };
    return icons[type] || '💳';
  };
  const getMethodDisplayName = (t: Transaction) => {
    if (t.paymentMethodName) return t.paymentMethodName;
    if (t.paymentMethodId) {
      const found = savedMethods.find((m) => m.id === t.paymentMethodId);
      if (found) return found.name;
    }
    return t.paymentMethodType || t.paymentMethod || '';
  };

  // ── Render ──
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Income</h1>
          <p className="page-subtitle">Track UAE and India income</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Income
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-income"><ArrowUpRight size={20} /></div>
            <span className="badge badge-success">UAE</span>
          </div>
          <div className="stat-label">UAE Income</div>
          <div className="stat-amount">{formatCurrency(totalAED, 'AED')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-income"><ArrowUpRight size={20} /></div>
            <span className="badge badge-success">India</span>
          </div>
          <div className="stat-label">India Income</div>
          <div className="stat-amount">{formatCurrency(totalINR, 'INR')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-saving"><Calendar size={20} /></div>
            <span className="badge badge-primary">Entries</span>
          </div>
          <div className="stat-label">Total Entries</div>
          <div className="stat-amount">{transactions.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={16} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--muted)',
            }} />
            <input
              type="text" placeholder="Search income..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 38px',
                borderRadius: 12, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'UAE', 'India'] as const).map((c) => (
              <button
                key={c}
                className={`btn ${filterCountry === c ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterCountry(c)}
                style={{ padding: '8px 14px', fontSize: 13 }}
              >
                {c === 'all' ? '🌍 All' : c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="card">
        <h3 className="section-title">Income Entries ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px', color: 'var(--muted)',
          }}>
            <ArrowUpRight size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No income entries yet</p>
            <p style={{ fontSize: 14, marginTop: 4 }}>Click "Add Income" to start</p>
          </div>
        ) : (
          <div className="transaction-list">
            {filtered.map((t) => (
              <div key={t.id} className="transaction-item">
                <div
                  className="transaction-icon"
                  style={{
                    background: 'rgba(16,185,129,0.12)',
                    color: 'var(--success)', fontSize: 18,
                  }}
                >
                  {getCategoryIcon(t.category)}
                </div>
                <div className="transaction-info">
                  <div className="transaction-name">
                    {getCategoryName(t.category)}
                  </div>
                  <div className="transaction-meta">
                    {t.country === 'UAE' ? '🇦🇪' : '🇮🇳'} {t.country}
                    {(t.paymentMethodName || t.paymentMethodType) && (
                      <>
                        {' · '}
                        {getPaymentIcon(
                          t.paymentMethodType || t.paymentMethod || ''
                        )}{' '}
                        {getMethodDisplayName(t)}
                      </>
                    )}
                    {' · '}{t.date}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>

                <div
                  className="transaction-amount"
                  style={{ color: 'var(--success)' }}
                >
                  + {formatCurrency(t.amount, t.currency)}
                </div>

                {/* ✅ Edit button */}
                <button
                  onClick={() => openEditModal(t)}
                  title="Edit"
                  style={{
                    padding: 8, borderRadius: 10, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: 'var(--muted)',
                  }}
                >
                  <Pencil size={15} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(t.id!)}
                  title="Delete"
                  style={{
                    padding: 8, borderRadius: 10, border: 'none',
                    background: 'transparent', cursor: 'pointer',
                    color: 'var(--muted)',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal (Add / Edit) ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'grid', placeItems: 'center',
            zIndex: 200, padding: 16,
          }}
          onClick={closeModal}
        >
          <div
            className="card"
            style={{
              width: '100%', maxWidth: 480,
              maxHeight: '90vh', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20,
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                  {editingTx ? '✏️ Edit Income' : 'Add Income'}
                </h2>
                {editingTx && (
                  <div style={{
                    fontSize: 12, color: 'var(--muted)', marginTop: 4,
                  }}>
                    Editing: {getCategoryName(editingTx.category)} ·{' '}
                    {formatCurrency(editingTx.amount, editingTx.currency)}
                  </div>
                )}
              </div>
              <button
                onClick={closeModal}
                style={{
                  padding: 8, borderRadius: 10, border: 'none',
                  background: 'var(--bg)', cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Country */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Country
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${country === 'UAE' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCountry('UAE')} style={{ flex: 1 }}
                >
                  🇦🇪 UAE (AED)
                </button>
                <button
                  className={`btn ${country === 'India' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCountry('India')} style={{ flex: 1 }}
                >
                  🇮🇳 India (INR)
                </button>
              </div>
            </div>

            {/* Amount */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Amount ({currency})
              </label>
              <input
                type="number" placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 18, fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Payment Method */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Received Into
              </label>
              {availableMethods.length === 0 ? (
                <div style={{
                  padding: 14, borderRadius: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 13, color: 'var(--danger)',
                }}>
                  No payment methods for {country}. Add one in Cards page.
                </div>
              ) : (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8,
                }}>
                  {availableMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 12,
                        border: `2px solid ${
                          selectedMethodId === method.id
                            ? 'var(--primary)' : 'var(--border)'
                        }`,
                        background: selectedMethodId === method.id
                          ? 'var(--primary-soft)' : 'var(--bg)',
                        color: 'var(--text)', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-start', gap: 4,
                        fontSize: 13, fontWeight: 600, textAlign: 'left',
                      }}
                    >
                      <div>
                        {getPaymentIcon(method.type)} {method.name}
                      </div>
                      {method.bankName && (
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {method.bankName}
                        </div>
                      )}
                      {method.isCashDefault && (
                        <div style={{ fontSize: 11, color: 'var(--success)' }}>
                          Default cash
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Category
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8,
              }}>
                {defaultIncomeCategories.map((cat) => (
                  <button
                    key={cat.id} onClick={() => setCategory(cat.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 12,
                      border: `2px solid ${
                        category === cat.id ? 'var(--primary)' : 'var(--border)'
                      }`,
                      background: category === cat.id
                        ? 'var(--primary-soft)' : 'var(--bg)',
                      color: 'var(--text)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <span>{cat.icon}</span>{cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Date
              </label>
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Note (Optional)
              </label>
              <input
                type="text" placeholder="e.g. March salary, bonus"
                value={note} onChange={(e) => setNote(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Save button */}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || (!selectedMethod && !editingTx)}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              {saving
                ? editingTx ? 'Updating...' : 'Saving...'
                : editingTx
                ? '✅ Update Income'
                : `Save Income (${currency})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}