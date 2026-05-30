import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CreditCard,
  Plus,
  X,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Pencil,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };

type CardType = 'credit' | 'debit' | 'tabby' | 'cash' | 'upi' | 'custom';
type Country = 'UAE' | 'India' | 'Both';

type PaymentMethod = {
  id?: string;
  userId: string;
  type: CardType;
  name: string;
  bankName?: string;
  country: Country;
  creditLimit?: number;
  statementDate?: number;
  paymentDueDate?: number;
  currentBalance?: number;
  isTabbyPro?: boolean;
  tabbyStatementDate?: number;
  tabbyPaymentDueDate?: number;
  cashEnvelopeAmount?: number;
  cashSpent?: number;
  color?: string;
  isCashDefault?: boolean;
  createdAt?: any;
};

type TabbyEMI = {
  id?: string;
  userId: string;
  paymentMethodId: string;
  itemName: string;
  totalAmount: number;
  purchaseDate: string;
  emis: {
    number: number;
    amount: number;
    dueDate: string;
    paid: boolean;
  }[];
  createdAt?: any;
};

type OpeningBalance = {
  id?: string;
  userId: string;
  uaeCash: number;
  indiaCash: number;
  perMethod: Record<string, number>;
  asOf: string;
};

type Transaction = {
  id: string;
  userId: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  paymentMethodId: string | null;
  date: string;
};

const cardColors = [
  '#6366f1', '#8b5cf6', '#ec4899', '#10b981',
  '#f59e0b', '#0ea5e9', '#ef4444', '#14b8a6',
];

const cardTypeConfig: Record<CardType, { label: string; icon: string }> = {
  credit: { label: 'Credit Card',   icon: '💳' },
  debit:  { label: 'Debit Card',    icon: '🏦' },
  tabby:  { label: 'Tabby Card',    icon: '🛍️' },
  cash:   { label: 'Cash Envelope', icon: '💵' },
  upi:    { label: 'UPI',           icon: '📱' },
  custom: { label: 'Custom',        icon: '➕' },
};

// ✅ FIXED: Self-healing — deletes duplicates, creates missing
async function ensureDefaultCashAccounts(userId: string) {
  const q = query(
    collection(db, 'paymentMethods'),
    where('userId', '==', userId),
    where('isCashDefault', '==', true)
  );
  const snap = await getDocs(q);

  const existing = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  } as PaymentMethod));

  const uaeDocs   = existing.filter((m) => m.country === 'UAE');
  const indiaDocs = existing.filter((m) => m.country === 'India');

  // ✅ Delete UAE duplicates — keep only first
  if (uaeDocs.length > 1) {
    for (let i = 1; i < uaeDocs.length; i++) {
      await deleteDoc(doc(db, 'paymentMethods', uaeDocs[i].id!));
    }
  }

  // ✅ Delete India duplicates — keep only first
  if (indiaDocs.length > 1) {
    for (let i = 1; i < indiaDocs.length; i++) {
      await deleteDoc(doc(db, 'paymentMethods', indiaDocs[i].id!));
    }
  }

  // ✅ Create UAE cash if none exists
  if (uaeDocs.length === 0) {
    await addDoc(collection(db, 'paymentMethods'), {
      userId,
      type: 'cash',
      name: 'Cash',
      bankName: '',
      country: 'UAE',
      color: '#10b981',
      isCashDefault: true,
      cashEnvelopeAmount: 0,
      cashSpent: 0,
      createdAt: serverTimestamp(),
    });
  }

  // ✅ Create India cash if none exists
  if (indiaDocs.length === 0) {
    await addDoc(collection(db, 'paymentMethods'), {
      userId,
      type: 'cash',
      name: 'Cash',
      bankName: '',
      country: 'India',
      color: '#f59e0b',
      isCashDefault: true,
      cashEnvelopeAmount: 0,
      cashSpent: 0,
      createdAt: serverTimestamp(),
    });
  }
}

export default function Cards({ user }: Props) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [tabbyEMIs, setTabbyEMIs]           = useState<TabbyEMI[]>([]);
  const [openingBal, setOpeningBal]         = useState<OpeningBalance | null>(null);
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [showModal, setShowModal]           = useState(false);
  const [expandedCard, setExpandedCard]     = useState<string | null>(null);
  const [editingMethod, setEditingMethod]   = useState<PaymentMethod | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [initializing, setInitializing]     = useState(true);

  // form state
  const [cardType, setCardType]                       = useState<CardType>('credit');
  const [cardName, setCardName]                       = useState('');
  const [bankName, setBankName]                       = useState('');
  const [country, setCountry]                         = useState<Country>('UAE');
  const [creditLimit, setCreditLimit]                 = useState('');
  const [statementDate, setStatementDate]             = useState('20');
  const [paymentDueDate, setPaymentDueDate]           = useState('15');
  const [currentBalance, setCurrentBalance]           = useState('');
  const [isTabbyPro, setIsTabbyPro]                   = useState(false);
  const [tabbyStatementDate, setTabbyStatementDate]   = useState('24');
  const [tabbyPaymentDueDate, setTabbyPaymentDueDate] = useState('3');
  const [cashEnvelopeAmount, setCashEnvelopeAmount]   = useState('');
  const [selectedColor, setSelectedColor]             = useState(cardColors[0]);
  const [customName, setCustomName]                   = useState('');

  // ── Auto-create / fix default cash accounts ──
  useEffect(() => {
    if (!user?.uid) return;
    ensureDefaultCashAccounts(user.uid)
      .catch(console.error)
      .finally(() => setInitializing(false));
  }, [user.uid]);

  // ── Payment methods listener ──
  useEffect(() => {
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setPaymentMethods(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PaymentMethod[]
      );
    });
  }, [user.uid]);

  // ── Tabby EMIs ──
  useEffect(() => {
    const q = query(
      collection(db, 'tabbyEMIs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setTabbyEMIs(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TabbyEMI[]
      );
    });
  }, [user.uid]);

  // ── Opening balances ──
  useEffect(() => {
    const q = query(
      collection(db, 'openingBalances'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const first = snap.docs[0];
        const data  = first.data() as OpeningBalance;
        setOpeningBal({
          id: first.id,
          userId: data.userId,
          uaeCash: data.uaeCash ?? 0,
          indiaCash: data.indiaCash ?? 0,
          perMethod:
            data.perMethod && typeof data.perMethod === 'object'
              ? { ...data.perMethod } : {},
          asOf: data.asOf ?? new Date().toISOString().slice(0, 10),
        });
      } else {
        setOpeningBal(null);
      }
    });
  }, [user.uid]);

  // ── Transactions ──
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Transaction[]
      );
    });
  }, [user.uid]);

  // ── Current Balance Calculation ──
  const getCurrentBalance = (pmId: string): number | null => {
    if (!openingBal) return null;
    const opening = openingBal.perMethod[pmId] ?? 0;
    const asOf    = openingBal.asOf;
    const delta   = transactions
      .filter((tx) => tx.paymentMethodId === pmId && tx.date >= asOf)
      .reduce((sum, tx) =>
        tx.type === 'income' ? sum + tx.amount : sum - tx.amount, 0);
    return opening + delta;
  };

  // ── Form helpers ──
  const resetForm = () => {
    setCardType('credit'); setCardName(''); setBankName('');
    setCountry('UAE'); setCreditLimit(''); setStatementDate('20');
    setPaymentDueDate('15'); setCurrentBalance('');
    setIsTabbyPro(false);
    setTabbyStatementDate('24'); setTabbyPaymentDueDate('3');
    setCashEnvelopeAmount(''); setSelectedColor(cardColors[0]);
    setCustomName(''); setEditingMethod(null);
  };

  const openAddModal = () => { resetForm(); setShowModal(true); };

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method);
    setCardType(method.type);
    setCardName(method.type === 'custom' ? '' : method.name || '');
    setCustomName(method.type === 'custom' ? method.name || '' : '');
    setBankName(method.bankName || '');
    setCountry(method.country || 'UAE');
    setCreditLimit(
      method.creditLimit !== undefined ? String(method.creditLimit) : ''
    );
    setStatementDate(
      method.statementDate !== undefined ? String(method.statementDate) : '20'
    );
    setPaymentDueDate(
      method.paymentDueDate !== undefined ? String(method.paymentDueDate) : '15'
    );
    setCurrentBalance(
      method.currentBalance !== undefined ? String(method.currentBalance) : ''
    );
    setIsTabbyPro(method.isTabbyPro ?? false);
    setTabbyStatementDate(
      method.tabbyStatementDate !== undefined
        ? String(method.tabbyStatementDate) : '24'
    );
    setTabbyPaymentDueDate(
      method.tabbyPaymentDueDate !== undefined
        ? String(method.tabbyPaymentDueDate) : '3'
    );
    setCashEnvelopeAmount(
      method.cashEnvelopeAmount !== undefined
        ? String(method.cashEnvelopeAmount) : ''
    );
    setSelectedColor(method.color || cardColors[0]);
    setShowModal(true);
  };

  const handleSave = async () => {
    const resolvedName =
      cardType === 'custom' ? customName.trim()
      : cardType === 'cash' ? 'Cash'
      : cardType === 'upi'  ? (cardName || 'UPI').trim()
      : cardName.trim();

    if (!resolvedName) {
      toast.error('Enter a name for this payment method');
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        userId: user.uid,
        type: cardType,
        name: resolvedName,
        bankName: bankName.trim() || '',
        country,
        color: selectedColor,
        isCashDefault: false,
      };
      if (cardType === 'credit') {
        data.creditLimit    = parseFloat(creditLimit) || 0;
        data.statementDate  = parseInt(statementDate) || 20;
        data.paymentDueDate = parseInt(paymentDueDate) || 15;
      }
      if (cardType === 'debit') {
        data.currentBalance = parseFloat(currentBalance) || 0;
      }
      if (cardType === 'tabby') {
        data.isTabbyPro          = !!isTabbyPro;
        data.tabbyStatementDate  = parseInt(tabbyStatementDate) || 24;
        data.tabbyPaymentDueDate = parseInt(tabbyPaymentDueDate) || 3;
      }
      if (cardType === 'cash') {
        data.cashEnvelopeAmount = parseFloat(cashEnvelopeAmount) || 0;
        data.cashSpent          = 0;
      }

      if (editingMethod?.id) {
        await updateDoc(doc(db, 'paymentMethods', editingMethod.id), data);
        toast.success('Payment method updated!');
      } else {
        await addDoc(collection(db, 'paymentMethods'), {
          ...data, createdAt: serverTimestamp(),
        });
        toast.success('Payment method added!');
      }
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (pm: PaymentMethod) => {
    if (pm.isCashDefault) {
      toast.error('Default cash accounts cannot be deleted');
      return;
    }
    if (!confirm('Delete this payment method?')) return;
    try {
      await deleteDoc(doc(db, 'paymentMethods', pm.id!));
      toast.success('Deleted!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete');
    }
  };

  const getTabbyEMIsForCard = (cardId: string) =>
    tabbyEMIs.filter((e) => e.paymentMethodId === cardId);

  const getUpcomingDues = () => {
    const today = new Date();
    const upcoming: {
      name: string; amount: string; dueDate: string; urgent: boolean;
    }[] = [];
    paymentMethods.forEach((pm) => {
      if (pm.type === 'tabby') {
        getTabbyEMIsForCard(pm.id!).forEach((emi) => {
          emi.emis.filter((e) => !e.paid).forEach((e) => {
            const diff = Math.ceil(
              (new Date(e.dueDate).getTime() - today.getTime()) / 86400000
            );
            if (diff >= 0 && diff <= 30) {
              upcoming.push({
                name: `${pm.name} - ${emi.itemName} EMI ${e.number}`,
                amount: `AED ${e.amount.toFixed(2)}`,
                dueDate: e.dueDate,
                urgent: diff <= 5,
              });
            }
          });
        });
      }
    });
    return upcoming.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  };

  const upcomingDues   = getUpcomingDues();
  const currencySymbol = (pm: PaymentMethod) =>
    pm.country === 'India' ? '₹' : 'AED';

  const formatBalance = (pm: PaymentMethod, bal: number) => {
    const sym = currencySymbol(pm);
    const abs = Math.abs(bal);
    const fmt = pm.country === 'India'
      ? abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })
      : abs.toLocaleString('en-US', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
    return bal < 0 ? `-${sym} ${fmt}` : `${sym} ${fmt}`;
  };

  if (initializing) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: 16,
      }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>
          Setting up accounts…
        </span>
      </div>
    );
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cards & Payment Methods</h1>
          <p className="page-subtitle">
            Manage cash, debit cards, credit cards, Tabby and UPI
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add Payment Method
          </button>
        </div>
      </div>

      {/* Opening balance notice */}
      {!openingBal && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: 'var(--muted)',
        }}>
          <Wallet size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          Set opening balances in{' '}
          <strong style={{ color: 'var(--text)', margin: '0 4px' }}>Settings</strong>
          {' '}to see live balance calculations.
        </div>
      )}

      {/* Upcoming dues */}
      {upcomingDues.length > 0 && (
        <div style={{
          marginBottom: 20, padding: 16,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, fontWeight: 700, color: 'var(--warning)',
          }}>
            <AlertCircle size={18} /> Upcoming Payments
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {upcomingDues.map((due, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: due.urgent
                  ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
                borderRadius: 10, fontSize: 13,
              }}>
                <span>{due.name}</span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <strong>{due.amount}</strong>
                  <span style={{
                    color: due.urgent ? 'var(--danger)' : 'var(--warning)',
                    fontWeight: 700,
                  }}>
                    {due.dueDate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payment Methods Grid ── */}
      {paymentMethods.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <CreditCard size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>
            No payment methods added yet
          </p>
        </div>
      ) : (
        <div className="grid grid-2" style={{ marginBottom: 20 }}>
          {paymentMethods.map((pm) => {
            const currentBal = pm.id ? getCurrentBalance(pm.id) : null;
            const hasBalance = currentBal !== null;

            return (
              <div key={pm.id} className="card">
                {/* Card Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 14,
                      background: pm.color || 'var(--primary)',
                      display: 'grid', placeItems: 'center', fontSize: 20,
                    }}>
                      {cardTypeConfig[pm.type].icon}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {pm.name}
                        {pm.isCashDefault && (
                          <span style={{
                            marginLeft: 6, fontSize: 10, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 999,
                            background: 'rgba(16,185,129,0.15)',
                            color: 'var(--success)',
                          }}>
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {pm.bankName && `${pm.bankName} · `}
                        {cardTypeConfig[pm.type].label} ·{' '}
                        {pm.country === 'UAE' ? '🇦🇪'
                          : pm.country === 'India' ? '🇮🇳' : '🌍'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEditModal(pm)}
                      style={{
                        padding: 6, borderRadius: 8, border: 'none',
                        background: 'var(--bg)', cursor: 'pointer',
                        color: 'var(--muted)',
                      }} title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() =>
                        setExpandedCard(expandedCard === pm.id ? null : pm.id!)
                      }
                      style={{
                        padding: 6, borderRadius: 8, border: 'none',
                        background: 'var(--bg)', cursor: 'pointer',
                        color: 'var(--muted)',
                      }}>
                      {expandedCard === pm.id
                        ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {!pm.isCashDefault && (
                      <button onClick={() => handleDelete(pm)}
                        style={{
                          padding: 6, borderRadius: 8, border: 'none',
                          background: 'var(--bg)', cursor: 'pointer',
                          color: 'var(--muted)',
                        }} title="Delete">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Balance */}
                {hasBalance && (
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: (currentBal ?? 0) >= 0
                      ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${(currentBal ?? 0) >= 0
                      ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 10, marginBottom: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Wallet size={14} style={{
                        color: (currentBal ?? 0) >= 0
                          ? 'var(--success)' : 'var(--danger)',
                      }} />
                      <span style={{
                        fontSize: 12, color: 'var(--muted)', fontWeight: 600,
                      }}>
                        Current Balance
                      </span>
                    </div>
                    <span style={{
                      fontSize: 15, fontWeight: 900,
                      color: (currentBal ?? 0) >= 0
                        ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {formatBalance(pm, currentBal ?? 0)}
                    </span>
                  </div>
                )}

                {/* Type-specific details */}
                {pm.type === 'credit' && (
                  <div>
                    <div className="country-row">
                      <span>Credit Limit</span>
                      <strong>AED {pm.creditLimit?.toLocaleString()}</strong>
                    </div>
                    <div className="country-row">
                      <span>Statement Date</span>
                      <strong>{pm.statementDate}th every month</strong>
                    </div>
                    <div className="country-row">
                      <span>Payment Due</span>
                      <strong style={{ color: 'var(--warning)' }}>
                        {pm.paymentDueDate}th of next month
                      </strong>
                    </div>
                  </div>
                )}

                {pm.type === 'debit' && (
                  <div>
                    <div className="country-row">
                      <span>Opening Balance</span>
                      <strong style={{ color: 'var(--muted)' }}>
                        {currencySymbol(pm)}{' '}
                        {(openingBal?.perMethod[pm.id!] ?? 0).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                )}

                {pm.type === 'tabby' && (
                  <div>
                    <div className="country-row">
                      <span>Tabby Type</span>
                      <strong style={{
                        color: pm.isTabbyPro ? 'var(--primary)' : 'var(--muted)',
                      }}>
                        {pm.isTabbyPro
                          ? '⚡ Pro — 4-month EMI split'
                          : '💳 Regular — full payment'}
                      </strong>
                    </div>
                    <div className="country-row">
                      <span>Statement Date</span>
                      <strong>{pm.tabbyStatementDate}th every month</strong>
                    </div>
                    <div className="country-row">
                      <span>Payment Due</span>
                      <strong style={{ color: 'var(--warning)' }}>
                        {pm.tabbyPaymentDueDate}th of next month
                      </strong>
                    </div>

                    {expandedCard === pm.id && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700,
                          marginBottom: 8, color: 'var(--warning)',
                        }}>
                          🛍️ Active Tabby Purchases
                        </div>
                        {getTabbyEMIsForCard(pm.id!).length === 0 ? (
                          <p style={{
                            fontSize: 12, color: 'var(--muted)',
                            textAlign: 'center', padding: '12px 0',
                          }}>
                            No active Tabby purchases
                          </p>
                        ) : (
                          getTabbyEMIsForCard(pm.id!).map((emi) => (
                            <div key={emi.id} style={{
                              marginBottom: 8, padding: 10,
                              background: 'rgba(245,158,11,0.08)',
                              borderRadius: 10,
                            }}>
                              <div style={{
                                fontWeight: 700, fontSize: 13, marginBottom: 6,
                              }}>
                                {emi.itemName} — AED {emi.totalAmount}
                              </div>
                              {emi.emis.map((e) => (
                                <div key={e.number} style={{
                                  display: 'flex', justifyContent: 'space-between',
                                  fontSize: 12, padding: '4px 0',
                                  color: e.paid ? 'var(--success)' : 'var(--muted)',
                                }}>
                                  <span>
                                    {e.paid ? '✅' : '⏳'} EMI {e.number} · {e.dueDate}
                                  </span>
                                  <strong>AED {e.amount.toFixed(2)}</strong>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {pm.type === 'cash' && (
                  <div>
                    <div className="country-row">
                      <span>Monthly Envelope</span>
                      <strong>
                        {currencySymbol(pm)}{' '}
                        {pm.cashEnvelopeAmount?.toLocaleString() || '0'}
                      </strong>
                    </div>
                    {pm.isCashDefault && (
                      <div style={{
                        marginTop: 8, fontSize: 11,
                        color: 'var(--muted)', lineHeight: 1.5,
                      }}>
                        💡 Default cash account — tracks all cash transactions
                      </div>
                    )}
                  </div>
                )}

                {pm.type === 'upi' && (
                  <div>
                    <div className="country-row">
                      <span>Type</span>
                      <strong>📱 UPI Payment</strong>
                    </div>
                  </div>
                )}

                {pm.type === 'custom' && (
                  <div>
                    <div className="country-row">
                      <span>Type</span>
                      <strong>Custom Payment Method</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'grid', placeItems: 'center',
            zIndex: 200, padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="card"
            style={{
              width: '100%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20,
            }}>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>
                {editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
              </h2>
              <button onClick={() => setShowModal(false)}
                style={{
                  padding: 8, borderRadius: 10, border: 'none',
                  background: 'var(--bg)', cursor: 'pointer',
                }}>
                <X size={18} />
              </button>
            </div>

            {/* Type selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Payment Method Type
              </label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              }}>
                {(Object.keys(cardTypeConfig) as CardType[]).map((type) => (
                  <button key={type}
                    onClick={() => !editingMethod && setCardType(type)}
                    disabled={!!editingMethod}
                    style={{
                      padding: '10px 8px', borderRadius: 12,
                      border: `2px solid ${
                        cardType === type ? 'var(--primary)' : 'var(--border)'
                      }`,
                      background: cardType === type
                        ? 'var(--primary-soft)' : 'var(--bg)',
                      cursor: editingMethod ? 'not-allowed' : 'pointer',
                      opacity: editingMethod && cardType !== type ? 0.5 : 1,
                      fontSize: 12, fontWeight: 600, color: 'var(--text)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>
                      {cardTypeConfig[type].icon}
                    </span>
                    {cardTypeConfig[type].label}
                  </button>
                ))}
              </div>
              {editingMethod && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                  Type cannot be changed after creation.
                </div>
              )}
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
                {(['UAE', 'India', 'Both'] as Country[]).map((c) => (
                  <button key={c}
                    className={`btn ${country === c ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCountry(c)}
                    style={{ flex: 1, fontSize: 13 }}>
                    {c === 'UAE' ? '🇦🇪 UAE'
                      : c === 'India' ? '🇮🇳 India' : '🌍 Both'}
                  </button>
                ))}
              </div>
            </div>

            {/* Name */}
            {cardType !== 'cash' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  marginBottom: 8, display: 'block',
                }}>
                  {cardType === 'custom' ? 'Method Name' : 'Card Name'}
                </label>
                <input type="text"
                  placeholder={
                    cardType === 'credit' ? 'e.g. ENBD Credit Card'
                    : cardType === 'debit' ? 'e.g. FAB Debit Card'
                    : cardType === 'tabby' ? 'e.g. Tabby Card'
                    : cardType === 'upi'   ? 'e.g. Google Pay'
                    : 'Custom payment method name'
                  }
                  value={cardType === 'custom' ? customName : cardName}
                  onChange={(e) =>
                    cardType === 'custom'
                      ? setCustomName(e.target.value)
                      : setCardName(e.target.value)
                  }
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Bank name */}
            {(cardType === 'credit' || cardType === 'debit') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  marginBottom: 8, display: 'block',
                }}>
                  Bank Name
                </label>
                <input type="text"
                  placeholder="e.g. Emirates NBD, FAB, ADCB"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Credit fields */}
            {cardType === 'credit' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                    marginBottom: 8, display: 'block',
                  }}>
                    Credit Limit (AED)
                  </label>
                  <input type="number" placeholder="e.g. 15000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 12,
                      border: '1px solid var(--border)', background: 'var(--bg)',
                      color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 12, marginBottom: 16,
                }}>
                  <div>
                    <label style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                      marginBottom: 8, display: 'block',
                    }}>
                      Statement Date
                    </label>
                    <input type="number" min="1" max="31"
                      value={statementDate}
                      onChange={(e) => setStatementDate(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                      marginBottom: 8, display: 'block',
                    }}>
                      Payment Due Date
                    </label>
                    <input type="number" min="1" max="31"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Debit fields */}
            {cardType === 'debit' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  marginBottom: 8, display: 'block',
                }}>
                  Current Balance ({country === 'India' ? '₹' : 'AED'})
                </label>
                <input type="number" placeholder="e.g. 5000"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Tabby fields */}
            {cardType === 'tabby' && (
              <>
                <div style={{
                  marginBottom: 16, padding: 14,
                  background: 'rgba(245,158,11,0.08)',
                  borderRadius: 14,
                  border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 16,
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        ⚡ Tabby Pro
                      </div>
                      <div style={{
                        fontSize: 12, color: 'var(--muted)', marginTop: 4,
                      }}>
                        {isTabbyPro
                          ? '✅ Pro ON — purchases split into 4 monthly EMIs'
                          : '❌ Pro OFF — pay full amount at once'}
                      </div>
                    </div>
                    <button
                      onClick={() => setIsTabbyPro(!isTabbyPro)}
                      type="button"
                      style={{
                        width: 48, height: 26, borderRadius: 999,
                        border: 'none',
                        background: isTabbyPro
                          ? 'var(--success)' : 'var(--border)',
                        cursor: 'pointer', position: 'relative', flexShrink: 0,
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'white', position: 'absolute',
                        top: 3, left: isTabbyPro ? 25 : 3,
                        transition: 'all 0.2s',
                      }} />
                    </button>
                  </div>
                  <div style={{
                    marginTop: 12, padding: '8px 10px',
                    background: isTabbyPro
                      ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
                    borderRadius: 8, fontSize: 12,
                    color: isTabbyPro ? 'var(--success)' : 'var(--primary)',
                    lineHeight: 1.5,
                  }}>
                    {isTabbyPro
                      ? '📅 Each purchase auto-split into 4 equal monthly payments'
                      : '💳 Full purchase amount due in next billing cycle'}
                  </div>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 12, marginBottom: 16,
                }}>
                  <div>
                    <label style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                      marginBottom: 8, display: 'block',
                    }}>
                      Statement Date
                    </label>
                    <input type="number" min="1" max="31"
                      value={tabbyStatementDate}
                      onChange={(e) => setTabbyStatementDate(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                      marginBottom: 8, display: 'block',
                    }}>
                      Payment Due Date
                    </label>
                    <input type="number" min="1" max="31"
                      value={tabbyPaymentDueDate}
                      onChange={(e) => setTabbyPaymentDueDate(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Cash fields */}
            {cardType === 'cash' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  marginBottom: 8, display: 'block',
                }}>
                  Monthly Cash Envelope ({country === 'India' ? '₹' : 'AED'})
                </label>
                <input type="number" placeholder="e.g. 500"
                  value={cashEnvelopeAmount}
                  onChange={(e) => setCashEnvelopeAmount(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Color */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                marginBottom: 8, display: 'block',
              }}>
                Card Color
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cardColors.map((color) => (
                  <button key={color}
                    onClick={() => setSelectedColor(color)}
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: color,
                      border: selectedColor === color
                        ? '3px solid var(--text)' : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <button className="btn btn-primary"
              onClick={handleSave} disabled={saving}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}>
              {saving
                ? editingMethod ? 'Updating...' : 'Saving...'
                : editingMethod ? 'Update Payment Method' : 'Save Payment Method'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}