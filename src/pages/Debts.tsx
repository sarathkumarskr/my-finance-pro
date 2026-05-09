import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  HandCoins,
  Plus,
  X,
  Trash2,
  Pencil,
  Calendar,
  AlertTriangle,
  Wallet,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };

type Country = 'UAE' | 'India';
type Currency = 'AED' | 'INR';
type DebtType =
  | 'loan'
  | 'credit-card'
  | 'personal'
  | 'emi'
  | 'tabby'
  | 'other';

type Debt = {
  id?: string;
  userId: string;
  name: string;
  lender: string;
  country: Country;
  currency: Currency;
  debtType: DebtType;
  totalAmount: number;
  paidAmount: number;
  interestRate?: number;
  monthlyPayment?: number;
  dueDate?: string;
  note?: string;
  createdAt?: any;
};

type DebtPayment = {
  id?: string;
  userId: string;
  debtId: string;
  debtName: string;
  amount: number;
  currency: Currency;
  paymentDate: string;
  note?: string;
  createdAt?: any;
};

const debtTypeOptions: { id: DebtType; label: string; icon: string }[] = [
  { id: 'loan', label: 'Loan', icon: '🏦' },
  { id: 'credit-card', label: 'Credit Card Due', icon: '💳' },
  { id: 'personal', label: 'Personal Debt', icon: '🤝' },
  { id: 'emi', label: 'EMI', icon: '📆' },
  { id: 'tabby', label: 'Tabby Due', icon: '🛍️' },
  { id: 'other', label: 'Other', icon: '➕' },
];

const formatCurrency = (amount: number, currency: Currency) =>
  currency === 'AED'
    ? `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const getToday = () => new Date().toISOString().split('T')[0];

export default function Debts({ user }: Props) {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [saving, setSaving] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getToday());
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  // form state
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [country, setCountry] = useState<Country>('India');
  const [debtType, setDebtType] = useState<DebtType>('loan');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  useEffect(() => {
    const q = query(collection(db, 'debts'), where('userId', '==', user.uid));

    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Debt[];

      list.sort((a, b) => {
        const aSec = a.createdAt?.seconds || 0;
        const bSec = b.createdAt?.seconds || 0;
        return bSec - aSec;
      });

      setDebts(list);
    });
  }, [user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'debtPayments'),
      where('userId', '==', user.uid)
    );

    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DebtPayment[];

      list.sort((a, b) => {
        const aSec = a.createdAt?.seconds || 0;
        const bSec = b.createdAt?.seconds || 0;
        return bSec - aSec;
      });

      setPayments(list);
    });
  }, [user.uid]);

  const resetForm = () => {
    setName('');
    setLender('');
    setCountry('India');
    setDebtType('loan');
    setTotalAmount('');
    setPaidAmount('');
    setInterestRate('');
    setMonthlyPayment('');
    setDueDate('');
    setNote('');
    setEditingDebt(null);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (debt: Debt) => {
    setEditingDebt(debt);
    setName(debt.name);
    setLender(debt.lender || '');
    setCountry(debt.country);
    setDebtType(debt.debtType);
    setTotalAmount(String(debt.totalAmount));
    setPaidAmount(String(debt.paidAmount));
    setInterestRate(
      debt.interestRate !== undefined ? String(debt.interestRate) : ''
    );
    setMonthlyPayment(
      debt.monthlyPayment !== undefined ? String(debt.monthlyPayment) : ''
    );
    setDueDate(debt.dueDate || '');
    setNote(debt.note || '');
    setShowModal(true);
  };

  const openPayment = (debt: Debt) => {
    setSelectedDebt(debt);
    setPaymentAmount('');
    setPaymentDate(getToday());
    setPaymentNote('');
    setShowPaymentModal(true);
  };

  const getRemaining = (debt: Debt) =>
    Math.max(debt.totalAmount - debt.paidAmount, 0);

  const getProgress = (debt: Debt) => {
    if (!debt.totalAmount) return 0;
    return Math.min((debt.paidAmount / debt.totalAmount) * 100, 100);
  };

  const getDebtStatus = (debt: Debt) => {
    const remaining = getRemaining(debt);

    if (remaining <= 0) {
      return { label: 'Paid Off', color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' };
    }

    if (debt.dueDate) {
      const today = new Date();
      const due = new Date(debt.dueDate);
      const diff = Math.ceil(
        (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diff < 0) {
        return { label: 'Overdue', color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' };
      }

      if (diff <= 7) {
        return { label: 'Due Soon', color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' };
      }
    }

    return { label: 'Active', color: 'var(--primary)', bg: 'rgba(99,102,241,0.12)' };
  };

  const getPaymentsForDebt = (debtId: string) =>
    payments.filter((p) => p.debtId === debtId);

  const totalRemainingAED = debts
    .filter((d) => d.currency === 'AED')
    .reduce((sum, d) => sum + getRemaining(d), 0);

  const totalRemainingINR = debts
    .filter((d) => d.currency === 'INR')
    .reduce((sum, d) => sum + getRemaining(d), 0);

  const activeDebts = debts.filter((d) => getRemaining(d) > 0).length;

  const dueSoonCount = debts.filter((d) => {
    if (!d.dueDate || getRemaining(d) <= 0) return false;

    const today = new Date();
    const due = new Date(d.dueDate);
    const diff = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    return diff >= 0 && diff <= 7;
  }).length;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Enter debt name');
      return;
    }

    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      toast.error('Enter valid total amount');
      return;
    }

    if (!paidAmount || parseFloat(paidAmount) < 0) {
      toast.error('Enter valid paid amount');
      return;
    }

    if (parseFloat(paidAmount) > parseFloat(totalAmount)) {
      toast.error('Paid amount cannot exceed total amount');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        name: name.trim(),
        lender: lender.trim() || '',
        country,
        currency,
        debtType,
        totalAmount: parseFloat(totalAmount),
        paidAmount: parseFloat(paidAmount),
        interestRate: interestRate ? parseFloat(interestRate) : 0,
        monthlyPayment: monthlyPayment ? parseFloat(monthlyPayment) : 0,
        dueDate: dueDate || '',
        note: note.trim() || '',
      };

      if (editingDebt?.id) {
        await updateDoc(doc(db, 'debts', editingDebt.id), data);
        toast.success('Debt updated!');
      } else {
        await addDoc(collection(db, 'debts'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success('Debt added!');
      }

      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save');
    }

    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this debt?')) return;

    try {
      await deleteDoc(doc(db, 'debts', id));
      toast.success('Deleted!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete');
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedDebt) return;

    const amount = parseFloat(paymentAmount);

    if (!paymentAmount || amount <= 0) {
      toast.error('Enter valid payment amount');
      return;
    }

    const remaining = getRemaining(selectedDebt);

    if (amount > remaining) {
      toast.error('Payment cannot exceed remaining amount');
      return;
    }

    setPaymentSaving(true);

    try {
      await updateDoc(doc(db, 'debts', selectedDebt.id!), {
        paidAmount: selectedDebt.paidAmount + amount,
      });

      await addDoc(collection(db, 'debtPayments'), {
        userId: user.uid,
        debtId: selectedDebt.id,
        debtName: selectedDebt.name,
        amount,
        currency: selectedDebt.currency,
        paymentDate,
        note: paymentNote.trim() || '',
        createdAt: serverTimestamp(),
      });

      toast.success('Payment recorded!');
      setShowPaymentModal(false);
      setSelectedDebt(null);
      setPaymentAmount('');
      setPaymentDate(getToday());
      setPaymentNote('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to record payment');
    }

    setPaymentSaving(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Debt Tracker</h1>
          <p className="page-subtitle">
            Track loans, EMIs, credit card dues and personal debts
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} />
            Add Debt
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt">
              <HandCoins size={20} />
            </div>
            <span className="badge badge-warning">UAE</span>
          </div>
          <div className="stat-label">Remaining Debt (UAE)</div>
          <div className="stat-amount">{formatCurrency(totalRemainingAED, 'AED')}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt">
              <HandCoins size={20} />
            </div>
            <span className="badge badge-warning">India</span>
          </div>
          <div className="stat-label">Remaining Debt (India)</div>
          <div className="stat-amount">{formatCurrency(totalRemainingINR, 'INR')}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-expense">
              <Wallet size={20} />
            </div>
            <span className="badge badge-danger">Active</span>
          </div>
          <div className="stat-label">Active Debts</div>
          <div className="stat-amount">{activeDebts}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt">
              <AlertTriangle size={20} />
            </div>
            <span className="badge badge-warning">Due Soon</span>
          </div>
          <div className="stat-label">Next 7 Days</div>
          <div className="stat-amount">{dueSoonCount}</div>
        </div>
      </div>

      {/* Debt list */}
      {debts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <HandCoins size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>No debts added yet</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Add your home loan, car EMI, credit card dues or personal debts
          </p>
        </div>
      ) : (
        <div className="grid grid-2">
          {debts.map((debt) => {
            const remaining = getRemaining(debt);
            const progress = getProgress(debt);
            const status = getDebtStatus(debt);
            const history = getPaymentsForDebt(debt.id!);

            return (
              <div key={debt.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {debt.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 4,
                      }}
                    >
                      {debt.country === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
                      {debt.lender ? ` · ${debt.lender}` : ''}
                      {debt.dueDate ? ` · Due ${debt.dueDate}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        background: status.bg,
                        color: status.color,
                      }}
                    >
                      {status.label}
                    </span>

                    <button
                      onClick={() => openPayment(debt)}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                      }}
                      title="Record Payment"
                    >
                      💸
                    </button>

                    <button
                      onClick={() => openEdit(debt)}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                      }}
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      onClick={() => handleDelete(debt.id!)}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                      }}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      onClick={() =>
                        setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id!)
                      }
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                      }}
                      title="Show Payment History"
                    >
                      {expandedDebtId === debt.id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="country-row">
                  <span>Type</span>
                  <strong>
                    {debtTypeOptions.find((d) => d.id === debt.debtType)?.icon}{' '}
                    {debtTypeOptions.find((d) => d.id === debt.debtType)?.label}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Total Amount</span>
                  <strong>{formatCurrency(debt.totalAmount, debt.currency)}</strong>
                </div>

                <div className="country-row">
                  <span>Paid</span>
                  <strong style={{ color: 'var(--success)' }}>
                    {formatCurrency(debt.paidAmount, debt.currency)}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Remaining</span>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatCurrency(remaining, debt.currency)}
                  </strong>
                </div>

                {!!debt.monthlyPayment && debt.monthlyPayment > 0 && (
                  <div className="country-row">
                    <span>Monthly Payment</span>
                    <strong style={{ color: 'var(--primary)' }}>
                      {formatCurrency(debt.monthlyPayment, debt.currency)}
                    </strong>
                  </div>
                )}

                {!!debt.interestRate && debt.interestRate > 0 && (
                  <div className="country-row">
                    <span>Interest Rate</span>
                    <strong>{debt.interestRate}%</strong>
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>Repayment Progress</span>
                    <strong>{progress.toFixed(1)}%</strong>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      background: 'var(--border)',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: '100%',
                        background:
                          progress >= 100
                            ? 'var(--success)'
                            : 'linear-gradient(90deg, #ef4444, #f59e0b)',
                        borderRadius: 999,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {debt.note && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: 12,
                      background: 'var(--bg)',
                      fontSize: 13,
                      color: 'var(--muted)',
                    }}
                  >
                    {debt.note}
                  </div>
                )}

                {/* Payment history */}
                {expandedDebtId === debt.id && (
                  <div
                    style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Clock3 size={16} />
                      Payment History
                    </div>

                    {history.length === 0 ? (
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--muted)',
                          padding: '10px 0',
                        }}
                      >
                        No payments recorded yet
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {history.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              background: 'var(--bg)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>
                                {formatCurrency(p.amount, p.currency)}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--muted)',
                                  marginTop: 2,
                                }}
                              >
                                {p.paymentDate}
                                {p.note ? ` · ${p.note}` : ''}
                              </div>
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--success)',
                                fontWeight: 700,
                              }}
                            >
                              <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                              Logged
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
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
              maxWidth: 540,
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
                {editingDebt ? 'Edit Debt' : 'Add Debt'}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Debt Name
              </label>
              <input
                type="text"
                placeholder="e.g. Home Loan, Credit Card Due, Bike EMI"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Lender / Bank / Person
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC Bank, Friend, ENBD"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Debt Type
              </label>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                }}
              >
                {debtTypeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDebtType(opt.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `2px solid ${
                        debtType === opt.id ? 'var(--primary)' : 'var(--border)'
                      }`,
                      background:
                        debtType === opt.id ? 'var(--primary-soft)' : 'var(--bg)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                  Total Amount ({currency})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500000"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
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

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                  Already Paid ({currency})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 120000"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
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
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                  Interest Rate % (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 8.5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
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

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                  Monthly Payment (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
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
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Due Date (Optional)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Must clear before December"
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
              disabled={saving}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              {saving
                ? editingDebt
                  ? 'Updating...'
                  : 'Saving...'
                : editingDebt
                ? 'Update Debt'
                : 'Save Debt'}
            </button>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedDebt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 220,
            padding: 16,
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Record Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
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

            <div style={{ marginBottom: 12, fontSize: 14, color: 'var(--muted)' }}>
              {selectedDebt.name}
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                background: 'var(--bg)',
                fontSize: 13,
              }}
            >
              Remaining:{' '}
              <strong style={{ color: 'var(--danger)' }}>
                {formatCurrency(getRemaining(selectedDebt), selectedDebt.currency)}
              </strong>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Payment Amount ({selectedDebt.currency})
              </label>
              <input
                type="number"
                placeholder="e.g. 5000"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. April EMI payment"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
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
              onClick={handleRecordPayment}
              disabled={paymentSaving}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              {paymentSaving ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}