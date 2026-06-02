import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, doc, updateDoc, deleteDoc,
  onSnapshot, query, where, getDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { toast } from 'react-hot-toast';
import { X, Save, Trash2, AlertTriangle, RotateCcw, CreditCard } from 'lucide-react';
import {
  defaultIncomeCategories,
  defaultExpenseCategories,
  formatCurrency,
  reverseTransaction,
  getExpenseGLAccount,
  getIncomeGLAccount,
  type Transaction,
  type Currency,
  type TabbyPurchaseEMI,
} from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  country: 'UAE' | 'India' | 'Both';
  bankName?: string;
  tabbyProEnabled?: boolean;
  tabbyEmis?: TabbyPurchaseEMI[];
  isDeleted?: boolean;
}

interface Props {
  user: User;
  transactionId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontWeight: 600,
  display: 'block',
  marginBottom: 6,
};

// ─── Tabby EMI Cleanup Helper ────────────────────────────────────────────────

async function removeTabbyEMIForTransaction(
  transactionId: string,
  methodId: string
): Promise<boolean> {
  try {
    const methodRef  = doc(db, 'paymentMethods', methodId);
    const methodSnap = await getDoc(methodRef);

    if (!methodSnap.exists()) return false;

    const methodData = methodSnap.data();
    if (methodData.type !== 'tabby') return false;

    const existingEmis = (methodData.tabbyEmis || []) as TabbyPurchaseEMI[];
    const updatedEmis  = existingEmis.filter(
      emi => emi.sourceTransactionId !== transactionId
    );

    if (updatedEmis.length === existingEmis.length) return false; // nothing changed

    await updateDoc(methodRef, {
      tabbyEmis:  updatedEmis,
      updatedAt:  new Date().toISOString(),
    });

    return true; // removed successfully
  } catch (e) {
    console.error('[TransactionEditor] removeTabbyEMIForTransaction error:', e);
    return false;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransactionEditor({
  user, transactionId, onClose, onUpdate,
}: Props) {

  const [tx,             setTx]             = useState<Transaction | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form fields
  const [amount,          setAmount]          = useState('');
  const [category,        setCategory]        = useState('');
  const [subCategory,     setSubCategory]     = useState('');
  const [date,            setDate]            = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [note,            setNote]            = useState('');

  // Tabby state
  const [hasLinkedTabbyEMI, setHasLinkedTabbyEMI] = useState(false);

  // ── Listeners ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!transactionId) return;
    const unsub = onSnapshot(doc(db, 'transactions', transactionId), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Transaction;
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
    const q = query(
      collection(db, 'paymentMethods'),
      where('userId', '==', user.uid)
    );
    return onSnapshot(q, snap => {
      setPaymentMethods(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter(pm => !pm.isDeleted)
      );
    });
  }, [user.uid]);

  // Check if this tx has a linked Tabby EMI
  useEffect(() => {
    if (!tx || tx.paymentMethodType !== 'tabby' || !tx.paymentMethodId) {
      setHasLinkedTabbyEMI(false);
      return;
    }
    const method = paymentMethods.find(m => m.id === tx.paymentMethodId);
    if (!method?.tabbyEmis) { setHasLinkedTabbyEMI(false); return; }
    const linked = method.tabbyEmis.some(
      emi => emi.sourceTransactionId === transactionId
    );
    setHasLinkedTabbyEMI(linked);
  }, [tx, paymentMethods, transactionId]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error('Invalid amount'); return; }
    if (!category.trim()) { toast.error('Category required'); return; }
    if (!tx) return;

    setSaving(true);
    try {
      // Recalculate GL accounts based on updated category + method
      const selectedPM = paymentMethods.find(m => m.id === paymentMethodId);

      let debitAccountId  = tx.debitAccountId;
      let creditAccountId = tx.creditAccountId;

      if (tx.type === 'income') {
        debitAccountId  = paymentMethodId || tx.paymentMethodId || null;
        creditAccountId = getIncomeGLAccount(category.trim());
      } else if (tx.type === 'expense') {
        debitAccountId  = getExpenseGLAccount(category.trim());
        creditAccountId = paymentMethodId || tx.paymentMethodId || null;
      }
      // Transfer: keep original fromMethod/toMethod GL accounts

      await updateDoc(doc(db, 'transactions', transactionId), {
        amount:            val,
        category:          category.trim(),
        subCategory:       subCategory.trim() || null,
        date,
        paymentMethodId:   paymentMethodId || null,
        paymentMethodName: selectedPM?.name || tx.paymentMethodName || null,
        paymentMethodType: selectedPM?.type || tx.paymentMethodType || null,
        note:              note.trim() || null,
        debitAccountId,     // ← FIXED: recalculated
        creditAccountId,    // ← FIXED: recalculated
        updatedAt:         new Date().toISOString(),
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

  // ── Reverse ────────────────────────────────────────────────────────────────

  const handleReverse = async () => {
    if (!tx) return;
    if (!confirm('Create reversal entry? Original will be marked as reversed.')) return;

    setSaving(true);
    try {
      // 1. Create reversal transaction
      await reverseTransaction(tx, 'Manual reversal via editor');

      // 2. If Tabby — remove linked EMI schedule
      if (tx.paymentMethodType === 'tabby' && tx.paymentMethodId) {
        const removed = await removeTabbyEMIForTransaction(
          transactionId,
          tx.paymentMethodId
        );
        if (removed) {
          toast.success(
            'Transaction reversed & Tabby installment schedule removed',
            { duration: 4000 }
          );
        } else {
          toast.success('Transaction reversed');
        }
      } else {
        toast.success('Transaction reversed');
      }

      onUpdate?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Reversal failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!tx) return;

    setSaving(true);
    try {
      // 1. If Tabby — remove linked EMI schedule FIRST
      if (tx.paymentMethodType === 'tabby' && tx.paymentMethodId) {
        const removed = await removeTabbyEMIForTransaction(
          transactionId,
          tx.paymentMethodId
        );
        if (removed) {
          // Small info so user knows EMI was cleaned up
          console.info('[TransactionEditor] Tabby EMI removed for tx:', transactionId);
        }
      }

      // 2. Hard delete transaction
      await deleteDoc(doc(db, 'transactions', transactionId));

      toast.success('Deleted');
      onUpdate?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Delete failed');
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!tx) return null;

  const isTabbyTx  = tx.paymentMethodType === 'tabby';
  const categories = tx.type === 'income'
    ? defaultIncomeCategories
    : defaultExpenseCategories;

  // Filter payment methods by currency
  const filteredMethods = paymentMethods.filter(pm => {
    if (tx.currency === 'AED') return pm.country === 'UAE' || pm.country === 'Both';
    return pm.country === 'India' || pm.country === 'Both';
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: 'var(--card)', borderRadius: 20,
        width: '100%', maxWidth: 500, maxHeight: '90vh',
        overflowY: 'auto', border: '1px solid var(--border)',
        position: 'relative',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 0' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5 }}>
              {tx.isReversed ? '⚠️ REVERSED TRANSACTION' : 'EDIT TRANSACTION'}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>
              {tx.type === 'income'
                ? '💰 Income'
                : tx.type === 'expense'
                  ? '📉 Expense'
                  : '🔄 Transfer'}
              {isTabbyTx && (
                <span style={{
                  marginLeft: 8, fontSize: 12, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
                  verticalAlign: 'middle',
                }}>
                  💳 Tabby
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'var(--bg)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Reversed warning */}
        {tx.isReversed && (
          <div style={{
            margin: '16px 20px 0', padding: 12, borderRadius: 12,
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <AlertTriangle size={18} color="var(--warning)" />
            <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>
              This transaction has been reversed
            </span>
          </div>
        )}

        {/* Tabby EMI notice */}
        {isTabbyTx && hasLinkedTabbyEMI && (
          <div style={{
            margin: '12px 20px 0', padding: 12, borderRadius: 12,
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <CreditCard size={16} color="#8b5cf6" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 700, marginBottom: 2 }}>
                Tabby Pro — Linked Installment Schedule
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                This purchase has an active 4-installment schedule.
                Reversing or deleting will also remove the Tabby EMI schedule.
              </div>
            </div>
          </div>
        )}

        {/* ── Form Fields ── */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Amount */}
          <div>
            <label style={labelStyle}>Amount *</label>
            <input
              type="number" value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ ...inputStyle, fontSize: 20, fontWeight: 800 }}
            />
          </div>

          {/* Category pills — income/expense only */}
          {tx.type !== 'transfer' && (
            <div>
              <label style={labelStyle}>Category *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(cat => (
                  <button key={cat.id} type="button"
                    onClick={() => setCategory(cat.name)}
                    style={{
                      padding: '7px 12px', borderRadius: 999,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${category === cat.name ? 'var(--primary)' : 'var(--border)'}`,
                      background: category === cat.name ? 'var(--primary)' : 'var(--bg)',
                      color: category === cat.name ? '#fff' : 'var(--text)',
                    }}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub Category — income/expense only */}
          {tx.type !== 'transfer' && (
            <div>
              <label style={labelStyle}>Sub Category</label>
              <input
                type="text" value={subCategory}
                onChange={e => setSubCategory(e.target.value)}
                placeholder="Optional"
                style={inputStyle}
              />
            </div>
          )}

          {/* Transfer info (read-only) */}
          {tx.type === 'transfer' && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              fontSize: 13, color: 'var(--muted)',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>
                🔄 Transfer Details
              </div>
              <div>From: <strong>{tx.fromMethod || 'N/A'}</strong></div>
              <div style={{ marginTop: 4 }}>To: <strong>{tx.toMethod || 'N/A'}</strong></div>
              <div style={{ marginTop: 6, fontSize: 11 }}>
                ⚠️ Transfer accounts cannot be changed here. Use reverse + re-enter.
              </div>
            </div>
          )}

          {/* Account — not for transfer */}
          {tx.type !== 'transfer' && (
            <div>
              <label style={labelStyle}>Account *</label>
              <select
                value={paymentMethodId}
                onChange={e => setPaymentMethodId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select account</option>
                {filteredMethods.map(pm => (
                  <option key={pm.id} value={pm.id}>
                    {pm.type === 'tabby' ? '🛒' : pm.type === 'credit' ? '💳' : pm.type === 'cash' ? '💵' : '🏦'}
                    {' '}{pm.name}
                    {pm.bankName ? ` (${pm.bankName})` : ''}
                    {pm.tabbyProEnabled ? ' — PRO' : ''}
                  </option>
                ))}
              </select>

              {/* Tabby warning if account changed */}
              {isTabbyTx && paymentMethodId !== (tx.paymentMethodId || '') && (
                <div style={{
                  marginTop: 6, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                  background: 'rgba(245,158,11,0.08)', color: 'var(--warning)',
                  border: '1px solid rgba(245,158,11,0.2)',
                }}>
                  ⚠️ Changing account on a Tabby transaction won\u2019t move the EMI schedule.
                  Consider reversing and re-entering instead.
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div>
            <label style={labelStyle}>Date *</label>
            <input
              type="date" value={date}
              onChange={e => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Note */}
          <div>
            <label style={labelStyle}>Note</label>
            <input
              type="text" value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional details"
              style={inputStyle}
            />
          </div>

          {/* GL account info (read-only display) */}
          {tx.debitAccountId && tx.creditAccountId && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(99,102,241,0.05)',
              border: '1px solid var(--border)',
              fontSize: 11, color: 'var(--muted)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Dr: <strong>{tx.debitAccountId}</strong></span>
              <span>Cr: <strong>{tx.creditAccountId}</strong></span>
            </div>
          )}
        </div>

        {/* ── Action Buttons ── */}
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Save */}
          <button onClick={handleSave} disabled={saving}
            style={{
              width: '100%', padding: 14, borderRadius: 14, border: 'none',
              background: isTabbyTx ? '#8b5cf6' : 'var(--primary)',
              color: '#fff', fontWeight: 900, fontSize: 15,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>

          {/* Reverse */}
          {!tx.isReversed && (
            <button onClick={handleReverse} disabled={saving}
              style={{
                width: '100%', padding: 12, borderRadius: 14,
                border: '1px solid var(--warning)', background: 'transparent',
                color: 'var(--warning)', fontWeight: 700, fontSize: 13,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <RotateCcw size={14} />
              Reverse Transaction (ERP compliant)
              {isTabbyTx && hasLinkedTabbyEMI && (
                <span style={{ fontSize: 11, opacity: 0.8 }}>+ remove Tabby schedule</span>
              )}
            </button>
          )}

          {/* Delete */}
          <button onClick={() => setShowDeleteConfirm(true)} disabled={saving}
            style={{
              width: '100%', padding: 12, borderRadius: 14,
              border: '1px solid var(--danger)', background: 'transparent',
              color: 'var(--danger)', fontWeight: 700, fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Trash2 size={14} />
            Delete Permanently
            {isTabbyTx && hasLinkedTabbyEMI && (
              <span style={{ fontSize: 11, opacity: 0.8 }}>+ remove Tabby schedule</span>
            )}
          </button>
        </div>

        {/* ── Delete Confirm Overlay ── */}
        {showDeleteConfirm && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 20,
          }}>
            <div style={{
              background: 'var(--card)', padding: 24, borderRadius: 16,
              textAlign: 'center', maxWidth: 320, margin: '0 16px',
            }}>
              <AlertTriangle size={40} color="var(--danger)" style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
                Delete Forever?
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
                This cannot be undone and will affect your balance.
              </div>

              {/* Extra Tabby warning */}
              {isTabbyTx && hasLinkedTabbyEMI && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10, marginBottom: 16,
                  background: 'rgba(139,92,246,0.08)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  fontSize: 12, color: '#8b5cf6', textAlign: 'left',
                }}>
                  <strong>💳 Tabby EMI schedule</strong> for this purchase will also be removed.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    flex: 1, padding: 10, borderRadius: 10,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text)', cursor: 'pointer', fontWeight: 700,
                  }}
                >
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={saving}
                  style={{
                    flex: 1, padding: 10, borderRadius: 10,
                    border: 'none', background: 'var(--danger)',
                    color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                    fontWeight: 700, opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}