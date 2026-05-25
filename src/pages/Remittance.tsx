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
  note: string | null; // Adherence to explicit null structure rule 6
  createdAt?: any;
};

const getToday = () => new Date().toISOString().split('T')[0];
const formatAED = (amount: number) => `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const formatINR = (amount: number) => `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export default function Remittance({ user }: Props) {
  const [items, setItems] = useState<Remittance[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Remittance | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form hooks parameters initialization logic bounds
  const [amountSentAED, setAmountSentAED] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [transferFeeAED, setTransferFeeAED] = useState('');
  const [amountReceivedINR, setAmountReceivedINR] = useState('');
  const [manualReceived, setManualReceived] = useState(false);
  const [sentVia, setSentVia] = useState('');
  const [date, setDate] = useState(getToday());
  const [note, setNote] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'remittances'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Remittance[];
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
    setAmountSentAED(''); setExchangeRate(''); setTransferFeeAED('');
    setAmountReceivedINR(''); setManualReceived(false); setSentVia('');
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
    setDate(item.date || getToday());
    setNote(item.note || '');
    setShowModal(true);
  };

  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      item.sentVia.toLowerCase().includes(q) ||
      item.date.toLowerCase().includes(q) ||
      (item.note && item.note.toLowerCase().includes(q))
    );
  });

  const totalSentAED = items.reduce((sum, item) => sum + item.amountSentAED, 0);
  const totalReceivedINR = items.reduce((sum, item) => sum + item.amountReceivedINR, 0);
  const totalFeesAED = items.reduce((sum, item) => sum + item.transferFeeAED, 0);
  const avgRate = items.length > 0 ? items.reduce((sum, item) => sum + item.exchangeRate, 0) / items.length : 0;
  const bestRate = items.length ? Math.max(...items.map((i) => i.exchangeRate)) : 0;
  const worstRate = items.length ? Math.min(...items.map((i) => i.exchangeRate)) : 0;

  const handleSave = async () => {
    const sent = parseFloat(amountSentAED);
    const rate = parseFloat(exchangeRate);
    const fee = parseFloat(transferFeeAED || '0');
    const received = parseFloat(amountReceivedINR);

    if (!amountSentAED || sent <= 0) { toast.error('Enter valid AED amount'); return; }
    if (!exchangeRate || rate <= 0) { toast.error('Enter valid exchange rate'); return; }
    if (fee < 0) { toast.error('Fee cannot be negative'); return; }
    if (!amountReceivedINR || received <= 0) { toast.error('Enter valid INR received amount'); return; }
    if (!sentVia.trim()) { toast.error('Enter dispatch network channel source'); return; }

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
        note: note.trim() === '' ? null : note.trim(), // Structural Rule 6 enforced
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, 'remittances', editingItem.id), data);
        toast.success('Remittance index adjusted');
      } else {
        await addDoc(collection(db, 'remittances'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success('Remittance trace published');
      }
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update telemetry logs');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Discard this remittance trace entry permanently?')) return;
    try {
      await deleteDoc(doc(db, 'remittances', id));
      toast.success('Trace clean complete');
    } catch (error) {
      console.error(error);
      toast.error('Could not clean target tracking document');
    }
  };

  return (
    <div style={{ color: 'var(--text)', padding: '4px 0' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Remittance Tracker</h1>
          <p className="page-subtitle" style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Track AED to INR transfers, exchange rates and transaction costs</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--primary)', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
          <Plus size={16} /> Add Remittance
        </button>
      </div>

      <div className="grid grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="stat-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ color: 'var(--success)' }}><Wallet size={20} /></div><span style={{ fontSize: 11, background: 'rgba(34,197,94,0.12)', color: 'var(--success)', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>AED</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Total Dispatched</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{formatAED(totalSentAED)}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ color: 'var(--primary)' }}><Landmark size={20} /></div><span style={{ fontSize: 11, background: 'rgba(99,102,241,0.12)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>INR</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Total Received</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{formatINR(totalReceivedINR)}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ color: 'var(--warning)' }}><ArrowRightLeft size={20} /></div><span style={{ fontSize: 11, background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>Rate</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Average Conversion</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{avgRate ? avgRate.toFixed(2) : '0.00'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>B: {bestRate.toFixed(2)} • W: {worstRate.toFixed(2)}</div>
        </div>
        <div className="stat-card" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><div style={{ color: 'var(--muted)' }}><ArrowRightLeft size={20} /></div><span style={{ fontSize: 11, background: 'var(--border)', color: 'var(--text)', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>Logs</span></div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Total Volumes</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{items.length}</div>
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, fontWeight: 700 }}>Fees: {formatAED(totalFeesAED)}</div>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input type="text" placeholder="Search by service channel network, date logs or notation tracers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '11px 14px 11px 42px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', color: 'var(--muted)' }}>
          <ArrowRightLeft size={40} style={{ marginBottom: 12, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No registered remittance dispatches found</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {filteredItems.map((item) => {
            const netAED = item.amountSentAED - item.transferFeeAED;
            return (
              <div key={item.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', justifyBetween: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17 }}>{item.sentVia}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{item.date}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(item)} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(item.id!)} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'var(--bg)', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Gross Volume Sent</span><strong>{formatAED(item.amountSentAED)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Channel Fee Charge</span><strong style={{ color: 'var(--danger)' }}>{formatAED(item.transferFeeAED)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Net Operational Base</span><strong style={{ color: 'var(--primary)' }}>{formatAED(netAED)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Effective Rate Lock</span><strong>{item.exchangeRate.toFixed(2)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 4, borderTop: '1px dashed var(--border)' }}><span style={{ fontWeight: 700 }}>INR Value Received</span><strong style={{ color: 'var(--success)' }}>{formatINR(item.amountReceivedINR)}</strong></div>
                </div>

                {item.note && <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'var(--bg)', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>"{item.note}"</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Pop Up configuration structural interface context portal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }} onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 24, width: '100%', maxWidth: 500, padding: 24, boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>{editingItem ? 'Modify Remittance Track' : 'Add Remittance Data'}</h2>
              <button onClick={() => setShowModal(false)} style={{ padding: 8, borderRadius: 10, border: 'none', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Amount Sent (AED) *</label>
                <input type="number" placeholder="Gross AED" value={amountSentAED} onChange={(e) => setAmountSentAED(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontWeight: 700 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Channel Fee (AED)</label>
                <input type="number" placeholder="Fee cost" value={transferFeeAED} onChange={(e) => setTransferFeeAED(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Exchange Rate *</label>
                <input type="number" placeholder="e.g. 22.8" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontWeight: 700 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>INR Net Received *</label>
                <input type="number" placeholder="Auto processing value" value={amountReceivedINR} onChange={(e) => setAmountReceivedINR(e.target.value)} readOnly={!manualReceived} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontWeight: 700, opacity: manualReceived ? 1 : 0.8 }} />
                <button type="button" onClick={() => setManualReceived(!manualReceived)} style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, marginTop: 4, cursor: 'pointer', padding: 0 }}>{manualReceived ? '✓ Mode: Manual Configuration' : '↳ Use Custom Override Amount'}</button>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Sent Via (Network Provider) *</label>
              <input type="text" placeholder="e.g. Al Ansari, Lulu Exchange, Wise" value={sentVia} onChange={(e) => setSentVia(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Value Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Note Tracking Tracer</label>
              <input type="text" placeholder="Tracer annotation notes" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%', background: 'var(--primary)', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Processing telemetry bounds...' : editingItem ? 'Save Updates' : 'Publish Remittance Dispatch'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}