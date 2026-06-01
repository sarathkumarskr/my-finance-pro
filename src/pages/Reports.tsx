import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import toast from 'react-hot-toast';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, Calendar, PieChart as PieIcon, RefreshCw, Send,
  TrendingDown, TrendingUp, Scale, CheckCircle, AlertTriangle, Info,
  Edit2, Filter, Download, Search, Wallet,
} from 'lucide-react';
import { GL_ACCOUNTS, formatCurrency, type Currency } from '../firestoreHelpers';
import TransactionEditor from '../components/TransactionEditor';

type Transaction = {
  id?: string; userId?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number; currency: Currency;
  country?: 'UAE' | 'India'; category?: string;
  date: string; debitAccountId?: string; creditAccountId?: string;
  baseAmountAED?: number; paymentMethodId?: string;
  paymentMethodName?: string; fromMethod?: string; toMethod?: string;
  note?: string; isReversed?: boolean;
};

type PaymentMethod = {
  id: string; name: string; type: string;
  country: 'UAE' | 'India' | 'Both'; bankName?: string;
};

type Remittance = {
  id?: string; userId?: string;
  amountAED?: number; amountINR?: number;
  aedAmount?: number; inrAmount?: number;
  exchangeRate?: number; rate?: number; date: string;
};

type SavingGoal = {
  id?: string; userId?: string; name: string;
  targetAmount?: number; savedAmount?: number;
  currentAmount?: number; currency: Currency; deadline?: string;
};

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);
const getMonthKey = (date: string) => (date || '').slice(0, 7);
const pad2 = (n: number) => String(n).padStart(2, '0');
const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };

const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
};
const getPastMonthsFrom = (endMonth: string, count: number) => {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) months.push(addMonths(endMonth, -i));
  return months;
};
const getMonthLabel = (month: string) => {
  const [y, m] = month.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m)-1]||m} ${(y||'').slice(2)}`;
};
const getLongMonthLabel = (month: string) => {
  if (!month) return '';
  const [y, m] = month.split('-');
  return new Date(Number(y), Number(m)-1, 1).toLocaleString('en-US', { month:'long', year:'numeric' });
};
const num = (v: any) => Number(v || 0);
const getRemAED = (r: Remittance) => num(r.amountAED ?? r.aedAmount);
const getRemINR = (r: Remittance) => num(r.amountINR ?? r.inrAmount);
const getRemRate = (r: Remittance) => {
  const explicit = num(r.exchangeRate ?? r.rate);
  if (explicit > 0) return explicit;
  const aed = getRemAED(r); const inr = getRemINR(r);
  return aed > 0 ? inr / aed : 0;
};
const getLatestDataMonth = (transactions: Transaction[], remittances: Remittance[], goals: SavingGoal[]) => {
  const months = [...transactions.map(t=>getMonthKey(t.date)),...remittances.map(r=>getMonthKey(r.date)),...goals.map(g=>getMonthKey(g.deadline||''))].filter(Boolean);
  if (months.length === 0) return getCurrentMonth();
  return months.sort().reverse()[0];
};
const fmt = (amount: number, currency: Currency) => currency === 'AED' ? `AED ${amount.toLocaleString('en-US',{maximumFractionDigits:0})}` : `\u20B9${amount.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const shortNum = (v: number, currency?: Currency) => {
  if (currency === 'INR') return `\u20B9${(v/1000).toFixed(0)}k`;
  if (currency === 'AED') return `${(v/1000).toFixed(0)}k`;
  return `${(v/1000).toFixed(0)}k`;
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'12px', padding:'10px 14px', boxShadow:'0 4px 20px rgba(0,0,0,0.3)', fontSize:'13px' }}>
      <div style={{ color:'var(--muted)', fontWeight:700, marginBottom:'6px' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:p.color||p.fill }} />
          <span style={{ color:'var(--muted)' }}>{p.name}:</span>
          <span style={{ fontWeight:800, color:'var(--text)' }}>{typeof p.value==='number'?p.value.toLocaleString():p.value}</span>
        </div>
      ))}
    </div>
  );
};

function ReportCard({ title, subtitle, icon, children }: { title:string; subtitle?:string; icon:ReactNode; children:ReactNode }) {
  return (
    <div className="card" style={{ padding:'20px', marginBottom:'20px', background:'var(--card)', border:'1px solid var(--border)', borderRadius:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'18px' }}>
        <div style={{ width:'36px', height:'36px', borderRadius:'11px', background:'var(--bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--primary)', flexShrink:0 }}>{icon}</div>
        <div>
          <div style={{ fontWeight:800, fontSize:'15px', color:'var(--text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label:string; value:string; color:string }) {
  return (
    <div style={{ padding:'14px 16px', borderRadius:'14px', background:'var(--card)', border:'1px solid var(--border)', minWidth:'160px', flex:1 }}>
      <div style={{ fontSize:'11px', color:'var(--muted)', marginBottom:'6px', fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:'18px', fontWeight:900, color }}>{value}</div>
    </div>
  );
}

export default function Reports({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<'charts'|'trial_balance'|'ledger'>('charts');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [remittances, setRemittances] = useState<Remittance[]>([]);
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<6|12>(6);
  const [currencyFilter, setCurrencyFilter] = useState<'AED'|'INR'|'both'>('AED');
  const [endMonth, setEndMonth] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [accountSearch, setAccountSearch] = useState('All Accounts');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all'|'income'|'expense'|'transfer'>('all');
  const [sortField, setSortField] = useState<'date'|'amount'|'category'>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [editingTxId, setEditingTxId] = useState<string|null>(null);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return paymentMethods;
    const q = accountSearch.toLowerCase();
    return paymentMethods.filter(pm =>
      pm.name.toLowerCase().includes(q) ||
      pm.country.toLowerCase().includes(q) ||
      (pm.bankName||'').toLowerCase().includes(q) ||
      pm.type.toLowerCase().includes(q)
    );
  }, [paymentMethods, accountSearch]);

  const loadReports = async (showToast=false, forceLatestMonth=false) => {
    setLoading(true);
    try {
      const [txResult, remResult, goalsResult, pmResult] = await Promise.allSettled([
        getDocs(query(collection(db,'transactions'),where('userId','==',user.uid))),
        getDocs(query(collection(db,'remittances'),where('userId','==',user.uid))),
        getDocs(query(collection(db,'savingGoals'),where('userId','==',user.uid))),
        getDocs(query(collection(db,'paymentMethods'),where('userId','==',user.uid))),
      ]);
      let txData:Transaction[]=[], remData:Remittance[]=[], goalsData:SavingGoal[]=[];
      if (txResult.status==='fulfilled') { txData=txResult.value.docs.map(d=>({id:d.id,...d.data()})) as Transaction[]; setTransactions(txData); }
      if (remResult.status==='fulfilled') { remData=remResult.value.docs.map(d=>({id:d.id,...d.data()})) as Remittance[]; setRemittances(remData); }
      if (goalsResult.status==='fulfilled') { goalsData=goalsResult.value.docs.map(d=>({id:d.id,...d.data()})) as SavingGoal[]; setSavingGoals(goalsData); }
      if (pmResult.status==='fulfilled') setPaymentMethods(pmResult.value.docs.map(d=>({id:d.id,...d.data()})) as PaymentMethod[]);
      const latest = getLatestDataMonth(txData, remData, goalsData);
      setEndMonth(prev => { if(forceLatestMonth) return latest; if(!prev) return latest; return prev; });
      if (showToast) toast.success('Analytics updated');
    } catch(err) { console.error(err); toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if(!user?.uid) return; loadReports(false,true); }, [user.uid]);

  const months = useMemo(() => getPastMonthsFrom(endMonth||getCurrentMonth(), period), [endMonth, period]);
  const rangeLabel = months.length>0 ? `${getLongMonthLabel(months[0])} \u2192 ${getLongMonthLabel(months[months.length-1])}` : '';

  const getAccountName = (id:string):string => {
    if(!id) return 'Unknown';
    const pm = paymentMethods.find(p=>p.id===id);
    if(pm) return pm.name;
    const gl = GL_ACCOUNTS[id];
    if(gl) return gl.name;
    return `Acc: ${id.substring(0,6)}`;
  };

  // LEDGER ENGINE
  const ledgerEntries = useMemo(() => {
    let filtered = [...transactions];
    if(selectedAccount!=='all') filtered = filtered.filter(tx => tx.paymentMethodId===selectedAccount || tx.fromMethod===selectedAccount || tx.toMethod===selectedAccount || tx.debitAccountId===selectedAccount || tx.creditAccountId===selectedAccount);
    if(ledgerTypeFilter!=='all') filtered = filtered.filter(tx => tx.type===ledgerTypeFilter);
    if(ledgerDateFrom) filtered = filtered.filter(tx => tx.date>=ledgerDateFrom);
    if(ledgerDateTo) filtered = filtered.filter(tx => tx.date<=ledgerDateTo);
    if(ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      filtered = filtered.filter(tx => (tx.category||'').toLowerCase().includes(q)||(tx.note||'').toLowerCase().includes(q)||(tx.paymentMethodName||'').toLowerCase().includes(q)||getAccountName(tx.paymentMethodId||'').toLowerCase().includes(q));
    }
    filtered.sort((a,b) => {
      let cmp=0;
      if(sortField==='date') cmp=a.date.localeCompare(b.date);
      else if(sortField==='amount') cmp=a.amount-b.amount;
      else if(sortField==='category') cmp=(a.category||'').localeCompare(b.category||'');
      return sortDir==='asc'?cmp:-cmp;
    });
    let runningBalance=0;
    return filtered.map(tx => {
      let effect=0;
      if(selectedAccount!=='all') {
        if(tx.type==='income'&&tx.paymentMethodId===selectedAccount) effect=tx.amount;
        if(tx.type==='expense'&&tx.paymentMethodId===selectedAccount) effect=-tx.amount;
        if(tx.type==='transfer') { if(tx.fromMethod===selectedAccount) effect=-tx.amount; if(tx.toMethod===selectedAccount) effect=tx.amount; }
      } else { if(tx.type==='income') effect=tx.amount; if(tx.type==='expense') effect=-tx.amount; }
      runningBalance+=effect;
      return {...tx, effect, runningBalance, accountName:getAccountName(tx.paymentMethodId||tx.fromMethod||'')};
    });
  }, [transactions, selectedAccount, ledgerTypeFilter, ledgerDateFrom, ledgerDateTo, ledgerSearch, sortField, sortDir]);

  const ledgerTotals = useMemo(() => {
    const totalIncome = ledgerEntries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount,0);
    const totalExpense = ledgerEntries.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount,0);
    const totalTransfer = ledgerEntries.filter(e=>e.type==='transfer').reduce((s,e)=>s+e.amount,0);
    return { totalIncome, totalExpense, totalTransfer, net:totalIncome-totalExpense, count:ledgerEntries.length };
  }, [ledgerEntries]);

  const exportCSV = () => {
    const headers = ['Date','Type','Category','Account','Amount','Currency','Note','Effect','Running Balance'];
    const rows = ledgerEntries.map(e => [e.date, e.type, e.category||'', e.accountName, e.amount.toString(), e.currency, (e.note||'').replace(/,/g,';'), e.effect.toString(), e.runningBalance.toString()]);
    const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download=`ledger_${selectedAccount}_${getToday()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  const toggleSort = (field:'date'|'amount'|'category') => {
    if(sortField===field) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // TRIAL BALANCE
  const trialBalance = useMemo(() => {
    const balances:Record<string,number>={};
    transactions.forEach(tx => {
      if(tx.debitAccountId&&tx.creditAccountId) {
        const glAmount = tx.baseAmountAED?Number(tx.baseAmountAED):(tx.currency==='INR'?Number(tx.amount)/22.8:Number(tx.amount));
        balances[tx.debitAccountId]=(balances[tx.debitAccountId]||0)+glAmount;
        balances[tx.creditAccountId]=(balances[tx.creditAccountId]||0)-glAmount;
      }
    });
    let totalDebits=0, totalCredits=0;
    const rows=[];
    for(const [accId,balance] of Object.entries(balances)) {
      if(Math.abs(balance)<0.01) continue;
      let accName='Unknown Account', accClass='Unknown';
      if(GL_ACCOUNTS[accId]) { accName=GL_ACCOUNTS[accId].name; accClass=GL_ACCOUNTS[accId].accountClass; }
      else { const pm=paymentMethods.find(p=>p.id===accId); if(pm){accName=pm.name;accClass=pm.type==='credit'?'Liability':'Asset';} else accName=`Acc: ${accId.substring(0,6)}`; }
      const isDebit=balance>0; const absVal=Math.abs(balance);
      if(isDebit) totalDebits+=absVal; else totalCredits+=absVal;
      rows.push({id:accId,name:accName,type:accClass,debit:isDebit?absVal:null,credit:!isDebit?absVal:null});
    }
    rows.sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
    return {rows,totalDebits,totalCredits,isBalanced:Math.abs(totalDebits-totalCredits)<0.01,hasEntries:rows.length>0};
  }, [transactions, paymentMethods]);

  // CHART DATA
  const incomeExpenseData = useMemo(() => months.map(month => {
    const monthTx = transactions.filter(t=>getMonthKey(t.date)===month);
    const aedIncome=monthTx.filter(t=>t.type==='income'&&t.currency==='AED').reduce((s,t)=>s+num(t.amount),0);
    const aedExpense=monthTx.filter(t=>t.type==='expense'&&t.currency==='AED').reduce((s,t)=>s+num(t.amount),0);
    const inrIncome=monthTx.filter(t=>t.type==='income'&&t.currency==='INR').reduce((s,t)=>s+num(t.amount),0);
    const inrExpense=monthTx.filter(t=>t.type==='expense'&&t.currency==='INR').reduce((s,t)=>s+num(t.amount),0);
    return {month:getMonthLabel(month),'AED Income':Math.round(aedIncome),'AED Expense':Math.round(aedExpense),'INR Income':Math.round(inrIncome),'INR Expense':Math.round(inrExpense)};
  }), [transactions, months]);

  const cashFlowData = useMemo(() => months.map(month => {
    const monthTx = transactions.filter(t=>getMonthKey(t.date)===month&&t.currency==='AED');
    const income=monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+num(t.amount),0);
    const expenses=monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+num(t.amount),0);
    const remittance=remittances.filter(r=>getMonthKey(r.date)===month).reduce((s,r)=>s+getRemAED(r),0);
    return {month:getMonthLabel(month),Income:Math.round(income),Expenses:Math.round(expenses),Remittance:Math.round(remittance),'Net Savings':Math.round(income-expenses)};
  }), [transactions, remittances, months]);

  const expensePieData = useMemo(() => {
    const filtered = transactions.filter(t=>t.type==='expense'&&months.some(m=>getMonthKey(t.date)===m)&&(currencyFilter==='both'||t.currency===currencyFilter));
    const map:Record<string,number>={};
    filtered.forEach(t=>{const c=t.category||'Other';map[c]=(map[c]||0)+num(t.amount);});
    return Object.entries(map).map(([name,value])=>({name,value:Math.round(value)})).sort((a,b)=>b.value-a.value).slice(0,8);
  }, [transactions, months, currencyFilter]);

  const remittanceData = useMemo(() => months.map(month => {
    const monthRem=remittances.filter(r=>getMonthKey(r.date)===month);
    const totalAED=monthRem.reduce((s,r)=>s+getRemAED(r),0);
    const totalINR=monthRem.reduce((s,r)=>s+getRemINR(r),0);
    const avgRate=monthRem.length>0?monthRem.reduce((s,r)=>s+getRemRate(r),0)/monthRem.length:0;
    return {month:getMonthLabel(month),'AED Sent':Math.round(totalAED),'INR Received':Math.round(totalINR),Rate:parseFloat(avgRate.toFixed(2))};
  }), [remittances, months]);

  const savingsRateData = useMemo(() => months.map(month => {
    const monthTx=transactions.filter(t=>getMonthKey(t.date)===month&&t.currency==='AED');
    const income=monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+num(t.amount),0);
    const expenses=monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+num(t.amount),0);
    const rate=income>0?parseFloat((((income-expenses)/income)*100).toFixed(1)):0;
    return {month:getMonthLabel(month),Rate:rate};
  }), [transactions, months]);

  const totals = useMemo(() => {
    const periodTx=transactions.filter(t=>months.some(m=>getMonthKey(t.date)===m));
    const aedIncome=periodTx.filter(t=>t.type==='income'&&t.currency==='AED').reduce((s,t)=>s+num(t.amount),0);
    const aedExpense=periodTx.filter(t=>t.type==='expense'&&t.currency==='AED').reduce((s,t)=>s+num(t.amount),0);
    const inrIncome=periodTx.filter(t=>t.type==='income'&&t.currency==='INR').reduce((s,t)=>s+num(t.amount),0);
    const inrExpense=periodTx.filter(t=>t.type==='expense'&&t.currency==='INR').reduce((s,t)=>s+num(t.amount),0);
    const remAED=remittances.filter(r=>months.some(m=>getMonthKey(r.date)===m)).reduce((s,r)=>s+getRemAED(r),0);
    return {aedIncome,aedExpense,inrIncome,inrExpense,remAED};
  }, [transactions, remittances, months]);

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:'16px'}}>
      <div style={{width:32,height:32,border:'3px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      <span style={{color:'var(--muted)',fontSize:'14px'}}>Loading reports...</span>
    </div>
  );

  return (
    <div style={{padding:'24px',maxWidth:'1100px',margin:'0 auto',color:'var(--text)'}}>

      {/* Tab Switcher */}
      <div style={{display:'flex',gap:'10px',marginBottom:'24px',background:'var(--card)',padding:'6px',borderRadius:'16px',border:'1px solid var(--border)',width:'fit-content',overflowX:'auto'}}>
        {[{id:'charts' as const,label:'Charts',icon:<BarChart3 size={18}/>},{id:'ledger' as const,label:'Ledger',icon:<Wallet size={18}/>},{id:'trial_balance' as const,label:'Trial Balance',icon:<Scale size={18}/>}].map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{border:'none',background:activeTab===tab.id?'var(--primary)':'transparent',color:activeTab===tab.id?'#fff':'var(--muted)',padding:'10px 20px',borderRadius:'12px',cursor:'pointer',fontSize:'14px',fontWeight:800,display:'flex',alignItems:'center',gap:'8px',whiteSpace:'nowrap'}}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <h1 style={{fontSize:'24px',fontWeight:900,margin:0}}>
            {activeTab==='charts'?'Reports & Analytics':activeTab==='ledger'?'General Ledger':'Trial Balance'}
          </h1>
          <p style={{color:'var(--muted)',fontSize:'14px',marginTop:'6px'}}>
            {activeTab==='charts'?'Visual analytics across all modules':activeTab==='ledger'?'Detailed transaction ledger with edit capability':'Double-entry accounting reconciliation'}
          </p>
          {activeTab==='charts'&&(
            <div style={{display:'inline-flex',alignItems:'center',gap:'6px',marginTop:'8px',padding:'5px 12px',borderRadius:'999px',background:'var(--card)',border:'1px solid var(--border)',color:'var(--muted)',fontSize:'12px',fontWeight:700}}>
              <Calendar size={13}/> {rangeLabel}
            </div>
          )}
        </div>
        {activeTab==='charts'&&(
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            <div style={{display:'flex',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',height:'40px'}}>
              {([6,12] as const).map(p=>(<button key={p} onClick={()=>setPeriod(p)} style={{padding:'0 16px',border:'none',background:period===p?'var(--primary)':'transparent',color:period===p?'#fff':'var(--muted)',cursor:'pointer',fontSize:'13px',fontWeight:800}}>{p}M</button>))}
            </div>
            <div style={{display:'flex',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',height:'40px'}}>
              {(['AED','INR','both'] as const).map(c=>(<button key={c} onClick={()=>setCurrencyFilter(c)} style={{padding:'0 14px',border:'none',background:currencyFilter===c?'var(--primary)':'transparent',color:currencyFilter===c?'#fff':'var(--muted)',cursor:'pointer',fontSize:'12px',fontWeight:800}}>{c==='both'?'All':c}</button>))}
            </div>
            <input type="month" value={endMonth} onChange={e=>setEndMonth(e.target.value)} style={{height:'40px',padding:'0 12px',borderRadius:'12px',border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',fontSize:'13px',outline:'none',fontWeight:700}}/>
            <button onClick={()=>{const latest=getLatestDataMonth(transactions,remittances,savingGoals);setEndMonth(latest);}} style={{height:'40px',padding:'0 14px',borderRadius:'12px',border:'1px solid var(--border)',background:'var(--card)',color:'var(--text)',cursor:'pointer',fontSize:'12px',fontWeight:800}}>Latest</button>
            <button onClick={()=>loadReports(true,false)} style={{height:'40px',display:'flex',alignItems:'center',gap:'6px',padding:'0 14px',borderRadius:'12px',border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',cursor:'pointer',fontSize:'12px',fontWeight:600}}><RefreshCw size={14}/></button>
          </div>
        )}
      </div>

      {/* ═══ TAB 1: CHARTS ═══ */}
      {activeTab==='charts'&&(
        <>
          {transactions.length===0&&remittances.length===0?(
            <div className="card" style={{padding:'48px',textAlign:'center',background:'var(--card)',border:'1px solid var(--border)',borderRadius:'16px'}}>
              <BarChart3 size={52} style={{color:'var(--border)',margin:'0 auto 16px'}}/>
              <div style={{fontSize:'18px',fontWeight:800,marginBottom:'8px'}}>No data yet</div>
              <div style={{fontSize:'14px',color:'var(--muted)'}}>Add transactions to see analytics.</div>
            </div>
          ):(
            <>
              <div style={{display:'flex',gap:'12px',marginBottom:'24px',flexWrap:'wrap'}}>
                <StatCard label={`UAE Income (${period}M)`} value={fmt(totals.aedIncome,'AED')} color="var(--success)"/>
                <StatCard label={`UAE Expense (${period}M)`} value={fmt(totals.aedExpense,'AED')} color="var(--danger)"/>
                <StatCard label={`India Income (${period}M)`} value={fmt(totals.inrIncome,'INR')} color="var(--success)"/>
                <StatCard label={`India Expense (${period}M)`} value={fmt(totals.inrExpense,'INR')} color="var(--danger)"/>
                <StatCard label={`Remittance (${period}M)`} value={fmt(totals.remAED,'AED')} color="#8b5cf6"/>
              </div>
              <ReportCard title="Income vs Expense — UAE" subtitle={`${period} months (AED)`} icon={<BarChart3 size={17}/>}>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={incomeExpenseData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={50} tickFormatter={(v)=>shortNum(v,'AED')}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:'12px'}}/>
                    <Bar dataKey="AED Income" fill="#22c55e" radius={[4,4,0,0]}/>
                    <Bar dataKey="AED Expense" fill="#ef4444" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </ReportCard>
              <ReportCard title="Income vs Expense — India" subtitle={`${period} months (INR)`} icon={<BarChart3 size={17}/>}>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={incomeExpenseData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={65} tickFormatter={(v)=>shortNum(v,'INR')}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:'12px'}}/>
                    <Bar dataKey="INR Income" fill="#06b6d4" radius={[4,4,0,0]}/>
                    <Bar dataKey="INR Expense" fill="#f97316" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </ReportCard>
              <ReportCard title="UAE Cash Flow" subtitle="Income vs Expenses trend" icon={<TrendingUp size={17}/>}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={cashFlowData}>
                    <defs>
                      <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.25}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                      <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={50} tickFormatter={(v)=>shortNum(v,'AED')}/>
                    <Tooltip content={<ChartTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:'12px'}}/>
                    <Area type="monotone" dataKey="Income" stroke="#22c55e" strokeWidth={2} fill="url(#incGrad)"/>
                    <Area type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expGrad)"/>
                    <Area type="monotone" dataKey="Net Savings" stroke="#6366f1" strokeWidth={2} fill="url(#savGrad)"/>
                  </AreaChart>
                </ResponsiveContainer>
              </ReportCard>
              <ReportCard title="Expense Breakdown" subtitle="Category distribution" icon={<PieIcon size={17}/>}>
                {expensePieData.length===0?(
                  <div style={{textAlign:'center',padding:'30px',color:'var(--muted)'}}>No expense data for this period.</div>
                ):(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:'24px',alignItems:'center'}}>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                          {expensePieData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                        </Pie>
                        <Tooltip formatter={(v:number)=>[v.toLocaleString(),'Value']}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div>
                      {expensePieData.map((item,i)=>{
                        const total=expensePieData.reduce((s,d)=>s+d.value,0);
                        const pct=total>0?((item.value/total)*100).toFixed(1):'0';
                        return (
                          <div key={item.name} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
                            <div style={{width:'11px',height:'11px',borderRadius:'3px',background:COLORS[i%COLORS.length],flexShrink:0}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:'13px',fontWeight:600,textTransform:'capitalize',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                              <div style={{height:'5px',background:'var(--border)',borderRadius:'999px',marginTop:'4px',overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${pct}%`,background:COLORS[i%COLORS.length]}}/>
                              </div>
                            </div>
                            <div style={{fontSize:'12px',fontWeight:800,flexShrink:0}}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </ReportCard>
              {remittances.length>0&&(
                <ReportCard title="Remittance History" subtitle="AED sent vs INR received" icon={<Send size={17}/>}>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={remittanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                      <YAxis yAxisId="left" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={50}/>
                      <YAxis yAxisId="right" orientation="right" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={65} tickFormatter={(v)=>shortNum(v,'INR')}/>
                      <Tooltip content={<ChartTooltip/>}/>
                      <Legend wrapperStyle={{fontSize:'12px'}}/>
                      <Bar yAxisId="left" dataKey="AED Sent" fill="#8b5cf6" radius={[4,4,0,0]}/>
                      <Bar yAxisId="right" dataKey="INR Received" fill="#06b6d4" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                  {remittanceData.some(d=>d.Rate>0)&&(
                    <>
                      <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',marginTop:'18px',marginBottom:'8px'}}>Exchange Rate Trend</div>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={remittanceData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                          <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={45} domain={['auto','auto']}/>
                          <Tooltip content={<ChartTooltip/>}/>
                          <Line type="monotone" dataKey="Rate" stroke="#f59e0b" strokeWidth={2} dot={{fill:'#f59e0b',r:4}}/>
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  )}
                </ReportCard>
              )}
              <ReportCard title="Monthly Savings Rate" subtitle="Percentage of income saved" icon={<TrendingDown size={17}/>}>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={savingsRateData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fill:'var(--muted)'}} axisLine={false} tickLine={false} width={42} tickFormatter={(v)=>`${v}%`}/>
                    <Tooltip formatter={(v:number)=>[`${v}%`,'Savings Rate']}/>
                    <Bar dataKey="Rate" radius={[4,4,0,0]}>
                      {savingsRateData.map((entry,i)=><Cell key={i} fill={entry.Rate>=20?'#22c55e':entry.Rate>=10?'#f59e0b':'#ef4444'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{display:'flex',gap:'16px',marginTop:'10px',flexWrap:'wrap'}}>
                  {[{label:'\u2265 20% Excellent',color:'#22c55e'},{label:'10\u201319% Good',color:'#f59e0b'},{label:'< 10% Low',color:'#ef4444'}].map(item=>(
                    <div key={item.label} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',color:'var(--muted)'}}>
                      <div style={{width:'10px',height:'10px',borderRadius:'2px',background:item.color}}/> {item.label}
                    </div>
                  ))}
                </div>
              </ReportCard>
            </>
          )}
        </>
      )}

      {/* ═══ TAB 2: LEDGER VIEW ═══ */}
      {activeTab==='ledger'&&(
        <>
          <div style={{display:'flex',gap:'12px',alignItems:'flex-start',padding:'14px 16px',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:'14px',marginBottom:'24px'}}>
            <Info size={20} style={{color:'var(--primary)',flexShrink:0,marginTop:'2px'}}/>
            <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.5}}>
              <strong style={{color:'var(--primary)'}}>General Ledger:</strong> View all transactions with running balance. Click Edit to modify entries directly.
            </div>
          </div>

          <div style={{display:'flex',gap:'12px',marginBottom:'20px',flexWrap:'wrap'}}>
            <StatCard label="Total Entries" value={String(ledgerTotals.count)} color="var(--primary)"/>
            <StatCard label="Total Income" value={fmt(ledgerTotals.totalIncome,currencyFilter==='INR'?'INR':'AED')} color="var(--success)"/>
            <StatCard label="Total Expense" value={fmt(ledgerTotals.totalExpense,currencyFilter==='INR'?'INR':'AED')} color="var(--danger)"/>
            <StatCard label="Net" value={fmt(ledgerTotals.net,currencyFilter==='INR'?'INR':'AED')} color={ledgerTotals.net>=0?'var(--primary)':'var(--danger)'}/>
          </div>

          {/* Filters */}
          <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:'16px',padding:'16px',marginBottom:'20px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <Filter size={16} color="var(--primary)"/>
              <span style={{fontWeight:800,fontSize:14}}>Filters</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
              {/* SEARCHABLE ACCOUNT DROPDOWN */}
              <div>
                <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>Account</label>
                <div style={{position:'relative'}}>
                  <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)',pointerEvents:'none'}}/>
                  <input
                    type="text"
                    placeholder="Type to search accounts..."
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    onFocus={() => setShowAccountDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAccountDropdown(false), 200)}
                    style={{width:'100%',padding:'9px 10px 9px 32px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}
                  />
                  {showAccountDropdown && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,marginTop:4,maxHeight:200,overflowY:'auto',background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,zIndex:100,boxShadow:'0 8px 24px rgba(0,0,0,0.3)'}}>
                      <div
                        onMouseDown={(e) => { e.preventDefault(); setSelectedAccount('all'); setAccountSearch('All Accounts'); setShowAccountDropdown(false); }}
                        style={{padding:'10px 12px',cursor:'pointer',fontSize:13,fontWeight:selectedAccount==='all'?800:600,background:selectedAccount==='all'?'rgba(99,102,241,0.1)':'transparent',color:selectedAccount==='all'?'var(--primary)':'var(--text)',borderBottom:'1px solid var(--border)'}}
                      >
                        🌍 All Accounts
                      </div>
                      {filteredAccounts.length === 0 ? (
                        <div style={{padding:'10px 12px',fontSize:13,color:'var(--muted)'}}>No accounts found</div>
                      ) : (
                        filteredAccounts.map(pm => (
                          <div
                            key={pm.id}
                            onMouseDown={(e) => { e.preventDefault(); setSelectedAccount(pm.id); setAccountSearch(pm.name); setShowAccountDropdown(false); }}
                            style={{padding:'10px 12px',cursor:'pointer',fontSize:13,fontWeight:selectedAccount===pm.id?800:600,background:selectedAccount===pm.id?'rgba(99,102,241,0.1)':'transparent',color:selectedAccount===pm.id?'var(--primary)':'var(--text)',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                          >
                            <span>{pm.name}</span>
                            <span style={{fontSize:11,color:'var(--muted)',fontWeight:600}}>{pm.country}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* END SEARCHABLE ACCOUNT */}
              <div>
                <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>Type</label>
                <select value={ledgerTypeFilter} onChange={e=>setLedgerTypeFilter(e.target.value as any)} style={{width:'100%',padding:'9px 10px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}>
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>From Date</label>
                <input type="date" value={ledgerDateFrom} onChange={e=>setLedgerDateFrom(e.target.value)} style={{width:'100%',padding:'9px 10px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>To Date</label>
                <input type="date" value={ledgerDateTo} onChange={e=>setLedgerDateTo(e.target.value)} style={{width:'100%',padding:'9px 10px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--muted)',fontWeight:600,display:'block',marginBottom:4}}>Search</label>
                <div style={{position:'relative'}}>
                  <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)'}}/>
                  <input type="text" placeholder="Category, note..." value={ledgerSearch} onChange={e=>setLedgerSearch(e.target.value)} style={{width:'100%',padding:'9px 10px 9px 32px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13,boxSizing:'border-box'}}/>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'flex-end'}}>
                <button onClick={()=>{setSelectedAccount('all');setAccountSearch('All Accounts');setLedgerTypeFilter('all');setLedgerDateFrom('');setLedgerDateTo('');setLedgerSearch('');}} style={{padding:'9px 16px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--muted)',cursor:'pointer',fontSize:13,fontWeight:700,width:'100%'}}>Clear All</button>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <ReportCard title="Transaction Ledger" subtitle={`${ledgerEntries.length} entries found`} icon={<Wallet size={17}/>}>
            {ledgerEntries.length===0?(
              <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>
                <Wallet size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
                <div style={{fontWeight:800,fontSize:'15px'}}>No transactions found</div>
                <div style={{fontSize:'13px',marginTop:'4px'}}>Adjust filters or add new transactions.</div>
              </div>
            ):(
              <>
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
                  <button onClick={exportCSV} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',fontSize:12,fontWeight:700}}>
                    <Download size={14}/> Export CSV
                  </button>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid var(--border)',color:'var(--muted)'}}>
                        <th style={{textAlign:'left',padding:'10px 12px',fontWeight:800,cursor:'pointer',userSelect:'none'}} onClick={()=>toggleSort('date')}>DATE {sortField==='date'?(sortDir==='asc'?'\u2191':'\u2193'):''}</th>
                        <th style={{textAlign:'left',padding:'10px 12px',fontWeight:800}}>TYPE</th>
                        <th style={{textAlign:'left',padding:'10px 12px',fontWeight:800,cursor:'pointer',userSelect:'none'}} onClick={()=>toggleSort('category')}>CATEGORY {sortField==='category'?(sortDir==='asc'?'\u2191':'\u2193'):''}</th>
                        <th style={{textAlign:'left',padding:'10px 12px',fontWeight:800}}>ACCOUNT</th>
                        <th style={{textAlign:'right',padding:'10px 12px',fontWeight:800,cursor:'pointer',userSelect:'none'}} onClick={()=>toggleSort('amount')}>AMOUNT {sortField==='amount'?(sortDir==='asc'?'\u2191':'\u2193'):''}</th>
                        <th style={{textAlign:'right',padding:'10px 12px',fontWeight:800}}>EFFECT</th>
                        {selectedAccount!=='all'&&<th style={{textAlign:'right',padding:'10px 12px',fontWeight:800}}>BALANCE</th>}
                        <th style={{textAlign:'right',padding:'10px 12px',fontWeight:800}}>NOTE</th>
                        <th style={{textAlign:'center',padding:'10px 12px',fontWeight:800}}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.map((entry,i)=>{
                        const typeColor=entry.type==='income'?'var(--success)':entry.type==='expense'?'var(--danger)':'var(--primary)';
                        const typeBg=entry.type==='income'?'rgba(34,197,94,0.1)':entry.type==='expense'?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)';
                        return (
                          <tr key={entry.id||i} style={{borderBottom:'1px solid var(--border)',opacity:entry.isReversed?0.5:1,textDecoration:entry.isReversed?'line-through':'none'}}>
                            <td style={{padding:'10px 12px',fontWeight:600,whiteSpace:'nowrap'}}>{entry.date}</td>
                            <td style={{padding:'10px 12px'}}><span style={{padding:'3px 8px',borderRadius:6,fontSize:11,fontWeight:800,background:typeBg,color:typeColor,textTransform:'uppercase'}}>{entry.type}</span></td>
                            <td style={{padding:'10px 12px',fontWeight:700}}>{entry.category}</td>
                            <td style={{padding:'10px 12px',color:'var(--muted)',fontSize:12}}>{entry.accountName}</td>
                            <td style={{padding:'10px 12px',textAlign:'right',fontWeight:800,whiteSpace:'nowrap'}}>{formatCurrency(entry.amount,entry.currency)}</td>
                            <td style={{padding:'10px 12px',textAlign:'right',fontWeight:800,color:entry.effect>0?'var(--success)':entry.effect<0?'var(--danger)':'var(--muted)',whiteSpace:'nowrap'}}>{entry.effect>0?'+':''}{formatCurrency(entry.effect,entry.currency)}</td>
                            {selectedAccount!=='all'&&<td style={{padding:'10px 12px',textAlign:'right',fontWeight:700,whiteSpace:'nowrap'}}>{formatCurrency(entry.runningBalance,entry.currency)}</td>}
                            <td style={{padding:'10px 12px',color:'var(--muted)',fontSize:12,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.note||'-'}</td>
                            <td style={{padding:'10px 12px',textAlign:'center'}}>
                              {/* ✅ FIXED EDIT BUTTON — onMouseDown prevents blur before click */}
                              <button
                                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                onClick={(e) => { e.stopPropagation(); setEditingTxId(entry.id || ''); }}
                                style={{
                                  padding:'6px 12px', borderRadius:8, border:'1px solid var(--primary)',
                                  background:'rgba(99,102,241,0.1)', color:'var(--primary)', cursor:'pointer',
                                  fontSize:11, fontWeight:700, display:'inline-flex', alignItems:'center', gap:4,
                                  pointerEvents:'auto',
                                }}
                              >
                                <Edit2 size={12}/> Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',marginTop:16,background:'var(--bg)',borderRadius:12,border:'1px solid var(--border)',flexWrap:'wrap',gap:12}}>
                  <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                    <div><span style={{fontSize:11,color:'var(--muted)'}}>Income: </span><span style={{fontWeight:900,color:'var(--success)'}}>{formatCurrency(ledgerTotals.totalIncome,currencyFilter==='INR'?'INR':'AED')}</span></div>
                    <div><span style={{fontSize:11,color:'var(--muted)'}}>Expense: </span><span style={{fontWeight:900,color:'var(--danger)'}}>{formatCurrency(ledgerTotals.totalExpense,currencyFilter==='INR'?'INR':'AED')}</span></div>
                    <div><span style={{fontSize:11,color:'var(--muted)'}}>Net: </span><span style={{fontWeight:900,color:ledgerTotals.net>=0?'var(--primary)':'var(--danger)'}}>{formatCurrency(ledgerTotals.net,currencyFilter==='INR'?'INR':'AED')}</span></div>
                  </div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{ledgerTotals.count} transaction{ledgerTotals.count!==1?'s':''}</div>
                </div>
              </>
            )}
          </ReportCard>
        </>
      )}

      {/* ═══ TAB 3: TRIAL BALANCE ═══ */}
      {activeTab==='trial_balance'&&(
        <>
          <div style={{display:'flex',gap:'12px',alignItems:'flex-start',padding:'14px 16px',background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:'14px',marginBottom:'24px'}}>
            <Info size={20} style={{color:'var(--primary)',flexShrink:0,marginTop:'2px'}}/>
            <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.5}}>
              <strong style={{color:'var(--primary)'}}>Trial Balance Protocol:</strong> Verifies that total debits equal total credits. Only double-entry transactions are included.
            </div>
          </div>
          <ReportCard title="Trial Balance" subtitle="General Ledger reconciliation" icon={<Scale size={17}/>}>
            {!trialBalance.hasEntries?(
              <div style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>
                <Scale size={40} style={{margin:'0 auto 12px',opacity:0.3}}/>
                <div style={{fontWeight:800,fontSize:'15px'}}>No ERP records found</div>
                <div style={{fontSize:'13px',marginTop:'4px'}}>New double-entry transactions will appear here.</div>
              </div>
            ):(
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                  <thead>
                    <tr style={{borderBottom:'2px solid var(--border)',color:'var(--muted)'}}>
                      <th style={{textAlign:'left',padding:'12px',fontWeight:800}}>ACCOUNT</th>
                      <th style={{textAlign:'left',padding:'12px',fontWeight:800}}>TYPE</th>
                      <th style={{textAlign:'right',padding:'12px',fontWeight:800}}>DEBIT</th>
                      <th style={{textAlign:'right',padding:'12px',fontWeight:800}}>CREDIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.rows.map((row,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'12px',fontWeight:700}}>{row.name}</td>
                        <td style={{padding:'12px',color:'var(--muted)'}}><span style={{background:'var(--bg)',padding:'4px 8px',borderRadius:'6px',fontSize:'11px',fontWeight:800}}>{row.type}</span></td>
                        <td style={{padding:'12px',textAlign:'right',color:row.debit?'var(--text)':'transparent',fontWeight:800}}>{row.debit?row.debit.toLocaleString('en-US',{minimumFractionDigits:2}):'-'}</td>
                        <td style={{padding:'12px',textAlign:'right',color:row.credit?'var(--text)':'transparent',fontWeight:800}}>{row.credit?row.credit.toLocaleString('en-US',{minimumFractionDigits:2}):'-'}</td>
                      </tr>
                    ))}
                    <tr style={{background:'var(--bg)',borderTop:'2px solid var(--primary)'}}>
                      <td colSpan={2} style={{padding:'14px 12px',fontWeight:900,color:'var(--primary)'}}>TOTALS (Base AED)</td>
                      <td style={{padding:'14px 12px',textAlign:'right',fontWeight:900,color:'var(--text)'}}>{trialBalance.totalDebits.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                      <td style={{padding:'14px 12px',textAlign:'right',fontWeight:900,color:'var(--text)'}}>{trialBalance.totalCredits.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{display:'flex',justifyContent:'flex-end',marginTop:'20px'}}>
                  {trialBalance.isBalanced?(
                    <div style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(34,197,94,0.1)',color:'var(--success)',padding:'10px 16px',borderRadius:'12px',fontWeight:800}}>
                      <CheckCircle size={18}/> LEDGER IS BALANCED
                    </div>
                  ):(
                    <div style={{display:'flex',alignItems:'center',gap:'8px',background:'rgba(239,68,68,0.1)',color:'var(--danger)',padding:'10px 16px',borderRadius:'12px',fontWeight:800}}>
                      <AlertTriangle size={18}/> OUT OF BALANCE (Diff: {Math.abs(trialBalance.totalDebits-trialBalance.totalCredits).toFixed(2)})
                    </div>
                  )}
                </div>
              </div>
            )}
          </ReportCard>
        </>
      )}

      {/* ═══ TRANSACTION EDITOR MODAL ═══ */}
      {editingTxId && (
        <TransactionEditor
          user={user}
          transactionId={editingTxId}
          onClose={() => setEditingTxId(null)}
          onUpdate={() => loadReports(false, false)}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}