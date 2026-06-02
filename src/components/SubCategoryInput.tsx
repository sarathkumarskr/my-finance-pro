// src/components/SubCategoryInput.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface Transaction {
  id: string;
  category?: string;
  subCategory?: string | null;
  date: string;
  isReversed?: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  category: string;                    // current selected category
  transactions: Transaction[];         // for suggestions
  placeholder?: string;
  disabled?: boolean;
  maxSuggestions?: number;
}

export default function SubCategoryInput({
  value,
  onChange,
  category,
  transactions,
  placeholder = 'Type or pick from history...',
  disabled = false,
  maxSuggestions = 8,
}: Props) {

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute suggestions: subcategories used in same category
  const suggestions = useMemo(() => {
    if (!category) return [];

    const counts = new Map<string, { count: number; lastDate: string }>();
    transactions.forEach(t => {
      if (t.isReversed) return;
      if (t.category !== category) return;
      if (!t.subCategory) return;

      const sub = t.subCategory.trim();
      if (!sub) return;

      const existing = counts.get(sub);
      if (existing) {
        existing.count++;
        if (t.date > existing.lastDate) existing.lastDate = t.date;
      } else {
        counts.set(sub, { count: 1, lastDate: t.date });
      }
    });

    return Array.from(counts.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => {
        // Sort by count desc, then date desc
        if (b.count !== a.count) return b.count - a.count;
        return b.lastDate.localeCompare(a.lastDate);
      });
  }, [transactions, category]);

  // Filter by current input
  const filtered = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, maxSuggestions);
    const q = value.toLowerCase();
    return suggestions
      .filter(s => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q)
      .slice(0, maxSuggestions);
  }, [suggestions, value, maxSuggestions]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>

      {/* Input */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%', padding: '11px 12px',
            paddingRight: value || suggestions.length > 0 ? 60 : 12,
            borderRadius: 12,
            border: `1px solid ${open && filtered.length > 0 ? 'var(--primary)' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text)',
            fontSize: 14, outline: 'none', boxSizing: 'border-box',
            opacity: disabled ? 0.6 : 1,
          }}
        />

        {/* Clear / Chevron */}
        <div style={{
          position: 'absolute', right: 8, top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); inputRef.current?.focus(); }}
              style={{
                background: 'var(--card)', border: 'none', borderRadius: 6,
                padding: 4, cursor: 'pointer', color: 'var(--muted)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <X size={12} />
            </button>
          )}
          {suggestions.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(!open); inputRef.current?.focus(); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', padding: 4,
                display: 'flex', alignItems: 'center',
              }}
            >
              <ChevronDown
                size={14}
                style={{
                  transition: 'transform 0.15s',
                  transform: open ? 'rotate(180deg)' : 'rotate(0)',
                }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 1500,
          maxHeight: 240, overflowY: 'auto',
        }}>
          <div style={{
            padding: '6px 12px',
            fontSize: 10, fontWeight: 800, color: 'var(--muted)',
            letterSpacing: 0.5,
            borderBottom: '1px solid var(--border)',
          }}>
            {value.trim() ? 'MATCHING' : 'RECENT IN THIS CATEGORY'}
          </div>
          {filtered.map(s => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleSelect(s.name)}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'transparent',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: 'var(--text)', textAlign: 'left', fontSize: 14,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: 500,
              }}>
                {s.name}
              </span>
              <span style={{
                fontSize: 11, color: 'var(--muted)', marginLeft: 8,
                padding: '2px 7px', borderRadius: 10,
                background: 'rgba(99,102,241,0.1)',
                fontWeight: 700, flexShrink: 0,
              }}>
                {s.count}×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}