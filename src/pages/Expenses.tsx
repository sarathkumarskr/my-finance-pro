> t.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setTransactions(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [user.uid]);

  const uniqueCategories = Array.from(new Set([...defaultExpenseCategories.map(c => c.name), ...transactions.map(t => t.category).filter(Boolean)]));
  const uniqueSubCategories = Array.from(new Set(transactions.filter(t => t.category === category && t.subCategory).map(t => t.subCategory as string)));

  const modalMethods = paymentMethods.filter((pm) =>
    currency === 'AED' ? pm.country === 'UAE' || pm.country === 'Both' : pm.country === 'India'
  );

  useEffect(() => {
    if (modalMethods.length > 0 && !paymentMethodId && !editingId) {
      setPaymentMethodId(modalMethods[0].id);
    }
  }, [currency, modalMethods, paymentMethodId, editingId]);

  const openAddModal = () => {
    setEditingId(null); setAmount(''); setCurrency('AED');
    setCategory('Food'); setSubCategory(''); setDate(getToday());
    setPaymentMethodId(''); setNote(''); setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTxId(tx.id ?? null);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!amount || Number.isNaN(val) || val <= 0) { toast.error('Enter a valid amount'); return; }
    if (!paymentMethodId) { toast.error('Please specify active payment method'); return; }
    if (!category.trim()) { toast.error('Please specify a category'); return; }

    setSaving(true);
    const selectedPM = paymentMethods.find((m) => m.id === paymentMethodId);

    const payload = {
      userId: user.uid, type: 'expense' as const, amount: val, currency,
      category: category.trim(), subCategory: subCategory.trim() ? subCategory.trim() : null,
      date, paymentMethodId, paymentMethod: selectedPM?.type || null,
      paymentMethodName: selectedPM?.name || null, paymentMethodType: selectedPM?.type || null,
      note: note.trim() === '' ? null : note.trim(),
      country: currency === 'AED' ? ('UAE' as const) : ('India' as const),
      debitAccountId: '5000', creditAccountId: paymentMethodId,
      updatedAt: Timestamp.now(),
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), payload);
        toast.success('Expense ledger updated');
      } else {
        await postDoubleEntry(payload);
        toast.success('Expense entry posted to GL');
      }
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Ledger posting failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Permanently wipe this expense log instance?')) {
      try { await deleteDoc(doc(db, 'transactions', id)); toast.success('Expense tracking index removed'); }
      catch (err) { console.error(err); toast.error('Action aborted by execution framework'); }
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterCountry === 'ALL') return true;
    return t.country === filterCountry;
  });

  const totalExpense = filteredTransactions.reduce((s, t) => s + t.amount, 0);
  const thisMonthExpense = filteredTransactions.filter((t) => t.date.startsWith(getToday().slice(0, 7))).reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ padding: '22px 16px 40px', maxWidth: 900, margin: '0 auto', color: 'var(--text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 800, letterSpacing: 0.5 }}>EXPENSE LEDGER</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>Expenses Review</div>
        </div>
        <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--danger)', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 14, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
          <Plus size={16} /> Add Expense
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Total Expenses</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--danger)' }}>{formatCurrency(totalExpense, currency)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>This Month</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{formatCurrency(thisMonthExpense, currency)}</div>
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Records</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>{filteredTransactions.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--card)', padding: 6, borderRadius: 12, border: '1px solid var(--border)', width: 'fit-content' }}>
        {(['ALL', 'UAE', 'India'] as const).map((c) => (
          <button key={c} onClick={() => setFilterCountry(c)} style={{ border: 'none', background: filterCountry === c ? 'var(--danger)' : 'transparent', color: 'var(--text)', padding: '7px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
            {c === 'ALL' ? '\uD83C\uDF0D All' : c === 'UAE' ? '\uD83C\uDDE6\uD83C\uDDEA UAE' : '\uD83C\uDDEE\uD83C\uDDF3 India'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 42, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Loading expense records...</div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', background: 'var(--card)', borderRadius: 18, border: '1px solid var(--border)' }}>
          <ReceiptText size={34} style={{ marginBottom: 10, opacity: 0.35 }} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>No registered expenses tracked</div>
          <div style={{ fontSize: 13, marginTop: 5 }}>Click Add Expense to append your first sheet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filteredTransactions.map((tx) => (
            <div key={tx.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 17, padding: '14px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: '220px', flex: 1 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(239, 44, 44, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
                  {cardTypeIcon[tx.paymentMethod || ''] || '\uD83D\uDCB3'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.category}{tx.subCategory && <span style={{ opacity: 0.6, fontSize: 14, fontWeight: 700 }}> \u203A {tx.subCategory}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.paymentMethodName || 'Unknown Pool'} \u2022 {tx.date}
                  </div>
                  {tx.note && (<div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 2 }}>"{tx.note}"</div>)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginLeft: 'auto', flexShrink: 0 }}>
                <span style={{ color: 'var(--danger)', fontWeight: 900, fontSize: 16, whiteSpace: 'nowrap' }}>
                  -{tx.currency === 'INR' ? '\u20B9' : 'AED '}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: tx.currency === 'AED' ? 2 : 0, maximumFractionDigits: 2 })}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onClick={(e) => { e.stopPropagation(); setEditingTxId(tx.id ?? null); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', padding: 6, borderRadius: 8, pointerEvents: 'auto', display: 'flex', alignItems: 'center' }}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(tx.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: '26px 26px 0 0', padding: '24px 20px 44px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -20px 50px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                  <ReceiptText size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 19 }}>{editingId ? 'Edit Expense Record' : 'Post Expense'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Double-entry ledger posting</div>
                </div>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'var(--bg)', border: 'none', borderRadius: 12, padding: 9, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Amount *</label>
                <input type="number" inputMode="decimal" step="any" placeholder="0.00" required value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, fontSize: 20, fontWeight: 800 }} />
              </div>
              <div>
                <label style={labelStyle}>Currency *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['AED', 'INR'] as const).map((c) => {
                    const active = currency === c;
                    return (
                      <button key={c} type="button" onClick={() => { setCurrency(c); setPaymentMethodId(''); }} style={{ padding: '11px 10px', borderRadius: 12, border: `2px solid ${active ? 'var(--danger)' : 'var(--border)'}`, background: active ? 'var(--danger)' : 'var(--card)', color: active ? '#fff' : 'var(--text)', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
                        {c === 'AED' ? '\uD83C\uDDE6 AED' : '\uD83C\uDDEE\uD83C\uDDF3 INR'}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Payment Method (Credit) *</label>
                {modalMethods.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: 'var(--danger)' }}>No channels specified for {currency}. Configure assets in Cards channel first.</div>
                ) : (
                  <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} style={inputStyle}>
                    <option value="">Select source account</option>
                    {modalMethods.map((m) => (<option key={m.id} value={m.id}>{cardTypeIcon[m.type] || '\uD83D\uDCB3'} {m.name} {m.bankName ? `(${m.bankName})` : ''}</option>))}
                  </select>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Category (Debit) *</label>
                  <input type="text" list="expense-categories-list" placeholder="e.g. Food, Rent" required value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} />
                  <datalist id="expense-categories-list">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label style={labelStyle}>Sub Category</label>
                  <input type="text" list="expense-sub-categories-list" placeholder="e.g. Groceries (Optional)" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} style={inputStyle} />
                  <datalist id="expense-sub-categories-list">{uniqueSubCategories.map(sc => <option key={sc} value={sc} />)}</datalist>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Note</label>
                <input type="text" placeholder="Optional descriptor details" value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
              </div>
              <button type="submit" disabled={saving} style={{ width: '100%', marginTop: 10, padding: '15px', borderRadius: 15, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--danger)', color: '#fff', fontWeight: 900, fontSize: 16, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Processing entry...' : editingId ? 'Update Ledger' : 'Confirm Expense Posting'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingTxId && (
        <TransactionEditor user={user} transactionId={editingTxId} onClose={() => setEditingTxId(null)} onUpdate={() => {}} />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}