// Settings.tsx
import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { updateProfile } from 'firebase/auth';
import {
  collection, query, where, getDocs,
  doc, updateDoc, setDoc, onSnapshot,
  writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import {
  User as UserIcon, Settings, Download, Globe, Bell,
  Shield, ChevronRight, Edit3, Save, X, FileText,
  Database, Trash2, Info, Moon, Sun, Smartphone,
  AlertTriangle, RefreshCw, Wallet, IndianRupee,
  DollarSign, Calendar, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

type Currency = 'AED' | 'INR';
type Country  = 'UAE' | 'India';

type UserPrefs = {
  id?: string;
  userId: string;
  displayName: string;
  defaultCurrency: Currency;
  defaultCountry: Country;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    budgetAlerts: boolean;
    reminderEmails: boolean;
    weeklyReport: boolean;
  };
  remittanceReminderDay: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type PaymentMethod = {
  id: string;
  userId: string;
  type: 'credit' | 'debit' | 'tabby' | 'cash' | 'upi' | 'custom';
  name: string;
  bankName?: string;
  country: 'UAE' | 'India' | 'Both';
  color?: string;
  creditLimit?: number;
  openingUsed?: number;   // ← credit card current owed amount
};

type OpeningBalance = {
  id?: string;
  userId: string;
  uaeCash: number;
  indiaCash: number;
  perMethod: Record<string, number>;
  asOf: string;
  updatedAt?: unknown;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const RESET_COLLECTIONS = [
  'transactions', 'paymentMethods', 'savingGoals',
  'debts', 'debtPayments', 'tabbyEMIs', 'budgets',
  'remittances', 'userPrefs', 'budgetItems',
  'budgetMonthOverrides', 'budgetIncome', 'openingBalances',
] as const;

const EXPORT_TARGETS = [
  {
    key: 'transactions',
    label: 'Transactions',
    collection: 'transactions',
    description: 'Income and expense records',
    iconType: 'file',
    color: 'var(--primary)',
  },
  {
    key: 'paymentMethods',
    label: 'Payment Methods',
    collection: 'paymentMethods',
    description: 'Cards, cash, UPI, Tabby etc.',
    iconType: 'db',
    color: '#06b6d4',
  },
  {
    key: 'debts',
    label: 'Debts',
    collection: 'debts',
    description: 'Debt records',
    iconType: 'db',
    color: 'var(--warning)',
  },
  {
    key: 'debtPayments',
    label: 'Debt Payments',
    collection: 'debtPayments',
    description: 'Debt payment history',
    iconType: 'db',
    color: '#f97316',
  },
  {
    key: 'savingGoals',
    label: 'Saving Goals',
    collection: 'savingGoals',
    description: 'Savings goals and progress',
    iconType: 'db',
    color: 'var(--success)',
  },
  {
    key: 'remittances',
    label: 'Remittances',
    collection: 'remittances',
    description: 'AED to INR transfer history',
    iconType: 'db',
    color: '#8b5cf6',
  },
  {
    key: 'budgetItems',
    label: 'Budget Items',
    collection: 'budgetItems',
    description: 'Recurring forecast items',
    iconType: 'db',
    color: '#14b8a6',
  },
  {
    key: 'budgetMonthOverrides',
    label: 'Budget Overrides',
    collection: 'budgetMonthOverrides',
    description: 'Monthly modified amounts and paid status',
    iconType: 'db',
    color: '#ec4899',
  },
  {
    key: 'budgetIncome',
    label: 'Budget Income',
    collection: 'budgetIncome',
    description: 'Monthly salary and other income plan',
    iconType: 'db',
    color: '#22c55e',
  },
] as const;

type ExportKey  = (typeof EXPORT_TARGETS)[number]['key'];
type ExportType = ExportKey | 'all';

const cardTypeIcon: Record<string, string> = {
  credit: '💳', debit: '🏦', tabby: '🛍️',
  cash: '💵', upi: '📱', custom: '➕',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function ExportIcon({ iconType, size = 18 }: { iconType: string; size?: number }) {
  if (iconType === 'file') return <FileText size={size} />;
  return <Database size={size} />;
}

const defaultPrefs = (user: User): UserPrefs => ({
  userId: user.uid,
  displayName: user.displayName || '',
  defaultCurrency: 'AED',
  defaultCountry: 'UAE',
  theme: 'system',
  notifications: {
    budgetAlerts: true,
    reminderEmails: false,
    weeklyReport: false,
  },
  remittanceReminderDay: 1,
});

const defaultOpeningBalance = (user: User): OpeningBalance => ({
  userId: user.uid,
  uaeCash: 0,
  indiaCash: 0,
  perMethod: {},
  asOf: new Date().toISOString().slice(0, 10),
});

const prefsToFirestore = (prefs: UserPrefs) => {
  const { id, ...rest } = prefs;
  return rest;
};

const cleanForExport = (docs: Record<string, unknown>[]) =>
  docs.map((d) => {
    const clean: Record<string, unknown> = {};
    Object.entries(d).forEach(([key, value]) => {
      if (key === 'createdAt' || key === 'updatedAt') {
        clean[key] = (value as { toDate?: () => Date })?.toDate
          ? (value as { toDate: () => Date }).toDate().toISOString()
          : value;
      } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        clean[key] = JSON.stringify(value);
      } else {
        clean[key] = value;
      }
    });
    return clean;
  });

const toCSV = (data: Record<string, unknown>[], filename: string): boolean => {
  if (data.length === 0) { toast.error('No data to export'); return false; }
  const headers = Object.keys(data[0]);
  const rows    = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') || str.includes('"')
        ? `"${str}"` : str;
    }).join(',')
  );
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return true;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, description,
}: {
  icon: ReactNode; title: string; description?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
          {title}
        </span>
      </div>
      {description && (
        <p style={{
          fontSize: 12, color: 'var(--muted)', marginTop: 3,
          marginLeft: 24, lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 999,
        background: value ? 'var(--primary)' : 'var(--border)',
        cursor: 'pointer', position: 'relative',
        border: 'none', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: value ? 23 : 3, width: 18, height: 18,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function SettingRow({
  label, description, children,
}: {
  label: string; description?: string; children: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '14px 0',
      borderBottom: '1px solid var(--border)',
      gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
          {label}
        </div>
        {description && (
          <div style={{
            fontSize: 12, color: 'var(--muted)',
            marginTop: 2, lineHeight: 1.5,
          }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ── Balance Input Row (Debit/Cash) ─────────────────────────────────────────────

function BalanceInputRow({
  icon, label, sublabel, value, onChange, currency, color,
}: {
  icon: ReactNode; label: string; sublabel?: string;
  value: number; onChange: (v: number) => void;
  currency: string; color: string;
}) {
  const [focused,   setFocused]   = useState(false);
  const [inputVal,  setInputVal]  = useState(value === 0 ? '' : String(value));

  useEffect(() => {
    if (!focused) setInputVal(value === 0 ? '' : String(value));
  }, [value, focused]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: 'var(--bg)',
      borderRadius: 12,
      border: `1px solid ${focused ? color : 'var(--border)'}`,
      transition: 'border-color 0.2s', marginBottom: 8,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {sublabel}
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{currency}</span>
        <input
          type="number" min="0" placeholder="0"
          value={inputVal}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const parsed = parseFloat(inputVal) || 0;
            setInputVal(parsed === 0 ? '' : String(parsed));
            onChange(parsed);
          }}
          onChange={(e) => setInputVal(e.target.value)}
          style={{
            width: 110, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--text)', fontSize: 14, fontWeight: 700,
            textAlign: 'right', outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

// ── Credit Card Row (shows used balance + limit info) ─────────────────────────

function CreditCardBalanceRow({
  pm, openingUsed, onChange,
}: {
  pm: PaymentMethod;
  openingUsed: number;
  onChange: (v: number) => void;
}) {
  const [focused,  setFocused]  = useState(false);
  const [inputVal, setInputVal] = useState(
    openingUsed === 0 ? '' : String(openingUsed)
  );
  const currency = pm.country === 'India' ? '₹' : 'AED';
  const limit    = pm.creditLimit ?? 0;
  const used     = parseFloat(inputVal) || 0;
  const available = Math.max(limit - used, 0);
  const pct       = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor  = pct > 80 ? 'var(--danger)'
                  : pct > 60 ? 'var(--warning)'
                  : 'var(--success)';

  useEffect(() => {
    if (!focused) setInputVal(openingUsed === 0 ? '' : String(openingUsed));
  }, [openingUsed, focused]);

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 12, marginBottom: 8,
      border: `1px solid ${focused
        ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)'}`,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Main row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 12, padding: '12px 14px',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'rgba(239,68,68,0.12)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
          fontSize: 18,
        }}>
          💳
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {pm.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {pm.bankName ? `${pm.bankName} · ` : ''}
            {limit > 0
              ? `Limit: ${currency} ${limit.toLocaleString()}`
              : 'Credit Card'}
          </div>
        </div>
        {/* Used amount input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>
            {currency}
          </span>
          <input
            type="number" min="0" placeholder="0"
            value={inputVal}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const parsed = parseFloat(inputVal) || 0;
              setInputVal(parsed === 0 ? '' : String(parsed));
              onChange(parsed);
            }}
            onChange={(e) => setInputVal(e.target.value)}
            style={{
              width: 110, padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--danger)', fontSize: 14, fontWeight: 700,
              textAlign: 'right', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Utilization bar + info */}
      {limit > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          {/* Bar */}
          <div style={{
            height: 6, borderRadius: 99,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden', marginBottom: 6,
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: 99,
              transition: 'width 0.3s',
            }} />
          </div>
          {/* Labels */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: 'var(--muted)',
          }}>
            <span style={{ color: barColor, fontWeight: 700 }}>
              {pct.toFixed(0)}% used
            </span>
            <span>
              Available: {currency} {available.toLocaleString()}
            </span>
          </div>
          <div style={{
            fontSize: 11, color: 'var(--muted)', marginTop: 4,
          }}>
            💡 Enter how much is currently owed on this card
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SettingsPage({ user }: { user: User }) {
  const [prefs,           setPrefs]           = useState<UserPrefs>(defaultPrefs(user));
  const [prefsDocId,      setPrefsDocId]      = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [editingName,     setEditingName]     = useState(false);
  const [nameInput,       setNameInput]       = useState(user.displayName || '');
  const [exporting,       setExporting]       = useState<ExportType | null>(null);
  const [resettingData,   setResettingData]   = useState(false);

  const [openingBal,      setOpeningBal]      = useState<OpeningBalance>(
    defaultOpeningBalance(user)
  );
  const [openingBalDocId, setOpeningBalDocId] = useState<string | null>(null);
  const [savingBal,       setSavingBal]       = useState(false);
  const [paymentMethods,  setPaymentMethods]  = useState<PaymentMethod[]>([]);

  // ── Local credit card openingUsed state ────────────────────────────────────
  // Stored separately in paymentMethods doc, not in openingBalances
  const [creditUsed, setCreditUsed] = useState<Record<string, number>>({});
  const [savingCredit, setSavingCredit] = useState(false);

  // ── Load userPrefs ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'userPrefs'), where('userId', '==', user.uid)),
      (snap) => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data  = first.data() as UserPrefs;
          setPrefsDocId(first.id);
          setPrefs({ id: first.id, ...data });
          setNameInput(data.displayName || user.displayName || '');
        } else {
          setPrefsDocId(null);
          setPrefs(defaultPrefs(user));
          setNameInput(user.displayName || '');
        }
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load settings');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user.uid]);

  // ── Load Opening Balances ───────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'openingBalances'), where('userId', '==', user.uid)),
      (snap) => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data  = first.data() as OpeningBalance;
          setOpeningBalDocId(first.id);
          setOpeningBal({
            id: first.id,
            userId: data.userId,
            uaeCash: data.uaeCash ?? 0,
            indiaCash: data.indiaCash ?? 0,
            perMethod: data.perMethod && typeof data.perMethod === 'object'
              ? { ...data.perMethod } : {},
            asOf: data.asOf ?? new Date().toISOString().slice(0, 10),
          });
        } else {
          setOpeningBalDocId(null);
          setOpeningBal(defaultOpeningBalance(user));
        }
      }
    );
    return () => unsub();
  }, [user.uid]);

  // ── Load Payment Methods ────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'paymentMethods'), where('userId', '==', user.uid)),
      (snap) => {
        const methods = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PaymentMethod))
          .filter((pm) => pm.id && typeof pm.id === 'string');
        setPaymentMethods(methods);

        // Initialize creditUsed from existing openingUsed values
        const initialUsed: Record<string, number> = {};
        methods.forEach((pm) => {
          if (pm.type === 'credit') {
            initialUsed[pm.id] = pm.openingUsed ?? 0;
          }
        });
        setCreditUsed(initialUsed);
      }
    );
    return () => unsub();
  }, [user.uid]);

  // ── Save userPrefs ──────────────────────────────────────────────────────────

  const savePrefs = async (updated: UserPrefs, showToast = true) => {
    setSaving(true);
    try {
      const data = {
        ...prefsToFirestore(updated),
        updatedAt: serverTimestamp(),
      };
      if (prefsDocId) {
        await updateDoc(doc(db, 'userPrefs', prefsDocId), data);
      } else {
        const newDoc = doc(collection(db, 'userPrefs'));
        await setDoc(newDoc, { ...data, createdAt: serverTimestamp() });
        setPrefsDocId(newDoc.id);
      }
      if (showToast) toast.success('Settings saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Save Opening Balances (debit/cash) ──────────────────────────────────────

  const saveOpeningBalance = async (bal: OpeningBalance) => {
    setSavingBal(true);
    try {
      const { id, ...rest } = bal;
      const payload = {
        userId: rest.userId,
        uaeCash: rest.uaeCash ?? 0,
        indiaCash: rest.indiaCash ?? 0,
        perMethod: Object.fromEntries(
          Object.entries(rest.perMethod ?? {}).map(([k, v]) => [k, v ?? 0])
        ),
        asOf: rest.asOf,
        updatedAt: serverTimestamp(),
      };
      if (openingBalDocId) {
        await updateDoc(doc(db, 'openingBalances', openingBalDocId), payload);
      } else {
        const newDoc = doc(collection(db, 'openingBalances'));
        await setDoc(newDoc, { ...payload, createdAt: serverTimestamp() });
        setOpeningBalDocId(newDoc.id);
      }
      toast.success('Opening balances saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save opening balances');
    } finally {
      setSavingBal(false);
    }
  };

  // ── Save Credit Card Opening Used ───────────────────────────────────────────
  // Saves openingUsed field into each paymentMethods doc

  const saveCreditCardBalances = async () => {
    setSavingCredit(true);
    try {
      const batch = writeBatch(db);
      const creditCards = paymentMethods.filter((pm) => pm.type === 'credit');

      creditCards.forEach((pm) => {
        const used = creditUsed[pm.id] ?? 0;
        batch.update(doc(db, 'paymentMethods', pm.id), {
          openingUsed: used,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      toast.success('Credit card balances saved!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save credit balances');
    } finally {
      setSavingCredit(false);
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const updatePref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    savePrefs(updated);
  };

  const updateNotification = (
    key: keyof UserPrefs['notifications'], value: boolean
  ) => {
    const updated = {
      ...prefs,
      notifications: { ...prefs.notifications, [key]: value },
    };
    setPrefs(updated);
    savePrefs(updated);
  };

  const updateMethodBalance = (methodId: string, amount: number) => {
    if (!methodId) return;
    setOpeningBal((prev) => ({
      ...prev,
      perMethod: { ...(prev.perMethod ?? {}), [methodId]: amount },
    }));
  };

  const handleSaveName = async () => {
    const cleanName = nameInput.trim();
    if (!cleanName) { toast.error('Name cannot be empty'); return; }
    setSaving(true);
    try {
      if (auth.currentUser)
        await updateProfile(auth.currentUser, { displayName: cleanName });
      const updated = { ...prefs, displayName: cleanName };
      setPrefs(updated);
      await savePrefs(updated, false);
      setEditingName(false);
      toast.success('Profile updated!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (type: ExportType) => {
    setExporting(type);
    try {
      if (type === 'all') {
        let count = 0;
        for (const target of EXPORT_TARGETS) {
          const snap = await getDocs(
            query(collection(db, target.collection),
              where('userId', '==', user.uid))
          );
          const data = cleanForExport(
            snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, unknown>[]
          );
          if (data.length > 0) {
            if (toCSV(data, `myfinancepro_${target.key}`)) count++;
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        if (count === 0) toast.error('No data found to export');
        else toast.success(`Exported ${count} CSV file${count === 1 ? '' : 's'}`);
        return;
      }
      const target = EXPORT_TARGETS.find((t) => t.key === type);
      if (!target) { toast.error('Invalid export type'); return; }
      const snap = await getDocs(
        query(collection(db, target.collection), where('userId', '==', user.uid))
      );
      const data = cleanForExport(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, unknown>[]
      );
      if (toCSV(data, `myfinancepro_${target.key}`))
        toast.success(`${target.label} exported!`);
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleResetAllMyData = async () => {
    const confirmText = window.prompt(
      'This will permanently delete ALL data.\n\nType RESET to continue.'
    );
    if (confirmText !== 'RESET') { toast.error('Reset cancelled'); return; }
    if (!window.confirm('Final confirmation: This cannot be undone. Continue?')) {
      toast.error('Reset cancelled'); return;
    }
    setResettingData(true);
    try {
      let deletedCount = 0;
      for (const colName of RESET_COLLECTIONS) {
        const snap = await getDocs(
          query(collection(db, colName), where('userId', '==', user.uid))
        );
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 400)
            .forEach((d) => batch.delete(doc(db, colName, d.id)));
          await batch.commit();
          deletedCount += Math.min(400, snap.docs.length - i);
        }
      }
      setPrefsDocId(null);
      setPrefs(defaultPrefs(user));
      setNameInput(user.displayName || '');
      setOpeningBalDocId(null);
      setOpeningBal(defaultOpeningBalance(user));
      setCreditUsed({});
      toast.success(`Reset complete. Deleted ${deletedCount} document(s).`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reset data');
    } finally {
      setResettingData(false);
    }
  };

  const handleResetSettingsOnly = async () => {
    if (!window.confirm('Reset settings to default values?')) return;
    const reset = defaultPrefs(user);
    setPrefs(reset);
    setNameInput(user.displayName || '');
    await savePrefs(reset);
    toast.success('Settings reset to defaults');
  };

  // ── Computed values ─────────────────────────────────────────────────────────

  const safePerMethod = openingBal.perMethod ?? {};

  // ✅ UAE methods — exclude credit cards (they're liabilities, not assets)
  const uaeDebitMethods = paymentMethods.filter(
    (pm) => pm.type !== 'credit' && pm.id &&
    (pm.country === 'UAE' || pm.country === 'Both')
  );
  // ✅ India methods — exclude credit cards
  const indiaDebitMethods = paymentMethods.filter(
    (pm) => pm.type !== 'credit' && pm.id && pm.country === 'India'
  );
  // ✅ Credit cards — shown separately
  const creditCards = paymentMethods.filter(
    (pm) => pm.type === 'credit' && pm.id
  );

  // ✅ Totals — liquid assets only (no credit)
  const totalUAE =
    (openingBal.uaeCash ?? 0) +
    uaeDebitMethods.reduce(
      (s, pm) => s + (safePerMethod[pm.id] ?? 0), 0
    );
  const totalIndia =
    (openingBal.indiaCash ?? 0) +
    indiaDebitMethods.reduce(
      (s, pm) => s + (safePerMethod[pm.id] ?? 0), 0
    );
  // ✅ Total credit owed (liability)
  const totalCreditOwed = creditCards.reduce(
    (s, pm) => s + (creditUsed[pm.id] ?? 0), 0
  );

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', flexDirection: 'column', gap: 16,
      }}>
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>
          Loading settings…
        </span>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: 820, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Settings size={28} style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            Settings
          </h1>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
          Manage your profile, opening balances, preferences and account data.
        </p>
      </div>

      {/* ── Profile ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader
          icon={<UserIcon size={16} />}
          title="Profile"
          description="Your Google account and app profile information"
        />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: 16, background: 'var(--bg)',
          borderRadius: 12, border: '1px solid var(--border)', marginBottom: 16,
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            border: '2px solid var(--primary)',
          }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: 'var(--primary)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
                color: '#fff', fontSize: 24, fontWeight: 900,
              }}>
                {user.displayName?.charAt(0) || 'U'}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 16, fontWeight: 900, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {prefs.displayName || user.displayName || 'User'}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--muted)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 7, padding: '3px 8px',
              background: 'rgba(99,102,241,0.1)',
              color: 'var(--primary)', borderRadius: 999,
              fontSize: 11, fontWeight: 800,
            }}>
              <Shield size={11} /> Google Account
            </div>
          </div>
        </div>

        <SettingRow label="Display Name" description="Name shown inside the app">
          {editingName ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                style={{
                  padding: '7px 10px', borderRadius: 8,
                  border: '1px solid var(--primary)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 13, width: 170, outline: 'none',
                }}
                autoFocus
              />
              <button onClick={handleSaveName} disabled={saving}
                style={{
                  padding: '7px 11px', borderRadius: 8,
                  background: 'var(--primary)', color: '#fff',
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Save size={13} /> Save
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameInput(prefs.displayName || user.displayName || '');
                }}
                style={{
                  padding: 7, borderRadius: 8, background: 'var(--bg)',
                  color: 'var(--text)', border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              <Edit3 size={13} /> Edit
            </button>
          )}
        </SettingRow>

        <SettingRow label="User ID" description="Firebase Auth UID">
          <span style={{
            fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace',
            background: 'var(--bg)', padding: '5px 8px',
            borderRadius: 7, border: '1px solid var(--border)',
            maxWidth: 190, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
          }}>
            {user.uid}
          </span>
        </SettingRow>
      </div>

      {/* ── Opening Balances ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader
          icon={<Wallet size={16} />}
          title="Opening Balances"
          description="Set your starting balances. Dashboard shows: Opening + Income − Expenses from this date."
        />

        {/* As-of date */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', background: 'var(--bg)',
          borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20,
        }}>
          <Calendar size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              Balances As Of
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              Date from which transactions are counted
            </div>
          </div>
          <input
            type="date"
            value={openingBal.asOf}
            onChange={(e) =>
              setOpeningBal((prev) => ({ ...prev, asOf: e.target.value }))
            }
            style={{
              padding: '7px 10px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text)', fontSize: 13, fontWeight: 700,
              outline: 'none', cursor: 'pointer',
            }}
          />
        </div>

        {/* ── UAE Debit/Cash ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 18 }}>🇦🇪</span>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              UAE — Debit / Cash Balances
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 12,
              color: 'var(--muted)', fontWeight: 600,
            }}>
              in AED
            </span>
          </div>

          <BalanceInputRow
            icon={<DollarSign size={16} />}
            label="Cash (AED)"
            sublabel="Physical cash in UAE"
            value={openingBal.uaeCash ?? 0}
            onChange={(v) => setOpeningBal((p) => ({ ...p, uaeCash: v }))}
            currency="AED"
            color="var(--success)"
          />

          {uaeDebitMethods.length === 0 ? (
            <div style={{
              padding: 12, textAlign: 'center', fontSize: 13,
              color: 'var(--muted)', background: 'var(--bg)',
              borderRadius: 10, border: '1px dashed var(--border)',
            }}>
              No UAE debit methods — add in Cards page
            </div>
          ) : (
            uaeDebitMethods.map((pm) => (
              <BalanceInputRow
                key={pm.id}
                icon={<span style={{ fontSize: 16 }}>{cardTypeIcon[pm.type] || '💳'}</span>}
                label={pm.name}
                sublabel={pm.bankName || pm.type}
                value={safePerMethod[pm.id] ?? 0}
                onChange={(v) => updateMethodBalance(pm.id, v)}
                currency="AED"
                color={pm.color || 'var(--primary)'}
              />
            ))
          )}
        </div>

        {/* ── India Debit/Cash ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 12, paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 18 }}>🇮🇳</span>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              India — Debit / Cash Balances
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: 12,
              color: 'var(--muted)', fontWeight: 600,
            }}>
              in INR
            </span>
          </div>

          <BalanceInputRow
            icon={<IndianRupee size={16} />}
            label="Cash (INR)"
            sublabel="Physical cash in India"
            value={openingBal.indiaCash ?? 0}
            onChange={(v) => setOpeningBal((p) => ({ ...p, indiaCash: v }))}
            currency="₹"
            color="var(--warning)"
          />

          {indiaDebitMethods.length === 0 ? (
            <div style={{
              padding: 12, textAlign: 'center', fontSize: 13,
              color: 'var(--muted)', background: 'var(--bg)',
              borderRadius: 10, border: '1px dashed var(--border)',
            }}>
              No India debit methods — add in Cards page
            </div>
          ) : (
            indiaDebitMethods.map((pm) => (
              <BalanceInputRow
                key={pm.id}
                icon={<span style={{ fontSize: 16 }}>{cardTypeIcon[pm.type] || '💳'}</span>}
                label={pm.name}
                sublabel={pm.bankName || pm.type}
                value={safePerMethod[pm.id] ?? 0}
                onChange={(v) => updateMethodBalance(pm.id, v)}
                currency="₹"
                color={pm.color || 'var(--warning)'}
              />
            ))
          )}
        </div>

        {/* ── Summary — Liquid Assets ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10, marginBottom: 16,
        }}>
          <div style={{
            padding: '12px 14px',
            background: 'rgba(16,185,129,0.08)',
            borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              🇦🇪 Total UAE Assets
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900,
              color: 'var(--success)', marginTop: 4,
            }}>
              AED {totalUAE.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{
            padding: '12px 14px',
            background: 'rgba(245,158,11,0.08)',
            borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              🇮🇳 Total India Assets
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900,
              color: 'var(--warning)', marginTop: 4,
            }}>
              ₹{totalIndia.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* How it works info */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '10px 12px', background: 'var(--bg)',
          borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16,
        }}>
          <Info size={14} style={{
            color: 'var(--primary)', flexShrink: 0, marginTop: 2,
          }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>How it works:</strong>{' '}
            Enter actual balances for each account.
            Dashboard calculates:{' '}
            <em>Opening Balance + All Income − All Expenses</em>{' '}
            from the "As Of" date.
          </span>
        </div>

        <button
          onClick={() => saveOpeningBalance(openingBal)}
          disabled={savingBal}
          style={{
            width: '100%', padding: 13, borderRadius: 10,
            background: savingBal ? 'var(--muted)' : 'var(--primary)',
            color: '#fff', border: 'none',
            cursor: savingBal ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}
        >
          {savingBal ? (
            <>
              <RefreshCw size={15}
                style={{ animation: 'spin 0.8s linear infinite' }} />
              Saving…
            </>
          ) : (
            <><Save size={15} /> Save Opening Balances</>
          )}
        </button>
      </div>

      {/* ── Credit Card Balances ── */}
      {creditCards.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <SectionHeader
            icon={<CreditCard size={16} />}
            title="Credit Card — Current Owed"
            description="Enter how much is currently owed on each credit card. This becomes the starting point; new transactions auto-update the balance."
          />

          {creditCards.map((pm) => (
            <CreditCardBalanceRow
              key={pm.id}
              pm={pm}
              openingUsed={creditUsed[pm.id] ?? 0}
              onChange={(v) =>
                setCreditUsed((prev) => ({ ...prev, [pm.id]: v }))
              }
            />
          ))}

          {/* Credit total */}
          <div style={{
            padding: '12px 14px', marginTop: 12,
            background: 'rgba(239,68,68,0.06)',
            borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{
                fontSize: 12, fontWeight: 800, color: 'var(--danger)',
              }}>
                💳 Total Credit Owed
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                Liability — subtracted from net worth
              </div>
            </div>
            <div style={{
              fontSize: 20, fontWeight: 900, color: 'var(--danger)',
            }}>
              AED {totalCreditOwed.toLocaleString('en-US', {
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          {/* Info */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '10px 12px', background: 'var(--bg)',
            borderRadius: 8, border: '1px solid var(--border)',
            marginTop: 12, marginBottom: 16,
          }}>
            <Info size={14} style={{
              color: 'var(--warning)', flexShrink: 0, marginTop: 2,
            }} />
            <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)' }}>Credit balance:</strong>{' '}
              Enter the amount currently owed (statement balance or total outstanding).
              After this, each expense on this card auto-increases the owed amount,
              and payments reduce it. Add EMI details in the{' '}
              <strong style={{ color: 'var(--primary)' }}>Cards page</strong>.
            </span>
          </div>

          <button
            onClick={saveCreditCardBalances}
            disabled={savingCredit}
            style={{
              width: '100%', padding: 13, borderRadius: 10,
              background: savingCredit ? 'var(--muted)' : 'var(--danger)',
              color: '#fff', border: 'none',
              cursor: savingCredit ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 800,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}
          >
            {savingCredit ? (
              <>
                <RefreshCw size={15}
                  style={{ animation: 'spin 0.8s linear infinite' }} />
                Saving Credit Balances…
              </>
            ) : (
              <><Save size={15} /> Save Credit Card Balances</>
            )}
          </button>
        </div>
      )}

      {/* ── Preferences ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader
          icon={<Globe size={16} />}
          title="Preferences"
          description="Default country, currency and reminder preferences"
        />

        <SettingRow label="Default Currency" description="Preferred currency">
          <div style={{
            display: 'flex', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden',
          }}>
            {(['AED', 'INR'] as const).map((c) => (
              <button key={c} onClick={() => updatePref('defaultCurrency', c)}
                style={{
                  padding: '7px 16px', border: 'none',
                  background: prefs.defaultCurrency === c
                    ? 'var(--primary)' : 'transparent',
                  color: prefs.defaultCurrency === c ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 800,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Default Country" description="Primary country">
          <div style={{
            display: 'flex', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden',
          }}>
            {(['UAE', 'India'] as const).map((c) => (
              <button key={c} onClick={() => updatePref('defaultCountry', c)}
                style={{
                  padding: '7px 13px', border: 'none',
                  background: prefs.defaultCountry === c
                    ? 'var(--primary)' : 'transparent',
                  color: prefs.defaultCountry === c ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontSize: 13, fontWeight: 800,
                }}
              >
                {c === 'UAE' ? '🇦🇪 UAE' : '🇮🇳 India'}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Remittance Reminder Day"
          description="Day of month to remind yourself to send money home"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={28}
              value={prefs.remittanceReminderDay}
              onChange={(e) => {
                const val = Math.min(28, Math.max(1, Number(e.target.value || 1)));
                updatePref('remittanceReminderDay', val);
              }}
              style={{
                width: 64, padding: '7px 10px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg)', color: 'var(--text)',
                fontSize: 13, textAlign: 'center', outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>of month</span>
          </div>
        </SettingRow>

        <SettingRow label="Theme" description="Appearance preference">
          <div style={{
            display: 'flex', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden',
          }}>
            {[
              { value: 'light',  icon: <Sun size={13} />,       label: 'Light' },
              { value: 'system', icon: <Smartphone size={13} />, label: 'Auto'  },
              { value: 'dark',   icon: <Moon size={13} />,       label: 'Dark'  },
            ].map((item) => (
              <button key={item.value}
                onClick={() => updatePref('theme', item.value as UserPrefs['theme'])}
                style={{
                  padding: '7px 11px', border: 'none',
                  background: prefs.theme === item.value
                    ? 'var(--primary)' : 'transparent',
                  color: prefs.theme === item.value ? '#fff' : 'var(--muted)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      {/* ── Notifications ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader
          icon={<Bell size={16} />}
          title="Notifications"
          description="Saved notification preferences"
        />
        <SettingRow label="Budget Alerts" description="Notify when over budget">
          <Toggle value={prefs.notifications.budgetAlerts}
            onChange={(v) => updateNotification('budgetAlerts', v)} />
        </SettingRow>
        <SettingRow label="Weekly Summary" description="Weekly finance summary">
          <Toggle value={prefs.notifications.weeklyReport}
            onChange={(v) => updateNotification('weeklyReport', v)} />
        </SettingRow>
        <SettingRow label="Reminder Emails" description="Monthly reminders">
          <Toggle value={prefs.notifications.reminderEmails}
            onChange={(v) => updateNotification('reminderEmails', v)} />
        </SettingRow>
      </div>

      {/* ── Export ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader
          icon={<Download size={16} />}
          title="Export Data"
          description="Download your data as CSV files"
        />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))',
          gap: 12, marginBottom: 12,
        }}>
          {EXPORT_TARGETS.map((item) => (
            <button key={item.key}
              onClick={() => handleExport(item.key)}
              disabled={exporting !== null}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 14, borderRadius: 12,
                border: '1px solid var(--border)',
                background: exporting === item.key
                  ? item.color + '15' : 'var(--bg)',
                cursor: exporting !== null ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: exporting !== null && exporting !== item.key ? 0.6 : 1,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: item.color + '18',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: item.color, flexShrink: 0,
              }}>
                {exporting === item.key ? (
                  <RefreshCw size={18}
                    style={{ animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <ExportIcon iconType={item.iconType} size={18} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4,
                }}>
                  {item.description}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>

        <button onClick={() => handleExport('all')} disabled={exporting !== null}
          style={{
            width: '100%', padding: 14, borderRadius: 12,
            border: '2px dashed var(--border)', background: 'transparent',
            cursor: exporting !== null ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
            color: 'var(--primary)', fontSize: 14, fontWeight: 900,
            opacity: exporting !== null ? 0.7 : 1,
          }}
        >
          {exporting === 'all' ? (
            <>
              <RefreshCw size={16}
                style={{ animation: 'spin 0.8s linear infinite' }} />
              Exporting all…
            </>
          ) : (
            <><Download size={16} /> Export All Data</>
          )}
        </button>
      </div>

      {/* ── App Info ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <SectionHeader icon={<Info size={16} />} title="App Information" />
        {[
          { label: 'App Name',   value: 'My Finance Pro'       },
          { label: 'Version',    value: '1.0.0'                },
          { label: 'Platform',   value: 'Progressive Web App'  },
          { label: 'Database',   value: 'Firebase Firestore'   },
          { label: 'Auth',       value: 'Google Login'         },
          { label: 'Currencies', value: 'AED + INR'            },
        ].map((item) => (
          <SettingRow key={item.label} label={item.label}>
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
              {item.value}
            </span>
          </SettingRow>
        ))}
      </div>

      {/* ── Danger Zone ── */}
      <div className="card" style={{
        padding: 20, border: '1px solid var(--danger)', marginBottom: 8,
      }}>
        <SectionHeader
          icon={<Trash2 size={16} />}
          title="Danger Zone"
          description="Irreversible actions — proceed with caution"
        />
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '12px 14px', borderRadius: 12,
          background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 14,
        }}>
          <AlertTriangle size={16} style={{ color: '#f97316', marginTop: 2 }} />
          <div style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.5 }}>
            Please export your data before reset. Actions cannot be undone.
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: 14, background: 'var(--bg)',
          borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
          marginBottom: 12, gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Reset All My Data
            </div>
            <div style={{
              fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5,
            }}>
              Permanently delete all transactions, cards, debts,
              savings, remittances, budgets and settings.
            </div>
          </div>
          <button onClick={handleResetAllMyData} disabled={resettingData}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'var(--danger)', color: '#fff', border: 'none',
              cursor: resettingData ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: resettingData ? 0.7 : 1,
            }}
          >
            <Trash2 size={14} />
            {resettingData ? 'Resetting…' : 'Reset Data'}
          </button>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: 14, background: 'var(--bg)',
          borderRadius: 10, border: '1px solid var(--border)',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
              Reset Settings Only
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Reset preferences without deleting finance data.
            </div>
          </div>
          <button onClick={handleResetSettingsOnly}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'var(--border)', color: 'var(--text)', border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Trash2 size={14} /> Reset Settings
          </button>
        </div>
      </div>

      {/* Saving indicator */}
      {(saving || savingBal || savingCredit || resettingData) && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24,
          background: resettingData ? 'var(--danger)' : 'var(--primary)',
          color: '#fff', padding: '10px 16px', borderRadius: 10,
          fontSize: 13, fontWeight: 800,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 999,
        }}>
          <RefreshCw size={14}
            style={{ animation: 'spin 0.8s linear infinite' }} />
          {resettingData ? 'Resetting…' : 'Saving…'}
        </div>
      )}
    </div>
  );
}