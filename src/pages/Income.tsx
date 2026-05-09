import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowUpRight,
  Plus,
  Search,
  Filter,
  X,
  Trash2,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  type Transaction,
  type Country,
  type Currency,
  defaultIncomeCategories,
  addTransaction,
  deleteTransaction,
  listenTransactions,
  formatCurrency,
  getToday,
} from '../firestoreHelpers';

type Props = { user: User };

export default function Income({ user }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filterCountry, setFilterCountry] = useState<'all' | Country>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('salary');
  const [country, setCountry] = useState<Country>('UAE');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(getToday());
  const [saving, setSaving] = useState(false);

  const currency: Currency = country === 'UAE' ? 'AED' : 'INR';

  // Listen to income transactions
  useEffect(() => {
    const unsubscribe = listenTransactions(user.uid, 'income', (data) => {
      setTransactions(data);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // Filtered transactions
  const filtered = transactions.filter((t) => {
    const matchCountry = filterCountry === 'all' || t.country === filterCountry;
    const matchSearch =
      searchTerm === '' ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.note?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCountry && matchSearch;
  });

  // Totals
  const totalAED = transactions
    .filter((t) => t.currency === 'AED')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalINR = transactions
    .filter((t) => t.currency === 'INR')
    .reduce((sum, t) => sum + t.amount, 0);

  // Save
  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await addTransaction({
        userId: user.uid,
        type: 'income',
        amount: parseFloat(amount),
        currency,
        country,
        category,
        note,
        date,
      });
      toast.success('Income added!');
      setShowModal(false);
      setAmount('');
      setCategory('salary');
      setNote('');
      setDate(getToday());
    } catch (error) {
      toast.error('Failed to save');
      console.error(error);
    }
    setSaving(false);
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (confirm('Delete this income entry?')) {
      try {
        await deleteTransaction(id);
        toast.success('Deleted!');
      } catch (error) {
        toast.error('Failed to delete');
      }
    }
  };

  const getCategoryIcon = (catId: string) => {
    return defaultIncomeCategories.find((c) => c.id === catId)?.icon || '💰';
  };

  const getCategoryName = (catId: string) => {
    return defaultIncomeCategories.find((c) => c.id === catId)?.name || catId;
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Income</h1>
          <p className="page-subtitle">Track UAE and India income</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            <Plus size={16} />
            Add Income
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-income">
              <ArrowUpRight size={20} />
            </div>
            <span className="badge badge-success">Total</span>
          </div>
          <div className="stat-label">UAE Income</div>
          <div className="stat-amount">{formatCurrency(totalAED, 'AED')}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-income">
              <ArrowUpRight size={20} />
            </div>
            <span className="badge badge-success">Total</span>
          </div>
          <div className="stat-label">India Income</div>
          <div className="stat-amount">{formatCurrency(totalINR, 'INR')}</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon icon-saving">
              <Calendar size={20} />
            </div>
            <span className="badge badge-primary">Entries</span>
          </div>
          <div className="stat-label">Total Entries</div>
          <div className="stat-amount">{transactions.length}</div>
        </div>
      </div>

      {/* Filters */}
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
              placeholder="Search income..."
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

      {/* Transaction List */}
      <div className="card">
        <h3 className="section-title">
          Income Entries ({filtered.length})
        </h3>

        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--muted)',
            }}
          >
            <ArrowUpRight
              size={40}
              style={{ marginBottom: 12, opacity: 0.5 }}
            />
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              No income entries yet
            </p>
            <p style={{ fontSize: 14, marginTop: 4 }}>
              Click "Add Income" to start tracking
            </p>
          </div>
        ) : (
          <div className="transaction-list">
            {filtered.map((t) => (
              <div key={t.id} className="transaction-item">
                <div
                  className="transaction-icon"
                  style={{
                    background: 'rgba(16,185,129,0.12)',
                    color: 'var(--success)',
                    fontSize: 18,
                  }}
                >
                  {getCategoryIcon(t.category)}
                </div>

                <div className="transaction-info">
                  <div className="transaction-name">
                    {getCategoryName(t.category)}
                  </div>
                  <div className="transaction-meta">
                    {t.country === 'UAE' ? '🇦🇪' : '🇮🇳'} {t.country} · {t.date}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>

                <div
                  className="transaction-amount"
                  style={{ color: 'var(--success)' }}
                >
                  + {formatCurrency(t.amount, t.currency)}
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

      {/* Add Income Modal */}
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
              maxWidth: 460,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>Add Income</h2>
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

            {/* Country Toggle */}
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

            {/* Amount */}
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

            {/* Category */}
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
                }}
              >
                {defaultIncomeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `2px solid ${
                        category === cat.id
                          ? 'var(--primary)'
                          : 'var(--border)'
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
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
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

            {/* Note */}
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
                placeholder="e.g. March salary"
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

            {/* Save Button */}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 15,
              }}
            >
              {saving ? 'Saving...' : `Save Income (${currency})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}