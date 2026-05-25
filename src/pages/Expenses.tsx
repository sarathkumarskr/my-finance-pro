// Expenses.tsx - Full replacement with Edit support
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowDownRight,
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
  defaultExpenseCategories,
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
  creditLimit?: number;
  statementDate?: number;
  paymentDueDate?: number;
  currentBalance?: number;
  isTabbyPro?: boolean;
  tabbyStatementDate?: number;
  tabbyPaymentDueDate?: number;
  cashEnvelopeAmount?: number;
  isCashDefault?: boolean;
  color?: string;
  createdAt?: any;
};

const calculateTabbyEMIs = (
  amount: number,
  purchaseDate: string,
  statementDay = 24,
  paymentDay = 3
) => {
  const emiAmount = Math.ceil((amount / 4) * 100) / 100;
  const purchase  = new Date(purchaseDate);
  const emis      = [];
  for (let i = 0; i < 4; i++) {
    const dueDate =
      purchase.getDate() <= statementDay
        ? new Date(purchase.getFullYear(), purchase.getMonth() + i + 1, paymentDay)
        : new Date(purchase.getFullYear(), purchase.getMonth() + i + 2, paymentDay);
    emis.push({
      number: i + 1,
      amount: emiAmount,
      dueDate: dueDate.toISOString().split('T')[0],
      paid: false,
    });
  }
  return emis;
};

export default function Expenses({ user }: Props) {
  const [transactions, setTransactions]         = useState<Transaction[]>([]);
  const [savedMethods, setSavedMethods]         = useState<PaymentMethod[]>([]);
  const [showModal, setShowModal]               = useState(false);
  const [editingTx, setEditingTx]               = useState<Transaction | null>(null);
  const [filterCountry, setFilterCountry]       = useState<'all' | Country>('all');
  const [searchTerm, setSearchTerm]             = useState('');

  // form
  const [amount, setAmount]                     = useState('');
  const [category, setCategory]                 = useState('food');
  const [subCategory, setSubCategory]           = useState('');
  const [country, setCountry]                   = useState<Country>('UAE');
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [note, setNote]                         = useState('');
  const [date, setDate]                         = useState(getToday());
  const [saving, setSaving]                     = useState(false);
  const [tabbyEMIs, setTabbyEMIs]               = useState<any[]>([]);

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  // ── Listeners ──
  useEffect(() => {
    return listenTransactions(user.uid, 'expense', setTransactions);
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
    if (editingTx) return; // don't override when editing
    if (availableMethods.length === 0) { setSelectedMethodId(''); return; }
    const exists = availableMethods.some((m) => m.id === selectedMethodId);
    if (!exists) setSelectedMethodId(availableMethods[0].id);
  }, [availableMethods, selectedMethodId, editingTx]);

  // Tabby EMI preview
  useEffect(() => {
    if (
      selectedMethod?.type === 'tabby' &&
      selectedMethod.isTabbyPro &&
      amount && parseFloat(amount) > 0
    ) {
      setTabbyEMIs(calculateTabbyEMIs(
        parseFloat(amount), date,
        selectedMethod.tabbyStatementDate || 24,
        selectedMethod.tabbyPaymentDueDate || 3
      ));
    } else {
      setTabbyEMIs([]);
    }
  }, [selectedMethod, amount, date]);

  // ── Open Edit Modal ──
  const openEditModal = (tx: Transaction) => {
    setEditingTx(tx);
    setAmount(String(tx.amount));
    setCategory(tx.category);
    setSubCategory(tx.subCategory || '');
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
    setCategory('food');
    setSubCategory('');
    setCountry('UAE');
    setNote('');
    setDate(getToday());
    setTabbyEMIs([]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTx(null);
    setAmount('');
    setCategory('food');
    setSubCategory('');
    setNote('');
    setDate(getToday());
    setTabbyEMIs([]);
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
          subCategory: subCategory || '',
          note: note || '',
          date,
          country,
          currency,
        };
        // Update method if changed
        if (selectedMethod) {
          updateData.paymentMethodId   = selectedMethod.id;
          updateData.paymentMethod     = selectedMethod.type;
          updateData.paymentMethodName = selectedMethod.name;
          updateData.paymentMethodType = selectedMethod.type;
        }
        await updateTransaction(editingTx.id!, updateData);
        toast.success('Expense updated!');
      } else {
        // ── ADD MODE ──
        const data: any = {
          userId: user.uid,
          type: 'expense',
          amount: parseFloat(amount),
          currency, country, category,
          subCategory: subCategory || '',
          paymentMethod: selectedMethod!.type,
          paymentMethodId: selectedMethod!.id,
          paymentMethodName: selectedMethod!.name,
          paymentMethodType: selectedMethod!.type,
          note: note || '',
          date,
        };
        if (selectedMethod!.type === 'credit') {
          data.statementDateSnapshot  = selectedMethod!.statementDate  ?? null;
          data.paymentDueDateSnapshot = selectedMethod!.paymentDueDate ?? null;
        }
        if (selectedMethod!.type === 'tabby') {
          data.isTabby                = true;
          data.tabbyTotalAmount       = parseFloat(amount);
          data.statementDateSnapshot  = selectedMethod!.tabbyStatementDate  ?? null;
          data.paymentDueDateSnapshot = selectedMethod!.tabbyPaymentDueDate ?? null;
          data.isTabbyProSnapshot     = !!selectedMethod!.isTabbyPro;
          // ✅ FIXED: Pro = EMI split, Regular = no split
          if (selectedMethod!.isTabbyPro) data.tabbyEMIs = tabbyEMIs;
        }
        await addTransaction(data);
        if (selectedMethod!.type === 'tabby') {
          toast.success(
            selectedMethod!.isTabbyPro
              ? `Tabby Pro! 4 EMIs of AED ${(parseFloat(amount) / 4).toFixed(2)}`
              : 'Tabby purchase saved'
          );
        } else {
          toast.success('Expense added!');
        }
      }
      closeModal();
    } catch (err) {
      toast.error('Failed to save'); console.error(err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteTransaction(id);
      toast.success('Deleted!');
    } catch { toast.error('Failed to delete'); }
  };

  const getCategoryIcon = (catId: string) =>
    defaultExpenseCategories.find((c) => c.id === catId)?.icon || '💸';
  const getCategoryName = (catId: string) =>
    defaultExpenseCategories.find((c) => c.id === catId)?.name || catId;
  const getPaymentIcon  = (method: string) => {
    const icons: Record<string, string> = {
      cash: '💵', debit: '🏦', credit: '💳',
      tabby: '🛍️', upi: '📱', custom: '➕',
    };
    return icons[method] || '💳';
  };
  const getMethodDisplayName = (t: Transaction) => {
    if (t.paymentMethodName) return t.paymentMethodName;
    if (t.paymentMethodId) {
      const found = savedMethods.find((m) => m.id === t.paymentMethodId);
      if (found) return found.name;
    }
    return t.paymentMethodType || t.paymentMethod || 'Unknown';
  };

  // ── Render ──
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">
            Track UAE and India expenses with real payment methods
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-expense">
              <ArrowDownRight size={20} />
            </div>
            <span className="badge badge-danger">UAE</span>
          </div>
          <div className="stat-label">UAE Expenses</div>
          <div className="stat-amount">{formatCurrency(totalAED, 'AED')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-expense">
              <ArrowDownRight size={20} />
            </div>
            <span className="badge badge-danger">India</span>
          </div>
          <div className="stat-label">India Expenses</div>
          <div className="stat-amount">{formatCurrency(totalINR, 'INR')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt"><Calendar size={20} /></div>
            <span className="badge badge-warning">Total</span>
          </div>
          <div className="stat-label">Total Entries</div>
          <div className="stat-amount">{transactions.length}</div>
          <div className="stat-note">
            Tabby:{' '}
            {transactions.filter((t) => t.paymentMethodType === 'tabby').length}{' '}
            purchases
          </div>
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
              type="text" placeholder="Search expenses..."
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
        <h3 className="section-title">Expense Entries ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            color: 'var(--muted)',
          }}>
            <ArrowDownRight size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No expense entries yet</p>
            <p style={{ fontSize: 14, marginTop: 4 }}>
              Click "Add Expense" to start tracking
            </p>
          </div>
        ) : (
          <div className="transaction-list">
            {filtered.map((t) => (
              <div key={t.id} className="transaction-item">
                {/* Category icon */}
                <div
                  className="transaction-icon"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: 'var(--danger)', fontSize: 18,
                  }}
                >
                  {getCategoryIcon(t.category)}
                </div>

                {/* Info */}
                <div className="transaction-info">
                  <div className="transaction-name">
                    {getCategoryName(t.category)}
                    {t.subCategory && (
                      <span style={{
                        fontSize: 11, color: 'var(--muted)',
                        marginLeft: 6, fontWeight: 500,
                      }}>
                        · {t.subCategory}
                      </span>
                    )}
                    {t.paymentMethodType === 'tabby' && t.isTabbyProSnapshot && (
                      <span
                        className="badge badge-primary"
                        style={{ marginLeft: 8, fontSize: 10 }}
                      >
                        🛍️ Tabby Pro
                      </span>
                    )}
                    {t.paymentMethodType === 'tabby' && !t.isTabbyProSnapshot && (
                      <span
                        className="badge badge-warning"
                        style={{ marginLeft: 8, fontSize: 10 }}
                      >
                        🛍️ Tabby 4x
                      </span>
                    )}
                  </div>
                  <div className="transaction-meta">
                    {t.country === 'UAE' ? '🇦🇪' : '🇮🇳'} {t.country} ·{' '}
                    {getPaymentIcon(t.paymentMethodType || t.paymentMethod || 'cash')}{' '}
                    {getMethodDisplayName(t)} · {t.date}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>

                  {/* Tabby EMI breakdown */}
                  {t.paymentMethodType === 'tabby' &&
                    t.tabbyEMIs && t.tabbyEMIs.length > 0 && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px',
                      background: 'rgba(245,158,11,0.08)',
                      borderRadius: 10,
                      display: 'flex', gap: 12, flexWrap: 'wrap',
                    }}>
                      {(t.tabbyEMIs as any[]).map((emi) => (
                        <div
                          key={emi.number}
                          style={{ fontSize: 11, color: 'var(--muted)' }}
                        >
                          <strong>EMI {emi.number}:</strong>{' '}
                          AED {emi.amount} · {emi.dueDate}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div
                  className="transaction-amount"
                  style={{ color: 'var(--danger)' }}
                >
                  - {formatCurrency(t.amount, t.currency)}
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
              width: '100%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20,
            }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                  {editingTx ? '✏️ Edit Expense' : 'Add Expense'}
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
                Payment Method
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
                        {method.type === 'cash'   ? '💵'
                         : method.type === 'credit' ? '💳'
                         : method.type === 'debit'  ? '🏦'
                         : method.type === 'tabby'  ? '🛍️'
                         : method.type === 'upi'    ? '📱' : '➕'}{' '}
                        {method.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {method.type === 'credit' &&
                          `Statement ${method.statementDate} · Due ${method.paymentDueDate}`}
                        {method.type === 'tabby' &&
                          `${method.isTabbyPro ? '⚡ Pro 4x EMI' : 'Regular'} · Due ${method.tabbyPaymentDueDate}`}
                        {method.type === 'cash' &&
                          (method.isCashDefault
                            ? 'Default cash'
                            : `Envelope ${currency} ${method.cashEnvelopeAmount || 0}`)}
                        {method.type === 'debit' && (method.bankName || 'Debit card')}
                        {method.type === 'upi'   && 'UPI'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tabby preview — only for new expenses */}
            {!editingTx && selectedMethod?.type === 'tabby' && (
              <div style={{
                marginBottom: 16, padding: 14,
                background: 'rgba(245,158,11,0.08)',
                borderRadius: 14,
                border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: 'var(--warning)', marginBottom: 8,
                }}>
                  🛍️ {selectedMethod.name}
                </div>
                {/* ✅ FIXED: Pro = EMI, Regular = no split */}
                {selectedMethod.isTabbyPro ? (
                  <>
                    <div style={{
                      fontSize: 12, color: 'var(--primary)',
                      fontWeight: 700, marginBottom: 8,
                    }}>
                      ⚡ Tabby Pro — auto 4-month EMI split
                    </div>
                    {tabbyEMIs.map((emi) => (
                      <div key={emi.number} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '6px 0',
                        borderTop: '1px solid rgba(245,158,11,0.15)',
                        fontSize: 13,
                      }}>
                        <span style={{ color: 'var(--muted)' }}>
                          EMI {emi.number} · Due {emi.dueDate}
                        </span>
                        <strong>AED {emi.amount.toFixed(2)}</strong>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{
                    fontSize: 12, color: 'var(--muted)', fontWeight: 600,
                  }}>
                    💳 Regular Tabby — full amount due next billing cycle
                  </div>
                )}
              </div>
            )}

            {/* Category */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Category
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2,1fr)',
                gap: 8, maxHeight: 220, overflowY: 'auto',
              }}>
                {defaultExpenseCategories.map((cat) => (
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

            {/* Sub category */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Sub Category (Optional)
              </label>
              <input
                type="text" placeholder="e.g. Breakfast, Petrol"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
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
                type="text" placeholder="e.g. Grocery shopping"
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
                ? '✅ Update Expense'
                : selectedMethod?.type === 'tabby'
                  ? selectedMethod.isTabbyPro
                    ? `Save Tabby Pro (4 × AED ${amount ? (parseFloat(amount) / 4).toFixed(2) : '0.00'})`
                    : 'Save Tabby Purchase'
                  : `Save Expense (${currency})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}