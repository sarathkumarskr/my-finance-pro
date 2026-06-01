import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ═══════════════════════════════════════════════════════════
// TYPES — ERP Chart of Accounts Compatible
// ═══════════════════════════════════════════════════════════

export type TransactionType = 'income' | 'expense' | 'transfer';
export type Currency = 'AED' | 'INR';
export type Country = 'UAE' | 'India';

export interface Transaction {
  id?: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  country: Country;
  category: string;
  subCategory?: string | null;
  date: string;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  paymentMethodType?: string | null;
  note?: string | null;
  debitAccountId?: string | null;
  creditAccountId?: string | null;
  fromMethod?: string | null;
  toMethod?: string | null;
  principalAmount?: number | null;
  interestAmount?: number | null;
  loanId?: string | null;
  remittanceId?: string | null;
  isRemittanceFee?: boolean;
  isRemittance?: boolean;
  createdAt?: any;
  updatedAt?: any;
  isReversed?: boolean;
  reversalOf?: string | null;
}

export interface IncomeCategory {
  id: string;
  name: string;
  icon: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
}

// ═══════════════════════════════════════════════════════════
// DEFAULT CATEGORIES
// ═══════════════════════════════════════════════════════════

export const defaultIncomeCategories: IncomeCategory[] = [
  { id: 'salary',          name: 'Salary',            icon: '\uD83D\uDCBC' },
  { id: 'freelance',       name: 'Freelance',         icon: '\uD83E\uDDD1\u200D\uD83D\uDCBB' },
  { id: 'business',        name: 'Business',          icon: '\uD83C\uDFE2' },
  { id: 'investment',      name: 'Investment Returns', icon: '\uD83D\uDCC8' },
  { id: 'rental',          name: 'Rental Income',     icon: '\uD83C\uDFE0' },
  { id: 'gift',            name: 'Gift / Bonus',      icon: '\uD83C\uDF81' },
  { id: 'other_income',    name: 'Other',             icon: '\u2795' },
];

export const defaultExpenseCategories: ExpenseCategory[] = [
  { id: 'rent',            name: 'Rent / Accommodation', icon: '\uD83C\uDFE0' },
  { id: 'food',            name: 'Food & Dining',        icon: '\uD83C\uDF54' },
  { id: 'transport',       name: 'Transport / Fuel',     icon: '\uD83D\uDE97' },
  { id: 'medical',         name: 'Medical / Health',     icon: '\uD83D\uDC8A' },
  { id: 'education',       name: 'Education',            icon: '\uD83D\uDCDA' },
  { id: 'shopping',        name: 'Shopping',             icon: '\uD83D\uDECD\uFE0F' },
  { id: 'bills',           name: 'Bills & Utilities',    icon: '\uD83D\uDCA1' },
  { id: 'entertainment',   name: 'Entertainment',        icon: '\uD83C\uDFAC' },
  { id: 'travel',          name: 'Travel',               icon: '\u2708\uFE0F' },
  { id: 'family',          name: 'Family',               icon: '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67' },
  { id: 'religious',       name: 'Religious',            icon: '\uD83D\uDED0' },
  { id: 'emi',             name: 'EMI Payment',          icon: '\uD83C\uDFE6' },
  { id: 'bank_fees',       name: 'Bank Fees',            icon: '\uD83C\uDFE7' },
  { id: 'remittance',      name: 'Remittance',           icon: '\uD83D\uDCB8' },
  { id: 'other_expense',   name: 'Other',                icon: '\u2795' },
];

// ═══════════════════════════════════════════════════════════
// ERP CHART OF ACCOUNTS MAPPER
// ═══════════════════════════════════════════════════════════

export function getExpenseGLAccount(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('rent') || c.includes('accommodation')) return '5010';
  if (c.includes('food') || c.includes('dining') || c.includes('grocer')) return '5020';
  if (c.includes('transport') || c.includes('fuel') || c.includes('taxi')) return '5030';
  if (c.includes('fee') || c.includes('bank') || c.includes('charge')) return '5040';
  if (c.includes('forex') || c.includes('exchange')) return '5050';
  if (c.includes('medical') || c.includes('health')) return '5060';
  if (c.includes('education') || c.includes('school')) return '5070';
  if (c.includes('shop') || c.includes('cloth')) return '5080';
  return '5090';
}

export function getIncomeGLAccount(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes('salary')) return '4010';
  if (c.includes('freelance')) return '4020';
  if (c.includes('business')) return '4030';
  if (c.includes('invest')) return '4040';
  if (c.includes('rental')) return '4050';
  if (c.includes('gift') || c.includes('bonus')) return '4060';
  return '4090';
}

// ═══════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════

export const addTransaction = async (
  data: Omit<Transaction, 'id' | 'createdAt'>
): Promise<string> => {
  const docRef = await addDoc(collection(db, 'transactions'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateTransaction = async (
  id: string,
  data: Partial<Transaction>
): Promise<void> => {
  await updateDoc(doc(db, 'transactions', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteTransaction = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'transactions', id));
};

export const reverseTransaction = async (
  originalTx: Transaction,
  reason: string = 'Correction'
): Promise<string> => {
  const reversalData: Omit<Transaction, 'id' | 'createdAt'> = {
    userId: originalTx.userId,
    type: originalTx.type,
    amount: originalTx.amount,
    currency: originalTx.currency,
    country: originalTx.country,
    category: `REVERSAL: ${originalTx.category}`,
    subCategory: reason,
    date: new Date().toISOString().split('T')[0],
    paymentMethodId: originalTx.paymentMethodId ?? null,
    paymentMethodName: originalTx.paymentMethodName ?? null,
    paymentMethodType: originalTx.paymentMethodType ?? null,
    note: `Reversal of tx ${originalTx.id} \u2014 ${reason}`,
    debitAccountId: originalTx.creditAccountId ?? null,
    creditAccountId: originalTx.debitAccountId ?? null,
    isReversed: false,
    reversalOf: originalTx.id ?? null,
  };

  await updateDoc(doc(db, 'transactions', originalTx.id!), {
    isReversed: true,
    updatedAt: serverTimestamp(),
  });

  return await addTransaction(reversalData);
};

// ═══════════════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ═══════════════════════════════════════════════════════════

export const listenTransactions = (
  userId: string,
  type: TransactionType | 'all',
  callback: (transactions: Transaction[]) => void
): (() => void) => {
  let q;
  if (type === 'all') {
    q = query(collection(db, 'transactions'), where('userId', '==', userId));
  } else {
    q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('type', '==', type)
    );
  }
  return onSnapshot(q, (snapshot) => {
    const data: Transaction[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    data.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    callback(data);
  });
};

export const listenMonthlyTransactions = (
  userId: string,
  month: string,
  callback: (transactions: Transaction[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'transactions'),
    where('userId', '==', userId),
    where('date', '>=', `${month}-01`),
    where('date', '<=', `${month}-31`)
  );
  return onSnapshot(q, (snapshot) => {
    const data: Transaction[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    data.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    callback(data);
  });
};

// ═══════════════════════════════════════════════════════════
// DOUBLE-ENTRY ENGINE
// ═══════════════════════════════════════════════════════════

export const postDoubleEntry = async (
  payload: Omit<Transaction, 'id' | 'createdAt'>
): Promise<string> => {
  if (!payload.amount || payload.amount <= 0) {
    throw new Error('Amount must be positive');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    throw new Error('Date must be YYYY-MM-DD format');
  }

  let finalPayload = { ...payload };

  if (payload.type === 'income') {
    finalPayload.debitAccountId = payload.paymentMethodId ?? null;
    finalPayload.creditAccountId = getIncomeGLAccount(payload.category);
  } else if (payload.type === 'expense') {
    finalPayload.debitAccountId = getExpenseGLAccount(payload.category);
    finalPayload.creditAccountId = payload.paymentMethodId ?? null;
  } else if (payload.type === 'transfer') {
    finalPayload.debitAccountId = payload.toMethod ?? null;
    finalPayload.creditAccountId = payload.fromMethod ?? null;
  }

  const docRef = await addDoc(collection(db, 'transactions'), {
    ...finalPayload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

export const updateDoubleEntry = async (
  id: string,
  payload: Partial<Transaction>
): Promise<void> => {
  await updateDoc(doc(db, 'transactions', id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
};

// ═══════════════════════════════════════════════════════════
// BALANCE CALCULATION
// ═══════════════════════════════════════════════════════════

export const calculateMethodBalance = (
  methodId: string,
  transactions: Transaction[],
  openingBalances: Record<string, number>,
  asOfDate: string
): number => {
  const opening = openingBalances[methodId] ?? 0;
  return transactions.reduce((sum, tx) => {
    if (tx.date <= asOfDate) return sum;
    if (tx.type === 'income' && tx.paymentMethodId === methodId) return sum + tx.amount;
    if (tx.type === 'expense' && tx.paymentMethodId === methodId) return sum - tx.amount;
    if (tx.type === 'transfer') {
      if (tx.fromMethod === methodId) return sum - tx.amount;
      if (tx.toMethod === methodId) return sum + tx.amount;
    }
    return sum;
  }, opening);
};

// ═══════════════════════════════════════════════════════════
// FORMATTERS & UTILITIES
// ═══════════════════════════════════════════════════════════

export const formatCurrency = (amount: number, currency: Currency): string => {
  if (currency === 'AED') {
    return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const formatCurrencyShort = (amount: number, currency: Currency): string => {
  if (Math.abs(amount) >= 1000) {
    const k = amount / 1000;
    return currency === 'AED' ? `AED ${k.toFixed(1)}k` : `\u20B9${k.toFixed(0)}k`;
  }
  return formatCurrency(amount, currency);
};

export const getToday = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getCurrentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getCurrentMonthRange = (): { start: string; end: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const shiftMonth = (month: string, diff: number): string => {
  const [year, monthNo] = month.split('-').map(Number);
  const d = new Date(year, (monthNo || 1) - 1 + diff, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};

export const getMonthLabel = (month: string): string => {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(year, (monthNo || 1) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const getShortMonthLabel = (month: string): string => {
  const [year, monthNo] = month.split('-').map(Number);
  return new Date(year, (monthNo || 1) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

// ═══════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════

export const validateTransaction = (
  data: Partial<Transaction>
): { valid: boolean; error?: string } => {
  if (!data.amount || data.amount <= 0) {
    return { valid: false, error: 'Amount must be positive' };
  }
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { valid: false, error: 'Invalid date format (YYYY-MM-DD)' };
  }
  if (!data.category?.trim()) {
    return { valid: false, error: 'Category is required' };
  }
  if (data.type === 'transfer') {
    if (!data.fromMethod || !data.toMethod) {
      return { valid: false, error: 'Transfer requires from and to accounts' };
    }
    if (data.fromMethod === data.toMethod) {
      return { valid: false, error: 'Cannot transfer to same account' };
    }
  } else {
    if (!data.paymentMethodId) {
      return { valid: false, error: 'Payment method is required' };
    }
  }
  return { valid: true };
};

// ═══════════════════════════════════════════════════════════
// AGGREGATION HELPERS
// ═══════════════════════════════════════════════════════════

export const aggregateByCategory = (
  transactions: Transaction[],
  type: TransactionType,
  currency?: Currency
): { category: string; total: number }[] => {
  const filtered = transactions.filter(
    (t) => t.type === type && (!currency || t.currency === currency)
  );
  const map: Record<string, number> = {};
  filtered.forEach((t) => {
    const cat = t.category || 'Other';
    map[cat] = (map[cat] || 0) + t.amount;
  });
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
};

export const aggregateByMonth = (
  transactions: Transaction[],
  months: string[]
): { month: string; income: number; expense: number; net: number }[] => {
  return months.map((month) => {
    const monthTx = transactions.filter((t) => t.date.startsWith(month));
    const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { month, income, expense, net: income - expense };
  });
};

export const getSavingsRate = (income: number, expense: number): number => {
  if (income <= 0) return 0;
  return parseFloat((((income - expense) / income) * 100).toFixed(1));
};

export const getDebtToIncomeRatio = (monthlyDebtPayments: number, monthlyIncome: number): number => {
  if (monthlyIncome <= 0) return 0;
  return parseFloat(((monthlyDebtPayments / monthlyIncome) * 100).toFixed(1));
};

// ═══════════════════════════════════════════════════════════
// ERP CHART OF ACCOUNTS REFERENCE (for Trial Balance)
// ═══════════════════════════════════════════════════════════

export const GL_ACCOUNTS: Record<string, { name: string; accountClass: string }> = {
  '1001': { name: 'UAE Cash',           accountClass: 'Asset' },
  '1002': { name: 'India Cash',         accountClass: 'Asset' },
  '1010': { name: 'UAE Debit Accounts', accountClass: 'Asset' },
  '1020': { name: 'India Bank/UPI',     accountClass: 'Asset' },
  '1100': { name: 'Investments & Savings', accountClass: 'Asset' },
  '1200': { name: 'Receivables',        accountClass: 'Asset' },
  '2001': { name: 'Credit Cards Outstanding', accountClass: 'Liability' },
  '2100': { name: 'Loans Payable',      accountClass: 'Liability' },
  '2101': { name: 'Tabby / BNPL',       accountClass: 'Liability' },
  '2200': { name: 'Personal Debts',     accountClass: 'Liability' },
  '3001': { name: 'Net Worth / Equity', accountClass: 'Equity' },
  '4010': { name: 'Salary Income',      accountClass: 'Income' },
  '4020': { name: 'Freelance Income',   accountClass: 'Income' },
  '4030': { name: 'Business Income',    accountClass: 'Income' },
  '4040': { name: 'Investment Returns', accountClass: 'Income' },
  '4050': { name: 'Rental Income',      accountClass: 'Income' },
  '4060': { name: 'Gift / Bonus',       accountClass: 'Income' },
  '4090': { name: 'Other Income',       accountClass: 'Income' },
  '5010': { name: 'Rent Expense',       accountClass: 'Expense' },
  '5020': { name: 'Food & Dining',      accountClass: 'Expense' },
  '5030': { name: 'Transport & Fuel',   accountClass: 'Expense' },
  '5040': { name: 'Bank Fees',          accountClass: 'Expense' },
  '5050': { name: 'Forex Charges',      accountClass: 'Expense' },
  '5060': { name: 'Medical Expense',    accountClass: 'Expense' },
  '5070': { name: 'Education Expense',  accountClass: 'Expense' },
  '5080': { name: 'Shopping Expense',   accountClass: 'Expense' },
  '5090': { name: 'General Expenses',   accountClass: 'Expense' },
};