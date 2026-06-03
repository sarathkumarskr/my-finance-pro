import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRightLeft,
  Plus,
  Search,
  X,
  Trash2,
  Pencil,
  Wallet,
  Landmark,
  TrendingDown,
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
  orderBy,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };

type Remittance = {
  id?: string;
  userId: string;
  amountSentAED: number;
  exchangeRate: number;
  transferFeeAED: number;
  amountReceivedINR: number;
  sentVia: string;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  date: string;
  note: string | null;
  createdAt?: any;
};

type PaymentMethod = {
  id: string;
  userId: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  color?: string;
  isCashDefault?: boolean;
};

const getToday = () => new Date().toISOString().split('T')[0];

const formatAED = (amount: number) =>
  `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const formatINR = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const cardTypeIcon: Record<string, string> = {
  credit: '💳', debit: '🏦', tabby: '🛍️',
  cash: '💵', upi: '📱', custom: '➕',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
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
  fontWeight: 600,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 6,
};

// ─── Helper: Clean payload (remove undefined) ────────────────────────────────
function cleanPayload(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (val !== undefined) {
      cleaned[key] = val === '' ? null : val;
    }
  });
  return cleaned;
}

export default function Remittance({ user }: Props) {
  const [items, setItems]               = useState<Remittance[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showModal, setShowModal]       = useState(false);
  const [editingItem, setEditingItem]   = useState<Remittance | null>(null);
  const [saving, setSaving]             = useState(false);
  const [searchTerm, setSearchTerm]     = useState('');

  // form
  const [amountSentAED, setAmountSentAED]         = useState('');
  const [exchangeRate, setExchangeRate]           = useState('');
  const [transferFeeAED, setTransferFeeAED]       = useState('');
  const [amountReceivedINR, setAmountReceivedINR] = useState('');
  const [manualReceived, setManualReceived]       = useState(false);
  const [sentVia, setSentVia]                     = useState('');
  const [fromAccountId, setFromAccountId]         = useState('');
  const [toAccountId, setToAccountId]             = useState('');
  const [date, setDate]                           = useState(getToday());
  const [note, setNote]                           = useState('');

  // ── Listeners ──
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'remittances'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() })) as Remittance[];
      list.sort((a, b) =>
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      setItems(list);
    }, (err) => {
      console.error('[Remittance] Listener error:', err);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    // FIXED: Removed orderBy to avoid index requirement
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, (snap) => {
      setPaymentMethods(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id && !(pm as any).isDeleted)
      );
    }, (err) => {
      console.error('[Remittance] PaymentMethods listener error:', err);
    });
  }, [user?.uid]);

  // ── Auto-calculate INR received ──
  useEffect(() => {
    if (manualReceived) return;
    const sent = parseFloat(amountSentAED) || 0;
    const fee  = parseFloat(transferFeeAED) || 0;
    const rate = parseFloat(exchangeRate) || 0;
    const net  = sent - fee;
    const received = net > 0 && rate > 0 ? net * rate : 0;
    setAmountReceivedINR(received > 0 ? received.toFixed(2) : '');
  }, [amountSentAED, transferFeeAED, exchangeRate, manualReceived]);

  // ── Filtered methods ──
  const uaeMethods = paymentMethods.filter(
    (pm) => pm.country === 'UAE' || pm.country === 'Both'
  );
  const indiaMethods = paymentMethods.filter(
    (pm) => pm.country === 'India' || pm.country === 'Both'
  );

  const getMethodById = (id: string) =>
    paymentMethods.find((m) => m.id === id) || null;

  // ── Reset form ──
  const resetForm = () => {
    setAmountSentAED(''); setExchangeRate(''); setTransferFeeAED('');
    setAmountReceivedINR(''); setManualReceived(false); setSentVia('');
    setFromAccountId(''); setToAccountId('');
    setDate(getToday()); setNote(''); setEditingItem(null);
  };

  const openAdd = () => { resetForm(); setShowModal(true); };

  const openEdit = (item: Remittance) => {
    setEditingItem(item);
    setAmountSentAED(String(item.amountSentAED));
    setExchangeRate(String(item.exchangeRate));
    setTransferFeeAED(String(item.transferFeeAED));
    setAmountReceivedINR(String(item.amountReceivedINR));
    setManualReceived(true);
    setSentVia(item.sentVia || '');
    setFromAccountId(item.fromAccountId || '');
    setToAccountId(item.toAccountId || '');
    setDate(item.date || getToday());
    setNote(item.note || '');
    setShowModal(true);
  };

  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      item.sentVia.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q) ||
      (item.note && item.note.toLowerCase().includes(q)) ||
      (item.fromAccountName && item.fromAccountName.toLowerCase().includes(q)) ||
      (item.toAccountName && item.toAccountName.toLowerCase().includes(q))
    );
  });

  // ── Stats ──
  const totalSentAED     = items.reduce((s, i) => s + i.amountSentAED, 0);
  const totalReceivedINR = items.reduce((s, i) => s + i.amountReceivedINR, 0);
  const totalFeesAED     = items.reduce((s, i) => s + i.transferFeeAED, 0);
  const avgRate  = items.length
    ? items.reduce((s, i) => s + i.exchangeRate, 0) / items.length : 0;
  const bestRate  = items.length
    ? Math.max(...items.map((i) => i.exchangeRate)) : 0;
  const worstRate = items.length
    ? Math.min(...items.map((i) => i.exchangeRate)) : 0;

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const sent     = parseFloat(amountSentAED);
    const rate     = parseFloat(exchangeRate);
    const fee      = parseFloat(transferFeeAED || '0');
    const received = parseFloat(amountReceivedINR);
    const netAED   = sent - fee;

    // Validation
    if (!amountSentAED || sent <= 0) {
      toast.error('Enter valid AED amount'); return;
    }
    if (!exchangeRate || rate <= 0) {
      toast.error('Enter valid exchange rate'); return;
    }
    if (fee < 0) { toast.error('Fee cannot be negative'); return; }
    if (!amountReceivedINR || received <= 0) {
      toast.error('Enter valid INR received amount'); return;
    }
    if (!sentVia.trim()) {
      toast.error('Enter service provider (e.g. Al Ansari)'); return;
    }
    if (!fromAccountId) {
      toast.error('Select FROM account (UAE)'); return;
    }

    const fromMethod = getMethodById(fromAccountId);
    const toMethod   = toAccountId ? getMethodById(toAccountId) : null;

    if (!fromMethod) {
      toast.error('From account not found'); return;
    }

    setSaving(true);
    try {
      // ━━━ STEP 1: Save/Update Remittance Record ━━━
      const remittanceData = cleanPayload({
        userId: user.uid,
        amountSentAED: sent,
        exchangeRate: rate,
        transferFeeAED: fee,
        amountReceivedINR: received,
        sentVia: sentVia.trim(),
        fromAccountId: fromAccountId,
        fromAccountName: fromMethod.name,
        toAccountId: toAccountId || null,
        toAccountName: toMethod?.name || null,
        date: date,
        note: note.trim() || null,
      });

      let remId: string;

      if (editingItem?.id) {
        // UPDATE existing
        remId = editingItem.id;
        await updateDoc(doc(db, 'remittances', remId), {
          ...remittanceData,
          updatedAt: serverTimestamp(),
        });
        
        // Delete old linked transactions
        const oldTxsQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', user.uid),
          where('remittanceId', '==', remId)
        );
        const oldTxsSnap = await getDocs(oldTxsQuery);
        
        // Use batch for delete
        if (oldTxsSnap.size > 0) {
          const batch = writeBatch(db);
          oldTxsSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      } else {
        // CREATE new
        const docRef = await addDoc(collection(db, 'remittances'), {
          ...remittanceData,
          createdAt: serverTimestamp(),
        });
        remId = docRef.id;
      }

      // ━━━ STEP 2: Create Linked Transactions ━━━
      // All transactions use writeBatch for atomicity
      const batch = writeBatch(db);
      const txCollection = collection(db, 'transactions');

      // 2a. Transfer Fee → Expense
      if (fee > 0) {
        const feeTxRef = doc(txCollection);
        batch.set(feeTxRef, cleanPayload({
          userId: user.uid,
          type: 'expense',
          amount: fee,
          currency: 'AED',
          country: 'UAE',
          category: 'Bank Fees',
          categoryName: 'Bank Fees',
          paymentMethodId: fromAccountId,
          paymentMethod: fromMethod.type,
          paymentMethodName: fromMethod.name,
          paymentMethodType: fromMethod.type,
          note: `Transfer fee for ${sentVia.trim()}`,
          date: date,
          isRemittanceFee: true,
          remittanceId: remId,
          debitAccountId: '5040', // Bank Fees GL
          creditAccountId: fromAccountId,
          createdAt: serverTimestamp(),
        }));
      }

      // 2b. AED Deduction (Net Amount)
      if (netAED > 0) {
        if (toAccountId && toMethod) {
          // ━━━ TRANSFER to OWN account ━━━
          // Deduct AED from UAE account
          const debitTxRef = doc(txCollection);
          batch.set(debitTxRef, cleanPayload({
            userId: user.uid,
            type: 'expense', // ← Use expense, not transfer (different currencies)
            amount: netAED,
            currency: 'AED',
            country: 'UAE',
            category: 'Remittance',
            categoryName: 'Remittance',
            paymentMethodId: fromAccountId,
            paymentMethod: fromMethod.type,
            paymentMethodName: fromMethod.name,
            paymentMethodType: fromMethod.type,
            note: `Sent to ${toMethod.name} via ${sentVia.trim()}`,
            date: date,
            isRemittance: true,
            remittanceId: remId,
            debitAccountId: '1100', // Investments/Transfer
            creditAccountId: fromAccountId,
            createdAt: serverTimestamp(),
          }));

          // Add INR to India account
          const creditTxRef = doc(txCollection);
          batch.set(creditTxRef, cleanPayload({
            userId: user.uid,
            type: 'income', // ← Use income for INR received
            amount: received,
            currency: 'INR',
            country: 'India',
            category: 'Remittance',
            categoryName: 'Remittance Received',
            paymentMethodId: toAccountId,
            paymentMethod: toMethod.type,
            paymentMethodName: toMethod.name,
            paymentMethodType: toMethod.type,
            note: `Received from UAE via ${sentVia.trim()}`,
            date: date,
            isRemittance: true,
            remittanceId: remId,
            debitAccountId: toAccountId,
            creditAccountId: '1100',
            createdAt: serverTimestamp(),
          }));
        } else {
          // ━━━ SENT to OTHERS (no destination account) ━━━
          const expTxRef = doc(txCollection);
          batch.set(expTxRef, cleanPayload({
            userId: user.uid,
            type: 'expense',
            amount: netAED,
            currency: 'AED',
            country: 'UAE',
            category: 'Remittance',
            categoryName: 'Remittance',
            paymentMethodId: fromAccountId,
            paymentMethod: fromMethod.type,
            paymentMethodName: fromMethod.name,
            paymentMethodType: fromMethod.type,
            note: `Remittance via ${sentVia.trim()}${note.trim() ? ' · ' + note.trim() : ''}`,
            date: date,
            isRemittance: true,
            remittanceId: remId,
            debitAccountId: '5090', // Other Expense
            creditAccountId: fromAccountId,
            createdAt: serverTimestamp(),
          }));
        }
      }

      // Commit all transactions atomically
      await batch.commit();

      toast.success(
        editingItem
          ? '✅ Remittance updated! Balances synced.'
          : '💸 Remittance saved! Balances updated.'
      );
      
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('[Remittance] Save error:', error);
      const errMsg = error?.code === 'permission-denied'
        ? 'Permission denied. Check Firestore rules.'
        : error?.message || 'Failed to save remittance';
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this remittance record? All linked transactions will be removed.')) return;
    try {
      // Use batch for atomicity
      const batch = writeBatch(db);

      // Delete linked transactions first
      const oldTxsQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        where('remittanceId', '==', id)
      );
      const oldTxsSnap = await getDocs(oldTxsQuery);
      oldTxsSnap.docs.forEach(d => batch.delete(d.ref));

      // Delete remittance
      batch.delete(doc(db, 'remittances', id));

      // Commit all
      await batch.commit();
      
      toast.success('🗑️ Remittance & linked transactions deleted');
    } catch (error: any) {
      console.error('[Remittance] Delete error:', error);
      const errMsg = error?.code === 'permission-denied'
        ? 'Permission denied. Check Firestore rules.'
        : error?.message || 'Failed to delete';
      toast.error(errMsg);
    }
  };

  // ── Account Selector Component ────────────────────────────────────────────
  const AccountSelector = ({
    label,
    methods,
    value,
    onChange,
    emptyMsg,
  }: {
    label: string;
    methods: PaymentMethod[];
    value: string;
    onChange: (id: string) => void;
    emptyMsg: string;
  }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {methods.length === 0 ? (
        <div style={{
          padding: '10px 14px', borderRadius: 12,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.15)',
          fontSize: 13, color: 'var(--danger)',
        }}>
          {emptyMsg}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={() => onChange('')}
            style={{
              padding: '9px 12px', borderRadius: 12, cursor: 'pointer',
              border: `2px solid var(--border)`,
              background: value === '' ? 'var(--bg)' : 'transparent',
              color: 'var(--muted)', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: value === '' ? 0.6 : 0.4,
            }}
          >
            <span>⬜</span> Not selected
          </button>

          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              style={{
                padding: '9px 12px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${
                  value === m.id ? 'var(--primary)' : 'var(--border)'
                }`,
                background: value === m.id ? 'var(--primary-soft)' : 'var(--bg)',
                color: 'var(--text)', fontSize: 12, fontWeight: 600,
                display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 2, textAlign: 'left',
              }}
            >
              <span>
                {cardTypeIcon[m.type] || '💳'} {m.name}
              </span>
              {m.bankName && (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {m.bankName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: 'var(--text)', padding: '4px 0' }}>

      {/* Header */}
      <div className="page-header" style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 className="page-title" style={{
            fontSize: 24, fontWeight: 900, margin: 0,
          }}>
            Remittance Tracker
          </h1>
          <p className="page-subtitle" style={{
            color: 'var(--muted)', fontSize: 14, marginTop: 4,
          }}>
            Track AED → INR transfers, exchange rates and fees
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--primary)', color: '#fff', border: 'none',
            padding: '11px 16px', borderRadius: 12,
            fontWeight: 800, cursor: 'pointer', fontSize: 14,
          }}
        >
          <Plus size={16} /> Add Remittance
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'var(--success)' }}><Wallet size={20} /></div>
            <span style={{
              fontSize: 11, background: 'rgba(34,197,94,0.12)',
              color: 'var(--success)', padding: '2px 8px',
              borderRadius: 999, fontWeight: 800,
            }}>
              AED
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            Total Sent
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
            {formatAED(totalSentAED)}
          </div>
        </div>

        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'var(--primary)' }}><Landmark size={20} /></div>
            <span style={{
              fontSize: 11, background: 'rgba(99,102,241,0.12)',
              color: 'var(--primary)', padding: '2px 8px',
              borderRadius: 999, fontWeight: 800,
            }}>
              INR
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            Total Received
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
            {formatINR(totalReceivedINR)}
          </div>
        </div>

        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'var(--warning)' }}><ArrowRightLeft size={20} /></div>
            <span style={{
              fontSize: 11, background: 'rgba(245,158,11,0.12)',
              color: 'var(--warning)', padding: '2px 8px',
              borderRadius: 999, fontWeight: 800,
            }}>
              Rate
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            Average Rate
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
            {avgRate ? avgRate.toFixed(2) : '0.00'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Best: {bestRate.toFixed(2)} · Worst: {worstRate.toFixed(2)}
          </div>
        </div>

        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'var(--danger)' }}><TrendingDown size={20} /></div>
            <span style={{
              fontSize: 11, background: 'rgba(239,68,68,0.12)',
              color: 'var(--danger)', padding: '2px 8px',
              borderRadius: 999, fontWeight: 800,
            }}>
              Fees
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            Total Fees Paid
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4, color: 'var(--danger)' }}>
            {formatAED(totalFeesAED)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {items.length} transfer{items.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)', color: 'var(--muted)',
        }} />
        <input
          type="text"
          placeholder="Search by service, account, date or note..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%', padding: '11px 14px 11px 42px',
            borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--card)', color: 'var(--text)',
            fontSize: 14, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48,
          background: 'var(--card)', borderRadius: 16,
          border: '1px solid var(--border)', color: 'var(--muted)',
        }}>
          <ArrowRightLeft size={40} style={{ marginBottom: 12, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            No remittances yet
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Click "Add Remittance" to record your first transfer
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 12,
        }}>
          {filteredItems.map((item) => {
            const netAED = item.amountSentAED - item.transferFeeAED;
            return (
              <div key={item.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 18, padding: 18,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17 }}>
                      {item.sentVia}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {item.date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => openEdit(item)}
                      style={{
                        padding: 6, borderRadius: 8, border: 'none',
                        background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id!)}
                      style={{
                        padding: 6, borderRadius: 8, border: 'none',
                        background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {(item.fromAccountName || item.toAccountName) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', marginBottom: 12,
                    background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 10, fontSize: 12,
                  }}>
                    <span style={{
                      fontWeight: 700, color: 'var(--success)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      💵 {item.fromAccountName || 'Not set'}
                    </span>
                    <ArrowRightLeft size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <span style={{
                      fontWeight: 700, color: 'var(--warning)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      🏦 {item.toAccountName || 'Not set'}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>Amount Sent</span>
                    <strong>{formatAED(item.amountSentAED)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>Transfer Fee</span>
                    <strong style={{ color: 'var(--danger)' }}>
                      {formatAED(item.transferFeeAED)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>Net Amount</span>
                    <strong style={{ color: 'var(--primary)' }}>
                      {formatAED(netAED)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--muted)' }}>Exchange Rate</span>
                    <strong>{item.exchangeRate.toFixed(2)}</strong>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 14, paddingTop: 8,
                    borderTop: '1px dashed var(--border)',
                  }}>
                    <span style={{ fontWeight: 700 }}>INR Received</span>
                    <strong style={{ color: 'var(--success)' }}>
                      {formatINR(item.amountReceivedINR)}
                    </strong>
                  </div>
                </div>

                {item.note && (
                  <div style={{
                    marginTop: 12, padding: 10,
                    borderRadius: 10, background: 'var(--bg)',
                    fontSize: 12, color: 'var(--muted)', fontStyle: 'italic',
                  }}>
                    "{item.note}"
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'grid', placeItems: 'center',
            zIndex: 1000, padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 24, width: '100%', maxWidth: 520,
              maxHeight: '90vh', overflowY: 'auto',
              padding: 24, boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 20,
            }}>
              <div>
                <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>
                  {editingItem ? '✏️ Edit Remittance' : 'Add Remittance'}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                  AED → INR transfer record
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: 8, borderRadius: 10, border: 'none',
                  background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <AccountSelector
              label="From Account (UAE — AED deducted) *"
              methods={uaeMethods}
              value={fromAccountId}
              onChange={setFromAccountId}
              emptyMsg="No UAE accounts. Add in Cards page."
            />

            <AccountSelector
              label="To Account (India — INR credited)"
              methods={indiaMethods}
              value={toAccountId}
              onChange={setToAccountId}
              emptyMsg="No India accounts. Add in Cards page."
            />

            <div style={{
              height: 1, background: 'var(--border)',
              margin: '4px 0 16px',
            }} />

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 12, marginBottom: 12,
            }}>
              <div>
                <label style={labelStyle}>Amount Sent (AED) *</label>
                <input
                  type="number" placeholder="e.g. 1000"
                  value={amountSentAED}
                  onChange={(e) => setAmountSentAED(e.target.value)}
                  style={{ ...inputStyle, fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Transfer Fee (AED)</label>
                <input
                  type="number" placeholder="e.g. 10"
                  value={transferFeeAED}
                  onChange={(e) => setTransferFeeAED(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 12, marginBottom: 12,
            }}>
              <div>
                <label style={labelStyle}>Exchange Rate *</label>
                <input
                  type="number" placeholder="e.g. 22.8"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  style={{ ...inputStyle, fontWeight: 700 }}
                />
              </div>
              <div>
                <label style={labelStyle}>INR Received *</label>
                <input
                  type="number"
                  placeholder="Auto calculated"
                  value={amountReceivedINR}
                  onChange={(e) => setAmountReceivedINR(e.target.value)}
                  readOnly={!manualReceived}
                  style={{
                    ...inputStyle, fontWeight: 700,
                    opacity: manualReceived ? 1 : 0.8,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setManualReceived(!manualReceived)}
                  style={{
                    border: 'none', background: 'transparent',
                    color: 'var(--primary)', fontSize: 11,
                    fontWeight: 800, marginTop: 4,
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  {manualReceived ? '✓ Manual mode' : '✎ Enter manually'}
                </button>
              </div>
            </div>

            {!manualReceived && amountSentAED && exchangeRate && (
              <div style={{
                padding: '10px 14px', borderRadius: 12,
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                fontSize: 13, marginBottom: 14,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ color: 'var(--muted)' }}>
                  ({formatAED(parseFloat(amountSentAED) || 0)} -{' '}
                  {formatAED(parseFloat(transferFeeAED) || 0)} fee) ×{' '}
                  {parseFloat(exchangeRate).toFixed(2)} =
                </span>
                <strong style={{ color: 'var(--success)' }}>
                  {amountReceivedINR ? `₹${parseFloat(amountReceivedINR).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0'}
                </strong>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Sent Via (Service Provider) *</label>
              <input
                type="text"
                placeholder="e.g. Al Ansari, Lulu Exchange, Wise"
                value={sentVia}
                onChange={(e) => setSentVia(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Transfer Date *</label>
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Note (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Monthly family transfer"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={inputStyle}
              />
            </div>

            {(fromAccountId || toAccountId) && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, marginBottom: 14,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                fontSize: 12, color: 'var(--primary)', lineHeight: 1.6,
              }}>
                ℹ️ Saving will automatically:
                {fromAccountId && (
                  <div>• Deduct <strong>{formatAED(parseFloat(amountSentAED) || 0)}</strong> from{' '}
                    <strong>{getMethodById(fromAccountId)?.name}</strong>
                  </div>
                )}
                {toAccountId && (
                  <div>• Add <strong>{amountReceivedINR ? `₹${parseFloat(amountReceivedINR).toLocaleString('en-IN')}` : '₹0'}</strong> to{' '}
                    <strong>{getMethodById(toAccountId)?.name}</strong>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', background: 'var(--primary)',
                color: '#fff', border: 'none', padding: '14px',
                borderRadius: 12, fontSize: 15, fontWeight: 900,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : editingItem ? '✅ Update Remittance' : '💸 Save Remittance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}