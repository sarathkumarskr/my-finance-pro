import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowDownRight,
  Plus,
  Search,
  X,
  Trash2,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type Transaction,
  type Country,
  type Currency,
  defaultExpenseCategories,
  addTransaction,
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
  id?: string;
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
  color?: string;
  createdAt?: any;
};

const calculateTabbyEMIs = (
  amount: number,
  purchaseDate: string,
  statementDay: number = 24,
  paymentDay: number = 3
) => {
  const emiAmount = Math.ceil((amount / 4) * 100) / 100;
  const purchase = new Date(purchaseDate);
  const emis = [];

  for (let i = 0; i < 4; i++) {
    let dueDate: Date;

    if (purchase.getDate() <= statementDay) {
      dueDate = new Date(
        purchase.getFullYear(),
        purchase.getMonth() + i + 1,
        paymentDay
      );
    } else {
      dueDate = new Date(
        purchase.getFullYear(),
        purchase.getMonth() + i + 2,
        paymentDay
      );
    }

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [savedMethods, setSavedMethods] = useState<PaymentMethod[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filterCountry, setFilterCountry] = useState<'all' | Country>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [subCategory, setSubCategory] = useState('');
  const [country, setCountry] = useState<Country>('UAE');
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(getToday());
  const [saving, setSaving] = useState(false);

  const [tabbyEMIs, setTabbyEMIs] = useState<any[]>([]);

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  // listen expenses
  useEffect(() => {
    const unsubscribe = listenTransactions(user.uid, 'expense', (data) => {
      setTransactions(data);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // listen payment methods
  useEffect(() => {
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snap) => {
      setSavedMethods(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PaymentMethod[]
      );
    });
  }, [user.uid]);

  const availableMethods = useMemo(() => {
    return savedMethods.filter(
      (m) => m.country === country || m.country === 'Both'
    );
  }, [savedMethods, country]);

  const selectedMethod = useMemo(() => {
    return availableMethods.find((m) => m.id === selectedMethodId) || null;
  }, [availableMethods, selectedMethodId]);

  // auto select first method when country changes
  useEffect(() => {
    if (availableMethods.length === 0) {
      setSelectedMethodId('');
      return;
    }

    const exists = availableMethods.some((m) => m.id === selectedMethodId);
    if (!exists) {
      setSelectedMethodId(availableMethods[0].id || '');
    }
  }, [availableMethods, selectedMethodId]);

  // tabby preview uses actual selected card settings
  useEffect(() => {
    if (
      selectedMethod?.type === 'tabby' &&
      !selectedMethod.isTabbyPro &&
      amount &&
      parseFloat(amount) > 0
    ) {
      const emis = calculateTabbyEMIs(
        parseFloat(amount),
        date,
        selectedMethod.tabbyStatementDate || 24,
        selectedMethod.tabbyPaymentDueDate || 3
      );
      setTabbyEMIs(emis);
    } else {
      setTabbyEMIs([]);
    }
  }, [selectedMethod, amount, date]);

  const filtered = transactions.filter((t) => {
    const matchCountry =
      filterCountry === 'all' || t.country === filterCountry;

    const matchSearch =
      searchTerm === '' ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.paymentMethodName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.paymentMethod?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchCountry && matchSearch;
  });

  const totalAED = transactions
    .filter((t) => t.currency === 'AED')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalINR = transactions
    .filter((t) => t.currency === 'INR')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    if (!selectedMethod) {
      toast.error('Select a payment method');
      return;
    }

    setSaving(true);
    try {
      const transactionData: any = {
        userId: user.uid,
        type: 'expense',
        amount: parseFloat(amount),
        currency,
        country,
        category,
        subCategory: subCategory || '',
      
        paymentMethod: selectedMethod.type,
        paymentMethodId: selectedMethod.id || null,
        paymentMethodName: selectedMethod.name || selectedMethod.type,
        paymentMethodType: selectedMethod.type,
      
        note: note || '',
        date,
      };
      
      // credit snapshot
      if (selectedMethod.type === 'credit') {
        transactionData.statementDateSnapshot = selectedMethod.statementDate ?? null;
        transactionData.paymentDueDateSnapshot = selectedMethod.paymentDueDate ?? null;
      }
      
      // tabby snapshot
      if (selectedMethod.type === 'tabby') {
        transactionData.isTabby = true;
        transactionData.tabbyTotalAmount = parseFloat(amount);
        transactionData.statementDateSnapshot =
          selectedMethod.tabbyStatementDate ?? null;
        transactionData.paymentDueDateSnapshot =
          selectedMethod.tabbyPaymentDueDate ?? null;
        transactionData.isTabbyProSnapshot = !!selectedMethod.isTabbyPro;
      
        if (!selectedMethod.isTabbyPro) {
          transactionData.tabbyEMIs = tabbyEMIs;
        }
      }

      if (selectedMethod.type === 'tabby') {
        transactionData.isTabby = true;
        transactionData.tabbyTotalAmount = parseFloat(amount);

        if (!selectedMethod.isTabbyPro) {
          transactionData.tabbyEMIs = tabbyEMIs;
        }
      }

      await addTransaction(transactionData);

      if (selectedMethod.type === 'tabby') {
        toast.success(
          selectedMethod.isTabbyPro
            ? 'Tabby purchase saved (Pro - no EMI split)'
            : `Tabby purchase saved! 4 EMIs of AED ${(parseFloat(amount) / 4).toFixed(2)}`
        );
      } else {
        toast.success('Expense added!');
      }

      setShowModal(false);
      setAmount('');
      setCategory('food');
      setSubCategory('');
      setNote('');
      setDate(getToday());
      setTabbyEMIs([]);
    } catch (error) {
      toast.error('Failed to save');
      console.error(error);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this expense?')) {
      try {
        await deleteTransaction(id);
        toast.success('Deleted!');
      } catch {
        toast.error('Failed to delete');
      }
    }
  };

  const getCategoryIcon = (catId: string) =>
    defaultExpenseCategories.find((c) => c.id === catId)?.icon || '💸';

  const getCategoryName = (catId: string) =>
    defaultExpenseCategories.find((c) => c.id === catId)?.name || catId;

  const getPaymentIcon = (method: string) => {
    const icons: Record<string, string> = {
      cash: '💵',
      debit: '🏦',
      credit: '💳',
      tabby: '🛍️',
      upi: '📱',
      custom: '➕',
    };
    return icons[method] || '💳';
  };

  const getMethodDisplayName = (t: Transaction) => {
    if (t.paymentMethodName) return t.paymentMethodName;

    if (t.paymentMethodId) {
      const exact = savedMethods.find((m) => m.id === t.paymentMethodId);
      if (exact) return exact.name;
    }

    const methodType = t.paymentMethodType || t.paymentMethod;
    const sameType = savedMethods.filter((m) => m.type === methodType);
    if (sameType.length === 1) return sameType[0].name;

    return methodType || 'Unknown';
  };

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
          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} />
            Add Expense
          </button>
        </div>
      </div>

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
            <div className="stat-icon icon-debt">
              <Calendar size={20} />
            </div>
            <span className="badge badge-warning">Total</span>
          </div>
          <div className="stat-label">Total Entries</div>
          <div className="stat-amount">{transactions.length}</div>
          <div className="stat-note">
            Tabby:{' '}
            {
              transactions.filter((t) => t.paymentMethodType === 'tabby').length
            }{' '}
            purchases
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
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

      <div className="card">
        <h3 className="section-title">Expense Entries ({filtered.length})</h3>

        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--muted)',
            }}
          >
            <ArrowDownRight
              size={40}
              style={{ marginBottom: 12, opacity: 0.5 }}
            />
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              No expense entries yet
            </p>
            <p style={{ fontSize: 14, marginTop: 4 }}>
              Click "Add Expense" to start tracking
            </p>
          </div>
        ) : (
          <div className="transaction-list">
            {filtered.map((t) => (
              <div key={t.id} className="transaction-item">
                <div
                  className="transaction-icon"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: 'var(--danger)',
                    fontSize: 18,
                  }}
                >
                  {getCategoryIcon(t.category)}
                </div>

                <div className="transaction-info">
                  <div className="transaction-name">
                    {getCategoryName(t.category)}
                    {t.paymentMethodType === 'tabby' &&
                      !t.isTabbyProSnapshot && (
                        <span
                          className="badge badge-warning"
                          style={{ marginLeft: 8, fontSize: 10 }}
                        >
                          🛍️ Tabby 4x
                        </span>
                      )}
                    {t.paymentMethodType === 'tabby' &&
                      t.isTabbyProSnapshot && (
                        <span
                          className="badge badge-primary"
                          style={{ marginLeft: 8, fontSize: 10 }}
                        >
                          🛍️ Tabby Pro
                        </span>
                      )}
                  </div>

                  <div className="transaction-meta">
                    {t.country === 'UAE' ? '🇦🇪' : '🇮🇳'} {t.country} ·{' '}
                    {getPaymentIcon(
                      t.paymentMethodType || t.paymentMethod || 'cash'
                    )}{' '}
                    {getMethodDisplayName(t)} · {t.date}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>

                  {t.paymentMethodType === 'tabby' &&
                    t.tabbyEMIs &&
                    t.tabbyEMIs.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          background: 'rgba(245,158,11,0.08)',
                          borderRadius: 10,
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        {t.tabbyEMIs.map((emi) => (
                          <div
                            key={emi.number}
                            style={{ fontSize: 11, color: 'var(--muted)' }}
                          >
                            <strong>EMI {emi.number}:</strong> AED {emi.amount} ·{' '}
                            {emi.dueDate}
                          </div>
                        ))}
                      </div>
                    )}

                  {t.paymentMethodType === 'credit' && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: 'var(--muted)',
                      }}
                    >
                      Statement: {t.statementDateSnapshot || '-'} · Due:{' '}
                      {t.paymentDueDateSnapshot || '-'}
                    </div>
                  )}
                </div>

                <div
                  className="transaction-amount"
                  style={{ color: 'var(--danger)' }}
                >
                  - {formatCurrency(t.amount, t.currency)}
                </div>

                <button
                  onClick={() => handleDelete(t.id!)}
                  style={{
                    padding: 8,
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 200,
            padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>
                Add Expense
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--bg)',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Country
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${country === 'UAE' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCountry('UAE')}
                  style={{ flex: 1 }}
                >
                  🇦🇪 UAE (AED)
                </button>
                <button
                  className={`btn ${country === 'India' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCountry('India')}
                  style={{ flex: 1 }}
                >
                  🇮🇳 India (INR)
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Amount ({currency})
              </label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Payment Method
              </label>

              {availableMethods.length === 0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    fontSize: 13,
                    color: 'var(--danger)',
                  }}
                >
                  No payment methods available for {country}. Please add one in
                  the Cards page first.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8,
                  }}
                >
                  {availableMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id || '')}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `2px solid ${
                          selectedMethodId === method.id
                            ? 'var(--primary)'
                            : 'var(--border)'
                        }`,
                        background:
                          selectedMethodId === method.id
                            ? 'var(--primary-soft)'
                            : 'var(--bg)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 4,
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                      }}
                    >
                      <div>
                        {getPaymentIcon(method.type)} {method.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {method.type === 'credit' &&
                          `Statement ${method.statementDate} · Due ${method.paymentDueDate}`}
                        {method.type === 'tabby' &&
                          `Statement ${method.tabbyStatementDate} · Due ${method.tabbyPaymentDueDate} · ${
                            method.isTabbyPro ? 'Pro' : '4 EMI'
                          }`}
                        {method.type === 'cash' &&
                          `Envelope ${country === 'India' ? '₹' : 'AED'} ${method.cashEnvelopeAmount || 0}`}
                        {method.type === 'debit' &&
                          `Balance ${country === 'India' ? '₹' : 'AED'} ${method.currentBalance || 0}`}
                        {method.type === 'upi' && 'UPI method'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedMethod?.type === 'tabby' && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 14,
                  background: 'rgba(245,158,11,0.08)',
                  borderRadius: 14,
                  border: '1px solid rgba(245,158,11,0.2)',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--warning)',
                    marginBottom: 8,
                  }}
                >
                  🛍️ {selectedMethod.name}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--muted)',
                    marginBottom: 8,
                  }}
                >
                  Statement date: {selectedMethod.tabbyStatementDate}th · Due
                  date: {selectedMethod.tabbyPaymentDueDate}th
                </div>

                {selectedMethod.isTabbyPro ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--success)',
                      fontWeight: 700,
                    }}
                  >
                    Tabby Pro enabled → No automatic 4-EMI split
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--warning)',
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      Tabby Pro disabled → Auto 4-EMI split
                    </div>

                    {tabbyEMIs.map((emi) => (
                      <div
                        key={emi.number}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderTop: '1px solid rgba(245,158,11,0.15)',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: 'var(--muted)' }}>
                          EMI {emi.number} · Due {emi.dueDate}
                        </span>
                        <strong>AED {emi.amount.toFixed(2)}</strong>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Category
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                  maxHeight: 220,
                  overflowY: 'auto',
                }}
              >
                {defaultExpenseCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `2px solid ${
                        category === cat.id ? 'var(--primary)' : 'var(--border)'
                      }`,
                      background:
                        category === cat.id
                          ? 'var(--primary-soft)'
                          : 'var(--bg)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span>{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Sub Category (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Breakfast, Petrol, Medicine"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Grocery shopping, Netflix"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !selectedMethod}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              {saving
                ? 'Saving...'
                : selectedMethod?.type === 'tabby'
                ? selectedMethod.isTabbyPro
                  ? 'Save Tabby Purchase (Pro)'
                  : `Save Tabby Purchase (4 × AED ${
                      amount ? (parseFloat(amount) / 4).toFixed(2) : '0.00'
                    })`
                : `Save Expense (${currency})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}