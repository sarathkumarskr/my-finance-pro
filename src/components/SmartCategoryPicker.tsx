// src/components/SmartCategoryPicker.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, ChevronDown, Plus, X, Check, Star,
  TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  addGLAccount,
  getNextAccountCode,
} from '../firestoreHelpers';
import type { GLAccount, AccountClass } from '../firestoreHelpers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  value: string;                              // selected account code
  onChange: (code: string, account: GLAccount) => void;
  accounts: GLAccount[];                      // all GL accounts
  accountClass: AccountClass;                 // filter: 'Income' | 'Expense'
  allowCreate?: boolean;                      // show "Create new" option
  userId?: string;                            // needed if allowCreate=true
  placeholder?: string;
  disabled?: boolean;
}

// ─── Quick Create Modal ──────────────────────────────────────────────────────

interface QuickCreateProps {
  userId: string;
  accountClass: AccountClass;
  allAccounts: GLAccount[];
  initialName: string;
  onSuccess: (account: GLAccount) => void;
  onCancel: () => void;
}

const COMMON_ICONS = [
  '💰', '💳', '💵', '💸', '📊', '📈', '📉',
  '🏠', '🏦', '🏥', '🏢', '🚗', '✈️', '🍔',
  '🛒', '🛍️', '📱', '💡', '🎬', '📚', '🎁',
  '🪙', '🐾', '💄', '☕', '🍕', '🎮', '🏋️',
];

function QuickCreate({
  userId, accountClass, allAccounts, initialName,
  onSuccess, onCancel,
}: QuickCreateProps) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(accountClass === 'Income' ? '💰' : '💸');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      const code = getNextAccountCode(accountClass, allAccounts);
      const id = await addGLAccount({
        userId,
        code,
        name: name.trim(),
        accountClass,
        accountType: accountClass === 'Income' ? 'Other' : 'Variable',
        icon,
        isSystemAccount: false,
        isActive: true,
        isDefault: true, // newly created = show as default
        sortOrder: 999,
        parentCode: null,
        description: null,
      });
      const newAccount: GLAccount = {
        id, userId, code, name: name.trim(),
        accountClass,
        accountType: accountClass === 'Income' ? 'Other' : 'Variable',
        icon, isSystemAccount: false, isActive: true, isDefault: true,
        sortOrder: 999,
      };
      toast.success(`Created: ${icon} ${name}`);
      onSuccess(newAccount);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, padding: 16,
      }}
    >
      <div style={{
        background: 'var(--card)', borderRadius: 18,
        width: '100%', maxWidth: 380, padding: 22,
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
              QUICK CREATE
            </div>
            <div style={{ fontSize: 17, fontWeight: 900, marginTop: 2 }}>
              New {accountClass}
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: 'var(--bg)', border: 'none', borderRadius: 10,
            padding: 6, cursor: 'pointer',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Icon Picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
            Icon
          </label>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5,
            padding: 8, borderRadius: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            maxHeight: 130, overflowY: 'auto',
          }}>
            {COMMON_ICONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                style={{
                  aspectRatio: '1', borderRadius: 8,
                  border: icon === emoji ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: icon === emoji ? 'rgba(99,102,241,0.1)' : 'var(--card)',
                  cursor: 'pointer', fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6, display: 'block' }}>
            Account Name *
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Pet Care, Side Gig"
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', fontSize: 15, outline: 'none',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        {/* Preview */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              {name || 'Account name'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {accountClass}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: 11, borderRadius: 11,
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text)', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              flex: 2, padding: 11, borderRadius: 11, border: 'none',
              background: 'var(--primary)', color: '#fff',
              fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving || !name.trim() ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Plus size={15} />
            {saving ? 'Creating...' : 'Create & Select'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SmartCategoryPicker({
  value,
  onChange,
  accounts,
  accountClass,
  allowCreate = false,
  userId,
  placeholder = 'Select category',
  disabled = false,
}: Props) {

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter accounts: only this class, active, not a Group account
  const availableAccounts = useMemo(() => {
    return accounts.filter(a =>
      a.accountClass === accountClass &&
      a.isActive !== false &&
      a.accountType !== 'Group'
    );
  }, [accounts, accountClass]);

  // Selected account
  const selected = availableAccounts.find(a => a.code === value);

  // Filtered list based on search
  const filtered = useMemo(() => {
    if (!search.trim()) return availableAccounts;
    const q = search.toLowerCase();
    return availableAccounts.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.code.includes(q)
    );
  }, [availableAccounts, search]);

  // Split into Default and Other
  const defaultAccounts = filtered.filter(a => a.isDefault);
  const otherAccounts = filtered.filter(a => !a.isDefault);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = (acc: GLAccount) => {
    onChange(acc.code, acc);
    setOpen(false);
    setSearch('');
  };

  const handleQuickCreateSuccess = (newAccount: GLAccount) => {
    setShowQuickCreate(false);
    handleSelect(newAccount);
  };

  // ── Empty state: no accounts initialized ──
  if (accounts.length === 0) {
    return (
      <div style={{
        padding: 12, borderRadius: 10,
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        fontSize: 13, color: 'var(--warning)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        ⚠️ Initialize Chart of Accounts first (Accounts page).
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>

      {/* ── Selected Display / Trigger ── */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          width: '100%', padding: '11px 12px', borderRadius: 12,
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          background: 'var(--bg)', color: 'var(--text)',
          fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
          boxSizing: 'border-box', outline: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
          opacity: disabled ? 0.6 : 1,
          textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{selected.icon || '📋'}</span>
            <span style={{
              flex: 1, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selected.name}
            </span>
          </>
        ) : (
          <>
            <Search size={16} color="var(--muted)" />
            <span style={{ flex: 1, color: 'var(--muted)' }}>{placeholder}</span>
          </>
        )}
        <ChevronDown
          size={16}
          color="var(--muted)"
          style={{
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          zIndex: 1500,
          overflow: 'hidden',
          maxHeight: 380,
          display: 'flex', flexDirection: 'column',
        }}>

          {/* Search */}
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg)',
          }}>
            <Search size={15} color="var(--muted)" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type to search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                color: 'var(--text)', fontSize: 14, outline: 'none',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--muted)', padding: 0,
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 280 }}>

            {/* Empty filter result */}
            {filtered.length === 0 && (
              <div style={{
                padding: 24, textAlign: 'center', color: 'var(--muted)',
                fontSize: 13,
              }}>
                {search ? `No accounts match "${search}"` : 'No accounts available'}
              </div>
            )}

            {/* Default accounts */}
            {defaultAccounts.length > 0 && (
              <>
                <div style={{
                  padding: '8px 12px 4px',
                  fontSize: 10, fontWeight: 800, color: 'var(--muted)',
                  letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Star size={10} fill="currentColor" />
                  COMMON
                </div>
                {defaultAccounts.map(acc => (
                  <AccountOption
                    key={acc.code}
                    account={acc}
                    isSelected={acc.code === value}
                    onClick={() => handleSelect(acc)}
                  />
                ))}
              </>
            )}

            {/* Other accounts */}
            {otherAccounts.length > 0 && (
              <>
                {defaultAccounts.length > 0 && (
                  <div style={{
                    padding: '8px 12px 4px',
                    fontSize: 10, fontWeight: 800, color: 'var(--muted)',
                    letterSpacing: 0.5, marginTop: 4,
                    borderTop: '1px solid var(--border)',
                  }}>
                    ALL {accountClass.toUpperCase()}
                  </div>
                )}
                {otherAccounts.map(acc => (
                  <AccountOption
                    key={acc.code}
                    account={acc}
                    isSelected={acc.code === value}
                    onClick={() => handleSelect(acc)}
                  />
                ))}
              </>
            )}
          </div>

          {/* Create new */}
          {allowCreate && userId && (
            <button
              type="button"
              onClick={() => setShowQuickCreate(true)}
              style={{
                padding: '12px 14px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(99,102,241,0.06)',
                color: 'var(--primary)',
                border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%',
              }}
            >
              <Plus size={16} />
              {search.trim()
                ? `Create "${search}" as new account`
                : `Create new ${accountClass.toLowerCase()} account`}
            </button>
          )}
        </div>
      )}

      {/* Quick Create Modal */}
      {showQuickCreate && userId && (
        <QuickCreate
          userId={userId}
          accountClass={accountClass}
          allAccounts={accounts}
          initialName={search.trim()}
          onSuccess={handleQuickCreateSuccess}
          onCancel={() => setShowQuickCreate(false)}
        />
      )}
    </div>
  );
}

// ─── Account Option Row ──────────────────────────────────────────────────────

function AccountOption({
  account, isSelected, onClick,
}: {
  account: GLAccount;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', padding: '10px 12px',
        background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        color: 'var(--text)', textAlign: 'left',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.background = 'var(--bg)';
      }}
      onMouseLeave={e => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {account.icon || '📋'}
      </span>
      <span style={{
        flex: 1, fontWeight: isSelected ? 700 : 500, fontSize: 14,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {account.name}
      </span>
      {isSelected && (
        <Check size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
      )}
    </button>
  );
}