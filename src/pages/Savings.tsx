import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  PiggyBank,
  Plus,
  X,
  Trash2,
  Calendar,
  Target,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Props = { user: User };

type Country = 'UAE' | 'India';
type Currency = 'AED' | 'INR';

type SavingGoal = {
  id?: string;
  userId: string;
  name: string;
  country: Country;
  currency: Currency;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  note?: string;
  createdAt?: any;
};

export default function Savings({ user }: Props) {
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [name, setName] = useState('');
  const [country, setCountry] = useState<Country>('UAE');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  useEffect(() => {
    const q = query(
      collection(db, 'savingGoals'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snap) => {
      setGoals(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SavingGoal[]
      );
    });
  }, [user.uid]);

  const resetForm = () => {
    setName('');
    setCountry('UAE');
    setTargetAmount('');
    setCurrentAmount('');
    setDeadline('');
    setNote('');
    setEditingGoal(null);
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (goal: SavingGoal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setCountry(goal.country);
    setTargetAmount(String(goal.targetAmount));
    setCurrentAmount(String(goal.currentAmount));
    setDeadline(goal.deadline || '');
    setNote(goal.note || '');
    setShowModal(true);
  };

  const formatCurrency = (amount: number, curr: Currency) =>
    curr === 'AED'
      ? `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const getProgress = (goal: SavingGoal) => {
    if (!goal.targetAmount) return 0;
    return Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  };

  const getRemaining = (goal: SavingGoal) =>
    Math.max(goal.targetAmount - goal.currentAmount, 0);

  const getMonthlyNeeded = (goal: SavingGoal) => {
    if (!goal.deadline) return null;

    const today = new Date();
    const end = new Date(goal.deadline);

    const months =
      (end.getFullYear() - today.getFullYear()) * 12 +
      (end.getMonth() - today.getMonth()) +
      1;

    if (months <= 0) return getRemaining(goal);

    return getRemaining(goal) / months;
  };

  const totalAEDGoals = goals
    .filter((g) => g.currency === 'AED')
    .reduce((sum, g) => sum + g.currentAmount, 0);

  const totalINRGoals = goals
    .filter((g) => g.currency === 'INR')
    .reduce((sum, g) => sum + g.currentAmount, 0);

  const completedGoals = goals.filter(
    (g) => g.currentAmount >= g.targetAmount
  ).length;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Enter goal name');
      return;
    }

    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      toast.error('Enter valid target amount');
      return;
    }

    if (!currentAmount || parseFloat(currentAmount) < 0) {
      toast.error('Enter valid current amount');
      return;
    }

    setSaving(true);

    try {
      const data = {
        userId: user.uid,
        name: name.trim(),
        country,
        currency,
        targetAmount: parseFloat(targetAmount),
        currentAmount: parseFloat(currentAmount),
        deadline: deadline || '',
        note: note.trim() || '',
      };

      if (editingGoal?.id) {
        await updateDoc(doc(db, 'savingGoals', editingGoal.id), data);
        toast.success('Goal updated!');
      } else {
        await addDoc(collection(db, 'savingGoals'), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success('Goal created!');
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
    if (!confirm('Delete this savings goal?')) return;

    try {
      await deleteDoc(doc(db, 'savingGoals', id));
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
          <h1 className="page-title">Savings Goals</h1>
          <p className="page-subtitle">
            Track multiple goals and calculate monthly savings needed
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} />
            Add Goal
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-saving">
              <PiggyBank size={20} />
            </div>
            <span className="badge badge-primary">UAE</span>
          </div>
          <div className="stat-label">Total Saved (UAE)</div>
          <div className="stat-amount">
            {formatCurrency(totalAEDGoals, 'AED')}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-saving">
              <PiggyBank size={20} />
            </div>
            <span className="badge badge-primary">India</span>
          </div>
          <div className="stat-label">Total Saved (India)</div>
          <div className="stat-amount">
            {formatCurrency(totalINRGoals, 'INR')}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-debt">
              <Target size={20} />
            </div>
            <span className="badge badge-warning">Goals</span>
          </div>
          <div className="stat-label">Completed Goals</div>
          <div className="stat-amount">{completedGoals}</div>
          <div className="stat-note">{goals.length} total goals</div>
        </div>
      </div>

      {/* Goals list */}
      {goals.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: '48px 20px' }}
        >
          <PiggyBank size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 16, fontWeight: 600 }}>No savings goals yet</p>
          <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Add your first goal like Emergency Fund, Vacation, Gold or Bike
          </p>
        </div>
      ) : (
        <div className="grid grid-2">
          {goals.map((goal) => {
            const progress = getProgress(goal);
            const remaining = getRemaining(goal);
            const monthlyNeeded = getMonthlyNeeded(goal);

            return (
              <div key={goal.id} className="card">
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
                      {goal.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--muted)',
                        marginTop: 4,
                      }}
                    >
                      {goal.country === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
                      {goal.deadline ? ` · Deadline ${goal.deadline}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openEdit(goal)}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id!)}
                      style={{
                        padding: 8,
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--bg)',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="country-row">
                  <span>Saved</span>
                  <strong style={{ color: 'var(--success)' }}>
                    {formatCurrency(goal.currentAmount, goal.currency)}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Target</span>
                  <strong>
                    {formatCurrency(goal.targetAmount, goal.currency)}
                  </strong>
                </div>

                <div className="country-row">
                  <span>Remaining</span>
                  <strong style={{ color: 'var(--warning)' }}>
                    {formatCurrency(remaining, goal.currency)}
                  </strong>
                </div>

                {monthlyNeeded !== null && (
                  <div className="country-row">
                    <span>Monthly Needed</span>
                    <strong style={{ color: 'var(--primary)' }}>
                      {formatCurrency(monthlyNeeded, goal.currency)}
                    </strong>
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
                    <span style={{ color: 'var(--muted)' }}>Progress</span>
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
                            : 'linear-gradient(90deg, var(--primary), #8b5cf6)',
                        borderRadius: 999,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {goal.note && (
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
                    {goal.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
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
                {editingGoal ? 'Edit Savings Goal' : 'Add Savings Goal'}
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
                Goal Name
              </label>
              <input
                type="text"
                placeholder="e.g. Emergency Fund, Bike, Gold, Vacation"
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
                  className={`btn ${
                    country === 'UAE' ? 'btn-primary' : 'btn-secondary'
                  }`}
                  onClick={() => setCountry('UAE')}
                  style={{ flex: 1 }}
                >
                  🇦🇪 UAE (AED)
                </button>
                <button
                  className={`btn ${
                    country === 'India' ? 'btn-primary' : 'btn-secondary'
                  }`}
                  onClick={() => setCountry('India')}
                  style={{ flex: 1 }}
                >
                  🇮🇳 India (INR)
                </button>
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
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    marginBottom: 8,
                    display: 'block',
                  }}
                >
                  Target Amount ({currency})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
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
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    marginBottom: 8,
                    display: 'block',
                  }}
                >
                  Current Saved ({currency})
                </label>
                <input
                  type="number"
                  placeholder="e.g. 2500"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
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
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  marginBottom: 8,
                  display: 'block',
                }}
              >
                Deadline (Optional)
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
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
                placeholder="e.g. Save monthly from salary"
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
                ? editingGoal
                  ? 'Updating...'
                  : 'Saving...'
                : editingGoal
                ? 'Update Goal'
                : 'Save Goal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
