import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, doc, updateDoc, deleteDoc, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { X, Save, Trash2, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  defaultIncomeCategories,
  defaultExpenseCategories,
  formatCurrency,
  reverseTransaction,
  type Transaction,
  type Currency,
} from '../firestoreHelpers';

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
}

interface Props {
  user: User;
  transactionId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function TransactionEditor({ user, transactionId, onClose, onUpdate }: Props) {
  const [tx, setTx] = useState<Transaction | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!transactionId) return;
    const unsub = onSnapshot(doc(db, 'transactions', transactionId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Transaction;
        setTx(data);
        setAmount(String(data.amount));
        setCategory(data.category);
        setSubCategory(data.subCategory || '');
        setDate(data.date);
        setPaymentMethodId(data.paymentMethodId || '');
        setNote(data.note || '');
      } else {
        toast.error('Transaction not found');
        onClose();
      }
    });
    return unsub;
  }, [transactionId]);

  useEffect(() => {
    const q = query(collection(db, 'paymentMethods'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setPaymentMethods(snap.docs.map(d => ({ id: d.id, ...d.data() })) as PaymentMethod[]);
    });
  }, [user.uid]);

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Invalid amount'); return; }
    if (!category.trim()) { toast.error('Category required'); return; }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'transactions', transactionId), {
        amount: val,
        category: category.trim(),
        subCategory: subCategory.trim() || null,
        date,
        paymentMethodId: paymentMethodId || null,
        note: note.trim() || null,
        updatedAt: new Date().toISOString(),
      });
      toast.success('Transaction updated');
      onUpdate?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReverse = async () => {
    if (!tx) return;
    if (!confirm('Create reversal entry? Original will be marked as reversed.')) return;
    try {
      await reverseTransaction(tx, 'Manual reversal via editor');
      toast.success('Transaction reversed');
      onUpdate?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Reversal failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Permanently delete this transaction?')) return;
    try {
      await deleteDoc(doc(db, 'transactions', transactionId));
      toast.success('Deleted');
      onUpdate?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Delete failed');
    }
  };

  if (!tx) return null;

  const categories = tx.type === 'income' ? defaultIncomeCategories : defaultExpenseCategories;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:16 }}>
      <div style={{ background:'var(--card)', borderRadius:20, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', border:'1px solid var(--border)', position:'relative' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 20px 0' }}>
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:0.5 }}>
              {tx.isReversed ? '\u26A0\uFE0F REVERSED TRANSACTION' : 'EDIT TRANSACTION'}
            </div>
            <div style={{ fontSize:20, fontWeight:900, marginTop:4 }}>
              {tx.type === 'income' ? '\uD83D\uDCB0 Income' : tx.type === 'expense' ? '\uD83D\uDCC9 Expense' : '\uD83D\uDD04 Transfer'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'var(--bg)', border:'none', borderRadius:10, padding:8, cursor:'pointer', color:'var(--text)' }}>
            <X size={18} />
          </button>
        </div>

        {tx.isReversed && (
          <div style={{ margin:'16px 20px 0', padding:12, borderRadius:12, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', display:'flex', gap:10, alignItems:'center' }}>
            <AlertTriangle size={18} color="var(--warning)" />
            <span style={{ fontSize:13, color:'var(--warning)', fontWeight:600 }}>This transaction has been reversed</span>
          </div>
        )}

        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Amount *</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)}
              style={{ width:'100%', padding:'11px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:20, fontWeight:800, boxSizing:'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Category *</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {categories.map(cat => (
                <button key={cat.id} type="button" onClick={()=>setCategory(cat.name)}
                  style={{
                    padding:'7px 12px', borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer',
                    border:`1.5px solid ${category===cat.name?'var(--primary)':'var(--border)'}`,
                    background:category===cat.name?'var(--primary)':'var(--bg)',
                    color:category===cat.name?'#fff':'var(--text)',
                  }}>
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Sub Category</label>
            <input type="text" value={subCategory} onChange={e=>setSubCategory(e.target.value)} placeholder="Optional"
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Account *</label>
            <select value={paymentMethodId} onChange={e=>setPaymentMethodId(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}>
              <option value="">Select account</option>
              {paymentMethods.map(pm => (
                <option key={pm.id} value={pm.id}>{pm.name} {pm.bankName?`(${pm.bankName})`:''} ({pm.country})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Date *</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }} />
          </div>

          <div>
            <label style={{ fontSize:12, color:'var(--muted)', fontWeight:600, display:'block', marginBottom:6 }}>Note</label>
            <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional details"
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }} />
          </div>
        </div>

        <div style={{ padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'var(--primary)', color:'#fff', fontWeight:900, fontSize:15, cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Save size={16} /> {saving?'Saving...':'Save Changes'}
          </button>

          {!tx.isReversed && (
            <button onClick={handleReverse}
              style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid var(--warning)', background:'transparent', color:'var(--warning)', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <RotateCcw size={14} /> Reverse Transaction (ERP compliant)
            </button>
          )}

          <button onClick={()=>setShowDeleteConfirm(true)}
            style={{ width:'100%', padding:12, borderRadius:14, border:'1px solid var(--danger)', background:'transparent', color:'var(--danger)', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Trash2 size={14} /> Delete Permanently
          </button>
        </div>

        {showDeleteConfirm && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:20 }}>
            <div style={{ background:'var(--card)', padding:24, borderRadius:16, textAlign:'center', maxWidth:300 }}>
              <AlertTriangle size={40} color="var(--danger)" style={{ marginBottom:12 }} />
              <div style={{ fontWeight:800, fontSize:16, marginBottom:8 }}>Delete Forever?</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>This cannot be undone and will affect your balance.</div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowDeleteConfirm(false)} style={{ flex:1, padding:10, borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer', fontWeight:700 }}>Cancel</button>
                <button onClick={handleDelete} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'var(--danger)', color:'#fff', cursor:'pointer', fontWeight:700 }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}