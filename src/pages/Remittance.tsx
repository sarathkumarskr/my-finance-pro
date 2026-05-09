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

type Remittance = {
  id?: string;
  userId: string;
  amountSentAED: number;
  exchangeRate: number;
  transferFeeAED: number;
  amountReceivedINR: number;
  sentVia: string;
  date: string;
  note?: string;
  createdAt?: any;
};

const getToday = () => new Date().toISOString().split('T')[0];

const formatAED = (amount: number) =>
  `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const formatINR = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function Remittance({ user }: Props) {
  const [items, setItems] = useState<Remittance[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Remittance | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // form
  const [amountSentAED, setAmountSentAED] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [transferFeeAED, setTransferFeeAED] = useState('');
  const [amountReceivedINR, setAmountReceivedINR] = useState('');
  const [manualReceived, setManualReceived] = useState(false);
  const [sentVia, setSentVia] = useState('');
  const [date, setDate] = useState(getToday());
  const [note, setNote] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'remittances'),
      where('userId', '==', user.uid)
    );

    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Remittance[];

      // client-side sort to avoid extra Firestore composite index requirement
      list.sort((a, b) => {
        const aSec = a.createdAt?.seconds || 0;
        const bSec = b.createdAt?.seconds || 0;
        return bSec - aSec;
      });

      setItems(list);
    });
  }, [user.uid]);

  useEffect(() => {
    if (manualReceived) return;

    const sent = parseFloat(amountSentAED) || 0;
    const fee = parseFloat(transferFeeAED) || 0;
    const rate = parseFloat(exchangeRate) || 0;

    const netAED = sent - fee;
    const received = netAED > 0 && rate > 0 ? netAED * rate : 0;

    setAmountReceivedINR(received > 0 ? received.toFixed(2) : '');
  }, [amountSentAED, transferFeeAED, exchangeRate, manualReceived]);

  const resetForm = () => {
    setAmountSentAED('');
    setExchangeRate('');
    setTransferFeeAED('');
    setAmountReceivedINR('');
    setManualReceived(false);
    setSentVia('');
    setDate(getToday());
    setNote('');
    setEditingItem(null);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item: Remittance) => {
    setEditingItem(item);
    setAmountSentAED(String(item.amountSentAED));
    setExchangeRate(String(item.exchangeRate));
    setTransferFeeAED(String(item.transferFeeAED));
    setAmountReceivedINR(String(item.amountReceivedINR));
    setManualReceived(true);
    setSentVia(item.sentVia || '');
    setDate(item.date || getToday());
    setNote(item.note || '');
    setShowModal(true);
  };

  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      item.sentVia.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q) ||
      item.note?.toLowerCase().includes(q)
    );
  });

  const totalSentAED = items.reduce((sum, item) => sum + item.amountSentAED, 0);
  const totalReceivedINR = items.reduce(
    (sum, item) => sum + item.amountReceivedINR,
    0
  );
  const totalFeesAED = items.reduce((sum, item) => sum + item.transferFeeAED, 0);

  const avgRate =
    items.length > 0
      ? items.reduce((sum, item) => sum + item.exchangeRate, 0) / items.length
      : 0;

  const bestRate = items.length
    ? Math.max(...items.map((i) => i.exchangeRate))
    : 0;

  const worstRate = items.length
    ? Math.min(...items.map((i) => i.exchangeRate))
    : 0;

  const handleSave = async () => {
    const sent = parseFloat(amountSentAED);
    const rate = parseFloat(exchangeRate);
    const fee = parseFloat(transferFeeAED || '0');
    const received = parseFloat(amountReceivedINR);

    if (!amountSentAED || sent <= 0) {
      toast.error('Enter valid AED amount');
      return;
    }

    if (!exchangeRate || rate <= 0) {
      toast.error('Enter valid exchange rate');
      return;
    }

    if (fee < 0) {
      toast.error('Fee cannot be negative');
      return;
    }

    if (!amountReceivedINR || received <= 0) {
      toast.error('Enter valid INR received amount');
      return;
    }

    if (!sentVia.trim()) {
      toast.error('Enter sent via');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        amountSentAED: sent,
        exchangeRate: rate,
        transferFeeAED: fee,
        amountReceivedINR: received,
        sentVia: sentVia.trim(),
        date,
        note: note.trim() || '',
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, 'remittances', editingItem.id), data);
        toast.success('Remittance updated!');
      } else {
        await addDoc(collection(db, 'remittances'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success('Remittance added!');
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
    if (!confirm('Delete this remittance entry?')) return;

    try {
      await deleteDoc(doc(db, 'remittances', id));
      toast.success('Deleted!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Remittance Tracker</h1>
          <p className="page-subtitle">
            Track AED to INR transfers, exchange rates and fees
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} />
            Add Remittance
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-income">
              <Wallet size={20} />
            </div>
            <span className="badge badge-success">AED</span>
          </div>
          <div className="stat-label">Total Sent</div>
          <div className="stat-amount">{formatAED(totalSentAED)}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-saving">
              <Landmark size={20} />
            </div>
            <span className="badge badge-primary">INR</span>
          </div>
          <div className="stat-label">Total Received</div>
          <div className="stat-amount">{formatINR(totalReceivedINR)}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt">
              <ArrowRightLeft size={20} />
            </div>
            <span className="badge badge-warning">Rate</span>
          </div>
          <div className="stat-label">Average Rate</div>
          <div className="stat-amount">
            {avgRate ? avgRate.toFixed(2) : '0.00'}
          </div>
          <div className="stat-note">
            Best: {bestRate ? bestRate.toFixed(2) : '0.00'} · Worst:{' '}
            {worstRate ? worstRate.toFixed(2) : '0.00'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-expense">
              <ArrowRightLeft size={20} />
            </div>
            <span className="badge badge-danger">Count</span>
          </div>
          <div className="stat-label">Transfers</div>
          <div className="stat-amount">{items.length}</div>
          <div className="stat-note">Fees: {formatAED(totalFeesAED)}</div>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
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
            placeholder="Search by service, date or note..."
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
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <ArrowRightLeft size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>No remittance entries yet</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Add your first AED to INR transfer
          </p>
        </div>
      ) : (
        <div className="grid grid-2">
          {filteredItems.map((item) => {
            const netAED = item.amountSentAED - item.transferFeeAED;

            return (
              <div key={item.id} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{item.sentVia}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      {item.date}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openEdit(item)}
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
                      onClick={() => handleDelete(item.id!)}
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
                  </div>
                </div>

                <div className="country-row">
                  <span>Amount Sent</span>
                  <strong>{formatAED(item.amountSentAED)}</strong>
                </div>

                <div className="country-row">
                  <span>Transfer Fee</span>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatAED(item.transferFeeAED)}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Net AED</span>
                  <strong style={{ color: 'var(--primary)' }}>
                    {formatAED(netAED)}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Exchange Rate</span>
                  <strong>{item.exchangeRate.toFixed(2)}</strong>
                </div>

                <div className="country-row">
                  <span>INR Received</span>
                  <strong style={{ color: 'var(--success)' }}>
                    {formatINR(item.amountReceivedINR)}
                  </strong>
                </div>

                {item.note && (
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
                    {item.note}
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
            zIndex: 220,
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
                {editingItem ? 'Edit Remittance' : 'Add Remittance'}
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
                  Amount Sent (AED)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  value={amountSentAED}
                  onChange={(e) => setAmountSentAED(e.target.value)}
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
                  Transfer Fee (AED)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 15"
                  value={transferFeeAED}
                  onChange={(e) => setTransferFeeAED(e.target.value)}
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
                  Exchange Rate
                </label>
                <input
                  type="number"
                  placeholder="e.g. 22.45"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
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
                  INR Received
                </label>
                <input
                  type="number"
                  placeholder="Auto calculated"
                  value={amountReceivedINR}
                  onChange={(e) => setAmountReceivedINR(e.target.value)}
                  readOnly={!manualReceived}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 14,
                    opacity: manualReceived ? 1 : 0.85,
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className={`btn ${manualReceived ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setManualReceived(!manualReceived)}
                    style={{ fontSize: 12, padding: '8px 12px' }}
                  >
                    {manualReceived ? 'Manual Override ON' : 'Use Manual INR Amount'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Sent Via
              </label>
              <input
                type="text"
                placeholder="e.g. Al Ansari, Lulu Exchange, Bank, Wise"
                value={sentVia}
                onChange={(e) => setSentVia(e.target.value)}
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
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Sent for EMI / family expenses"
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
                ? editingItem
                  ? 'Updating...'
                  : 'Saving...'
                : editingItem
                ? 'Update Remittance'
                : 'Save Remittance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}