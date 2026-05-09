import { useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { updateProfile } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import {
  User as UserIcon,
  Settings,
  Download,
  Globe,
  Bell,
  Shield,
  ChevronRight,
  Edit3,
  Save,
  X,
  FileText,
  Database,
  Trash2,
  Info,
  Moon,
  Sun,
  Smartphone,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

type Currency = 'AED' | 'INR';
type Country = 'UAE' | 'India';

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
  createdAt?: any;
  updatedAt?: any;
};

const RESET_COLLECTIONS = [
  'transactions',
  'paymentMethods',
  'savingGoals',
  'debts',
  'debtPayments',
  'tabbyEMIs',
  'budgets',
  'remittances',
  'userPrefs',
  'budgetItems',
  'budgetMonthOverrides',
  'budgetIncome',
] as const;

const EXPORT_TARGETS = [
  {
    key: 'transactions',
    label: 'Transactions',
    collection: 'transactions',
    description: 'Income and expense records',
    icon: <FileText size={18} />,
    color: 'var(--primary)',
  },
  {
    key: 'paymentMethods',
    label: 'Payment Methods',
    collection: 'paymentMethods',
    description: 'Cards, cash, UPI, Tabby etc.',
    icon: <Database size={18} />,
    color: '#06b6d4',
  },
  {
    key: 'debts',
    label: 'Debts',
    collection: 'debts',
    description: 'Debt records',
    icon: <Database size={18} />,
    color: 'var(--warning)',
  },
  {
    key: 'debtPayments',
    label: 'Debt Payments',
    collection: 'debtPayments',
    description: 'Debt payment history',
    icon: <Database size={18} />,
    color: '#f97316',
  },
  {
    key: 'savingGoals',
    label: 'Saving Goals',
    collection: 'savingGoals',
    description: 'Savings goals and progress',
    icon: <Database size={18} />,
    color: 'var(--success)',
  },
  {
    key: 'remittances',
    label: 'Remittances',
    collection: 'remittances',
    description: 'AED to INR transfer history',
    icon: <Database size={18} />,
    color: '#8b5cf6',
  },
  {
    key: 'budgetItems',
    label: 'Budget Items',
    collection: 'budgetItems',
    description: 'Recurring forecast items',
    icon: <Database size={18} />,
    color: '#14b8a6',
  },
  {
    key: 'budgetMonthOverrides',
    label: 'Budget Overrides',
    collection: 'budgetMonthOverrides',
    description: 'Monthly modified amounts and paid status',
    icon: <Database size={18} />,
    color: '#ec4899',
  },
  {
    key: 'budgetIncome',
    label: 'Budget Income',
    collection: 'budgetIncome',
    description: 'Monthly salary and other income plan',
    icon: <Database size={18} />,
    color: '#22c55e',
  },
] as const;

type ExportType = (typeof EXPORT_TARGETS)[number]['key'] | 'all';

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

const prefsToFirestore = (prefs: UserPrefs) => {
  const { id, ...rest } = prefs;
  return rest;
};

const cleanForExport = (docs: any[]) =>
  docs.map((d) => {
    const clean: Record<string, any> = {};

    Object.entries(d).forEach(([key, value]) => {
      if (key === 'createdAt' || key === 'updatedAt') {
        clean[key] = (value as any)?.toDate
          ? (value as any).toDate().toISOString()
          : value;
      } else if (Array.isArray(value)) {
        clean[key] = JSON.stringify(value);
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = JSON.stringify(value);
      } else {
        clean[key] = value;
      }
    });

    return clean;
  });

const toCSV = (data: Record<string, any>[], filename: string) => {
  if (data.length === 0) {
    toast.error('No data to export');
    return false;
  }

  const headers = Object.keys(data[0]);

  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];

        if (value === null || value === undefined) return '';

        const str = String(value).replace(/"/g, '""');

        return str.includes(',') || str.includes('\n') || str.includes('"')
          ? `"${str}"`
          : str;
      })
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
  return true;
};

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--primary)' }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
          {title}
        </span>
      </div>

      {description && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--muted)',
            marginTop: '3px',
            marginLeft: '24px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '999px',
        background: value ? 'var(--primary)' : 'var(--border)',
        cursor: 'pointer',
        position: 'relative',
        border: 'none',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: value ? '23px' : '3px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: '1px solid var(--border)',
        gap: '16px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
          {label}
        </div>

        {description && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--muted)',
              marginTop: '2px',
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage({ user }: { user: User }) {
  const [prefs, setPrefs] = useState<UserPrefs>(defaultPrefs(user));
  const [prefsDocId, setPrefsDocId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.displayName || '');

  const [exporting, setExporting] = useState<ExportType | null>(null);
  const [resettingData, setResettingData] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, 'userPrefs'), where('userId', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          const first = snap.docs[0];
          const data = first.data() as UserPrefs;

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
        await setDoc(newDoc, {
          ...data,
          createdAt: serverTimestamp(),
        });
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

  const updatePref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    savePrefs(updated);
  };

  const updateNotification = (
    key: keyof UserPrefs['notifications'],
    value: boolean
  ) => {
    const updated = {
      ...prefs,
      notifications: {
        ...prefs.notifications,
        [key]: value,
      },
    };

    setPrefs(updated);
    savePrefs(updated);
  };

  const handleSaveName = async () => {
    const cleanName = nameInput.trim();

    if (!cleanName) {
      toast.error('Name cannot be empty');
      return;
    }

    setSaving(true);

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: cleanName });
      }

      const updated = {
        ...prefs,
        displayName: cleanName,
      };

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
        let exportedCount = 0;

        for (const target of EXPORT_TARGETS) {
          const snap = await getDocs(
            query(collection(db, target.collection), where('userId', '==', user.uid))
          );

          const data = cleanForExport(
            snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }))
          );

          if (data.length > 0) {
            const ok = toCSV(data, `myfinancepro_${target.key}`);
            if (ok) exportedCount++;

            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }

        if (exportedCount === 0) {
          toast.error('No data found to export');
        } else {
          toast.success(`Exported ${exportedCount} CSV file${exportedCount === 1 ? '' : 's'}`);
        }

        return;
      }

      const target = EXPORT_TARGETS.find((t) => t.key === type);

      if (!target) {
        toast.error('Invalid export type');
        return;
      }

      const snap = await getDocs(
        query(collection(db, target.collection), where('userId', '==', user.uid))
      );

      const data = cleanForExport(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );

      const ok = toCSV(data, `myfinancepro_${target.key}`);

      if (ok) toast.success(`${target.label} exported!`);
    } catch (err) {
      console.error(err);
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleResetAllMyData = async () => {
    const confirmText = window.prompt(
      'This will permanently delete ALL data for the currently logged-in account only.\n\nThis includes transactions, cards, debts, savings, remittances, budgets, forecast data and settings.\n\nType RESET to continue.'
    );

    if (confirmText !== 'RESET') {
      toast.error('Reset cancelled');
      return;
    }

    const secondConfirm = window.confirm(
      'Final confirmation: This cannot be undone. Continue?'
    );

    if (!secondConfirm) {
      toast.error('Reset cancelled');
      return;
    }

    setResettingData(true);

    try {
      let deletedCount = 0;

      for (const colName of RESET_COLLECTIONS) {
        const snap = await getDocs(
          query(collection(db, colName), where('userId', '==', user.uid))
        );

        const docs = snap.docs;

        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 400);

          chunk.forEach((d) => {
            batch.delete(doc(db, colName, d.id));
          });

          await batch.commit();
          deletedCount += chunk.length;
        }
      }

      setPrefsDocId(null);
      setPrefs(defaultPrefs(user));
      setNameInput(user.displayName || '');

      toast.success(
        `Reset complete. Deleted ${deletedCount} document${
          deletedCount === 1 ? '' : 's'
        }.`
      );
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

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div className="spinner" />
        <span style={{ color: 'var(--muted)', fontSize: '14px' }}>
          Loading settings…
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '820px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={28} style={{ color: 'var(--primary)' }} />
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 900,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            Settings
          </h1>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '6px' }}>
          Manage your profile, preferences, exports and account data.
        </p>
      </div>

      {/* Profile */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <SectionHeader
          icon={<UserIcon size={16} />}
          title="Profile"
          description="Your Google account and app profile information"
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            background: 'var(--bg)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              border: '2px solid var(--primary)',
            }}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '24px',
                  fontWeight: 900,
                }}
              >
                {user.displayName?.charAt(0) || 'U'}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '16px',
                fontWeight: 900,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {prefs.displayName || user.displayName || 'User'}
            </div>

            <div
              style={{
                fontSize: '13px',
                color: 'var(--muted)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.email}
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '7px',
                padding: '3px 8px',
                background: 'var(--primary)18',
                color: 'var(--primary)',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              <Shield size={11} /> Google Account
            </div>
          </div>
        </div>

        <SettingRow label="Display Name" description="Name shown inside the app">
          {editingName ? (
            <div
              style={{
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--primary)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  width: '170px',
                  outline: 'none',
                }}
                autoFocus
              />

              <button
                onClick={handleSaveName}
                disabled={saving}
                style={{
                  padding: '7px 11px',
                  borderRadius: '8px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
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
                  padding: '7px',
                  borderRadius: '8px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              <Edit3 size={13} /> Edit
            </button>
          )}
        </SettingRow>

        <SettingRow label="User ID" description="Firebase Auth UID">
          <span
            style={{
              fontSize: '11px',
              color: 'var(--muted)',
              fontFamily: 'monospace',
              background: 'var(--bg)',
              padding: '5px 8px',
              borderRadius: '7px',
              border: '1px solid var(--border)',
              maxWidth: '190px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {user.uid}
          </span>
        </SettingRow>
      </div>

      {/* Preferences */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <SectionHeader
          icon={<Globe size={16} />}
          title="Preferences"
          description="Default country, currency and reminder preferences"
        />

        <SettingRow
          label="Default Currency"
          description="Preferred currency for new records"
        >
          <div
            style={{
              display: 'flex',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '9px',
              overflow: 'hidden',
            }}
          >
            {(['AED', 'INR'] as const).map((c) => (
              <button
                key={c}
                onClick={() => updatePref('defaultCurrency', c)}
                style={{
                  padding: '7px 16px',
                  border: 'none',
                  background: prefs.defaultCurrency === c ? 'var(--primary)' : 'transparent',
                  color: prefs.defaultCurrency === c ? '#fff' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 800,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Default Country"
          description="Primary country for finance tracking"
        >
          <div
            style={{
              display: 'flex',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '9px',
              overflow: 'hidden',
            }}
          >
            {(['UAE', 'India'] as const).map((c) => (
              <button
                key={c}
                onClick={() => updatePref('defaultCountry', c)}
                style={{
                  padding: '7px 13px',
                  border: 'none',
                  background: prefs.defaultCountry === c ? 'var(--primary)' : 'transparent',
                  color: prefs.defaultCountry === c ? '#fff' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 800,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min={1}
              max={28}
              value={prefs.remittanceReminderDay}
              onChange={(e) => {
                const val = Math.min(28, Math.max(1, Number(e.target.value || 1)));
                updatePref('remittanceReminderDay', val);
              }}
              style={{
                width: '64px',
                padding: '7px 10px',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '13px',
                textAlign: 'center',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>of month</span>
          </div>
        </SettingRow>

        <SettingRow label="Theme" description="Appearance preference saved for future use">
          <div
            style={{
              display: 'flex',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '9px',
              overflow: 'hidden',
            }}
          >
            {[
              { value: 'light', icon: <Sun size={13} />, label: 'Light' },
              { value: 'system', icon: <Smartphone size={13} />, label: 'Auto' },
              { value: 'dark', icon: <Moon size={13} />, label: 'Dark' },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => updatePref('theme', item.value as UserPrefs['theme'])}
                style={{
                  padding: '7px 11px',
                  border: 'none',
                  background: prefs.theme === item.value ? 'var(--primary)' : 'transparent',
                  color: prefs.theme === item.value ? '#fff' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      {/* Notifications */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <SectionHeader
          icon={<Bell size={16} />}
          title="Notifications"
          description="Saved notification preferences for future alerts"
        />

        <SettingRow
          label="Budget Alerts"
          description="Notify when spending exceeds budget"
        >
          <Toggle
            value={prefs.notifications.budgetAlerts}
            onChange={(v) => updateNotification('budgetAlerts', v)}
          />
        </SettingRow>

        <SettingRow label="Weekly Summary" description="Weekly finance summary">
          <Toggle
            value={prefs.notifications.weeklyReport}
            onChange={(v) => updateNotification('weeklyReport', v)}
          />
        </SettingRow>

        <SettingRow
          label="Reminder Emails"
          description="Monthly reminder preferences"
        >
          <Toggle
            value={prefs.notifications.reminderEmails}
            onChange={(v) => updateNotification('reminderEmails', v)}
          />
        </SettingRow>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            padding: '10px 12px',
            background: 'var(--bg)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            marginTop: '8px',
          }}
        >
          <Info
            size={14}
            style={{ color: 'var(--muted)', flexShrink: 0, marginTop: '2px' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
            Push/email notifications are preference settings for future notification
            integration.
          </span>
        </div>
      </div>

      {/* Export Data */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <SectionHeader
          icon={<Download size={16} />}
          title="Export Data"
          description="Download your data as CSV files before backup/reset"
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          {EXPORT_TARGETS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleExport(item.key)}
              disabled={exporting !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: exporting === item.key ? item.color + '15' : 'var(--bg)',
                cursor: exporting !== null ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                opacity: exporting !== null && exporting !== item.key ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: item.color + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: item.color,
                  flexShrink: 0,
                }}
              >
                {exporting === item.key ? (
                  <RefreshCw
                    size={18}
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  />
                ) : (
                  item.icon
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    marginTop: '2px',
                    lineHeight: 1.4,
                  }}
                >
                  {item.description}
                </div>
              </div>

              <ChevronRight
                size={16}
                style={{ color: 'var(--muted)', flexShrink: 0 }}
              />
            </button>
          ))}
        </div>

        <button
          onClick={() => handleExport('all')}
          disabled={exporting !== null}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '12px',
            border: '2px dashed var(--border)',
            background: 'transparent',
            cursor: exporting !== null ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--primary)',
            fontSize: '14px',
            fontWeight: 900,
            opacity: exporting !== null ? 0.7 : 1,
          }}
        >
          {exporting === 'all' ? (
            <>
              <RefreshCw size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
              Exporting all…
            </>
          ) : (
            <>
              <Download size={16} />
              Export All Data
            </>
          )}
        </button>
      </div>

      {/* App Info */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <SectionHeader icon={<Info size={16} />} title="App Information" />

        {[
          { label: 'App Name', value: 'My Finance Pro' },
          { label: 'Version', value: '1.0.0' },
          { label: 'Platform', value: 'Progressive Web App' },
          { label: 'Database', value: 'Firebase Firestore' },
          { label: 'Auth', value: 'Google Login' },
          { label: 'Currencies', value: 'AED + INR' },
        ].map((item) => (
          <SettingRow key={item.label} label={item.label}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 700 }}>
              {item.value}
            </span>
          </SettingRow>
        ))}
      </div>

      {/* Danger Zone */}
      <div
        className="card"
        style={{
          padding: '20px',
          border: '1px solid var(--danger)',
          marginBottom: '8px',
        }}
      >
        <SectionHeader
          icon={<Trash2 size={16} />}
          title="Danger Zone"
          description="Irreversible actions — proceed with caution"
        />

        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            padding: '12px 14px',
            borderRadius: '12px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            marginBottom: '14px',
          }}
        >
          <AlertTriangle size={16} style={{ color: '#f97316', marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#9a3412', lineHeight: 1.5 }}>
            Please export your data before reset. Reset actions cannot be undone.
          </div>
        </div>

        {/* Reset all finance data */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px',
            background: 'var(--bg)',
            borderRadius: '10px',
            border: '1px solid var(--danger)30',
            marginBottom: '12px',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              Reset All My Data
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted)',
                marginTop: '2px',
                lineHeight: 1.5,
              }}
            >
              Permanently delete all data for this logged-in account only:
              transactions, cards, debts, savings, remittances, budgets, forecast data
              and settings.
            </div>
          </div>

          <button
            onClick={handleResetAllMyData}
            disabled={resettingData}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              cursor: resettingData ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: resettingData ? 0.7 : 1,
            }}
          >
            <Trash2 size={14} />
            {resettingData ? 'Resetting…' : 'Reset Data'}
          </button>
        </div>

        {/* Reset settings only */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px',
            background: 'var(--bg)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              Reset Settings Only
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              Reset preferences to default values without deleting finance data.
            </div>
          </div>

          <button
            onClick={handleResetSettingsOnly}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: 'var(--border)',
              color: 'var(--text)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Trash2 size={14} />
            Reset Settings
          </button>
        </div>
      </div>

      {/* Saving indicator */}
      {(saving || resettingData) && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '24px',
            background: resettingData ? 'var(--danger)' : 'var(--primary)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 999,
          }}
        >
          <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
          {resettingData ? 'Resetting…' : 'Saving…'}
        </div>
      )}
    </div>
  );
}