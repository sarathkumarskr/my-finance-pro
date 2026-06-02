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
  { id: 'freelance',       name: 'Freelance',         icon: '🧑‍💻' },
  { id: 'business',        name: 'Business',          icon: '🏢' },
  { id: 'investment',      name: 'Investment Returns', icon: '📈' },
  { id: 'rental',          name: 'Rental Income',     icon: '🏠' },
  { id: 'gift',            name: 'Gift / Bonus',      icon: '🎁' },
  { id: 'other_income',    name: 'Other',             icon: '➕' },
];

export const defaultExpenseCategories: ExpenseCategory[] = [
  { id: 'rent',            name: 'Rent / Accommodation', icon: '🏠' },
  { id: 'food',            name: 'Food & Dining',        icon: '🍔' },
  { id: 'transport',       name: 'Transport / Fuel',     icon: '🚗' },
  { id: 'medical',         name: 'Medical / Health',     icon: '💊' },
  { id: 'education',       name: 'Education',            icon: '📚' },
  { id: 'shopping',        name: 'Shopping',             icon: '🛍️' },
  { id: 'bills',           name: 'Bills & Utilities',    icon: '💡' },
  { id: 'entertainment',   name: 'Entertainment',        icon: '🎬' },
  { id: 'travel',          name: 'Travel',               icon: '✈️' },
  { id: 'family',          name: 'Family',               icon: '👨‍👩‍👧' },
  { id: 'religious',       name: 'Religious',            icon: '🛐' },
  { id: 'emi',             name: 'EMI Payment',          icon: '🏦' },
  { id: 'bank_fees',       name: 'Bank Fees',            icon: '🏧' },
  { id: 'remittance',      name: 'Remittance',           icon: '💸' },
  { id: 'other_expense',   name: 'Other',                icon: '➕' },
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
    note: `Reversal of tx ${originalTx.id} — ${reason}`,
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
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const formatCurrencyShort = (amount: number, currency: Currency): string => {
  if (Math.abs(amount) >= 1000) {
    const k = amount / 1000;
    return currency === 'AED' ? `AED ${k.toFixed(1)}k` : `₹${k.toFixed(0)}k`;
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
// ─── Tabby Types ─────────────────────────────────────────────────────────────

export interface TabbyInstallment {
  installmentNumber: number; // 1-4
  amount: number;
  dueDate: string; // YYYY-MM-DD
  isPaid: boolean;
  paidDate?: string;
  paidTransactionId?: string;
}

export interface TabbyPurchaseEMI {
  id: string;
  sourceTransactionId: string;
  name: string;
  totalAmount: number;
  emiAmount: number;
  emiType: 'zero';
  months: 4;
  interestRate: 0;
  startDate: string;
  purchaseDate: string;
  autoGenerated: true;
  autoSource: 'tabby-pro';
  installments: TabbyInstallment[];
  isFullyPaid: boolean;
}

export interface CashFlowItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  type: 'expense' | 'savings' | 'debt_payment';
  source: 'manual' | 'auto_tabby' | 'auto_cc_emi' | 'auto_loan';
  sourceId?: string; // link to debt/method
  isPaid: boolean;
  dueDate?: string;
  note?: string;
  // For display
  icon?: string;
  color?: string;
  cashImpact: 'cash_gone' | 'cash_moves'; // KEY FIELD
}

// ─── Statement Cycle Helpers ─────────────────────────────────────────────────

/**
 * Get the statement closing date for a given purchase date
 * If purchase is ON or BEFORE statement date → same month statement
 * If purchase is AFTER statement date → next month statement
 */
export function getStatementClosingDate(
  purchaseDate: string,
  statementDay: number
): string {
  const d = new Date(purchaseDate);
  const purchaseDay = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth(); // 0-indexed

  if (purchaseDay > statementDay) {
    // Goes into next month's statement
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }

  // Clamp to valid day
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(statementDay, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Get the first due date after statement close
 * Statement closes on 23rd → first due on next month 3rd
 */
export function getFirstDueDate(
  purchaseDate: string,
  statementDay: number,
  dueDay: number
): string {
  const stmtClose = getStatementClosingDate(purchaseDate, statementDay);
  const stmtDate = new Date(stmtClose);
  
  // Due date is in the month AFTER the statement close
  let year = stmtDate.getFullYear();
  let month = stmtDate.getMonth() + 1; // next month
  if (month > 11) { month = 0; year += 1; }

  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(dueDay, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Build 4-installment schedule for Tabby Pro purchase
 */
export function buildTabbyProSchedule(
  purchaseAmount: number,
  purchaseDate: string,
  purchaseName: string,
  sourceTransactionId: string,
  statementDay: number,
  dueDay: number
): TabbyPurchaseEMI {
  const emiAmount = Math.round((purchaseAmount / 4) * 100) / 100;
  // Handle rounding: first 3 are equal, 4th gets remainder
  const lastEmiAmount = Math.round((purchaseAmount - emiAmount * 3) * 100) / 100;

  const firstDue = getFirstDueDate(purchaseDate, statementDay, dueDay);
  const installments: TabbyInstallment[] = [];

  for (let i = 0; i < 4; i++) {
    const dueDate = shiftMonthFromDate(firstDue, i);
    installments.push({
      installmentNumber: i + 1,
      amount: i === 3 ? lastEmiAmount : emiAmount,
      dueDate,
      isPaid: false,
    });
  }

  return {
    id: `tabby-emi-${sourceTransactionId}`,
    sourceTransactionId,
    name: `${purchaseName} - ${formatCurrency(purchaseAmount, 'AED')}`,
    totalAmount: purchaseAmount,
    emiAmount,
    emiType: 'zero',
    months: 4,
    interestRate: 0,
    startDate: purchaseDate,
    purchaseDate,
    autoGenerated: true,
    autoSource: 'tabby-pro',
    installments,
    isFullyPaid: false,
  };
}

/**
 * Shift a specific date string by N months
 */
function shiftMonthFromDate(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  const targetMonth = d.getMonth() + months;
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
  const finalMonth = ((targetMonth % 12) + 12) % 12;
  
  const lastDay = new Date(targetYear, finalMonth + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  
  return `${targetYear}-${String(finalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Tabby Balance Helpers ───────────────────────────────────────────────────

/**
 * Calculate Tabby outstanding from EMI schedules
 * Outstanding = sum of all unpaid installments
 */
export function getTabbyOutstanding(emis: TabbyPurchaseEMI[]): number {
  return emis.reduce((total, emi) => {
    const unpaid = emi.installments
      .filter(inst => !inst.isPaid)
      .reduce((s, inst) => s + inst.amount, 0);
    return total + unpaid;
  }, 0);
}

/**
 * Get available Tabby limit
 */
export function getTabbyAvailableLimit(
  creditLimit: number,
  emis: TabbyPurchaseEMI[]
): number {
  return Math.max(0, creditLimit - getTabbyOutstanding(emis));
}

/**
 * Get installments due in a specific month (YYYY-MM)
 */
export function getTabbyDueForMonth(
  emis: TabbyPurchaseEMI[],
  month: string
): { installments: (TabbyInstallment & { purchaseName: string; emiId: string })[]; totalDue: number } {
  const items: (TabbyInstallment & { purchaseName: string; emiId: string })[] = [];
  
  emis.forEach(emi => {
    emi.installments.forEach(inst => {
      if (inst.dueDate.substring(0, 7) === month && !inst.isPaid) {
        items.push({
          ...inst,
          purchaseName: emi.name,
          emiId: emi.id,
        });
      }
    });
  });

  return {
    installments: items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    totalDue: items.reduce((s, i) => s + i.amount, 0),
  };
}

/**
 * Get ALL debt payments due in a month
 * Combines: Tabby installments + CC EMIs + Loan EMIs
 */
export function getAllDebtPaymentsDueForMonth(
  tabbyEmis: TabbyPurchaseEMI[],
  ccEmis: any[], // from paymentMethods.emis
  debts: any[], // from debts collection
  month: string
): CashFlowItem[] {
  const items: CashFlowItem[] = [];

  // 1. Tabby installments
  const tabbyDue = getTabbyDueForMonth(tabbyEmis, month);
  tabbyDue.installments.forEach(inst => {
    items.push({
      id: `tabby-${inst.emiId}-${inst.installmentNumber}`,
      name: inst.purchaseName,
      amount: inst.amount,
      currency: 'AED',
      type: 'debt_payment',
      source: 'auto_tabby',
      sourceId: inst.emiId,
      isPaid: inst.isPaid,
      dueDate: inst.dueDate,
      cashImpact: 'cash_moves',
      icon: '\u{1F4B3}',
      color: '#8b5cf6',
      note: `Tabby installment ${inst.installmentNumber}/4`,
    });
  });

  // 2. Credit card EMIs
  ccEmis.forEach((emi: any) => {
    if (!emi.startDate || !emi.months) return;
    const startMonth = emi.startDate.substring(0, 7);
    const emiEndMonth = shiftMonth(startMonth, emi.months - 1);
    if (month >= startMonth && month <= emiEndMonth) {
      items.push({
        id: `cc-emi-${emi.id || emi.name}-${month}`,
        name: `CC EMI: ${emi.name}`,
        amount: emi.emiAmount || 0,
        currency: 'AED',
        type: 'debt_payment',
        source: 'auto_cc_emi',
        sourceId: emi.id,
        isPaid: false,
        cashImpact: 'cash_moves',
        icon: '\u{1F4B3}',
        color: '#f59e0b',
      });
    }
  });

  // 3. Loan/Debt monthly payments
  debts.forEach((debt: any) => {
    if (!debt.monthlyPayment || debt.monthlyPayment <= 0) return;
    const remaining = debt.totalAmount - (debt.paidAmount || 0);
    if (remaining <= 0) return;
    if (debt.debtMode !== 'i_owe') return;

    items.push({
      id: `debt-${debt.id}-${month}`,
      name: `${debt.name} (${debt.lender})`,
      amount: Math.min(debt.monthlyPayment, remaining),
      currency: debt.currency || 'AED',
      type: 'debt_payment',
      source: 'auto_loan',
      sourceId: debt.id,
      isPaid: false,
      dueDate: debt.dueDate,
      cashImpact: 'cash_moves',
      icon: '\u{1F3E6}',
      color: '#ef4444',
    });
  });

  return items;
}

// ─── Tabby Method Helpers ────────────────────────────────────────────────────

export function isTabbyMethod(method: any): boolean {
  return method?.type === 'tabby';
}

export function isTabbyProEnabled(method: any): boolean {
  return isTabbyMethod(method) && method?.tabbyProEnabled === true;
}

/**
 * Check if purchase amount is within available limit
 */
export function canTabbyPurchase(
  method: any,
  amount: number
): { allowed: boolean; available: number; message?: string } {
  if (!isTabbyMethod(method)) return { allowed: true, available: 0 };
  
  const limit = method.creditLimit || 0;
  const emis = (method.tabbyEmis || []) as TabbyPurchaseEMI[];
  const available = getTabbyAvailableLimit(limit, emis);
  
  if (amount > available) {
    return {
      allowed: false,
      available,
      message: `Tabby limit exceeded. Available: ${formatCurrency(available, 'AED')}, Trying: ${formatCurrency(amount, 'AED')}`
    };
  }
  return { allowed: true, available };
}
// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MASTER — Chart of Accounts (Phase 4 ERP)
// ═══════════════════════════════════════════════════════════════════════════════

import { setDoc, deleteDoc as deleteDocFn, writeBatch, getDocs } from 'firebase/firestore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AccountClass = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export interface GLAccount {
  id?: string;
  userId: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  accountType: string;
  parentCode?: string | null;
  description?: string | null;
  isSystemAccount: boolean;
  isActive: boolean;
  isDefault: boolean;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  paymentMethodId?: string | null;
  balance?: number;
  transactionCount?: number;
  lastTransactionDate?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

// ─── Default Chart of Accounts Seed Data ────────────────────────────────────

export const DEFAULT_GL_ACCOUNTS: Omit<GLAccount, 'id' | 'userId' | 'createdAt'>[] = [
  // ASSETS — 1000s
  { code: '1000', name: 'Current Assets',     accountClass: 'Asset',     accountType: 'Group',          isSystemAccount: true, isActive: true, isDefault: false, icon: '💰', sortOrder: 1, parentCode: null },
  { code: '1001', name: 'UAE Cash',           accountClass: 'Asset',     accountType: 'Cash',           isSystemAccount: true, isActive: true, isDefault: true,  icon: '💵', sortOrder: 2, parentCode: '1000' },
  { code: '1002', name: 'India Cash',         accountClass: 'Asset',     accountType: 'Cash',           isSystemAccount: true, isActive: true, isDefault: true,  icon: '💵', sortOrder: 3, parentCode: '1000' },
  { code: '1010', name: 'UAE Bank Accounts',  accountClass: 'Asset',     accountType: 'Bank',           isSystemAccount: true, isActive: true, isDefault: false, icon: '🏦', sortOrder: 4, parentCode: '1000' },
  { code: '1020', name: 'India Bank/UPI',     accountClass: 'Asset',     accountType: 'Bank',           isSystemAccount: true, isActive: true, isDefault: false, icon: '🏦', sortOrder: 5, parentCode: '1000' },
  { code: '1100', name: 'Investments',        accountClass: 'Asset',     accountType: 'Group',          isSystemAccount: true, isActive: true, isDefault: false, icon: '📈', sortOrder: 6, parentCode: null },
  { code: '1110', name: 'Mutual Funds / SIP', accountClass: 'Asset',     accountType: 'Investment',     isSystemAccount: true, isActive: true, isDefault: false, icon: '📊', sortOrder: 7, parentCode: '1100' },
  { code: '1120', name: 'Fixed Deposits',     accountClass: 'Asset',     accountType: 'Investment',     isSystemAccount: true, isActive: true, isDefault: false, icon: '🔒', sortOrder: 8, parentCode: '1100' },
  { code: '1130', name: 'Gold Holdings',      accountClass: 'Asset',     accountType: 'Investment',     isSystemAccount: true, isActive: true, isDefault: false, icon: '🪙', sortOrder: 9, parentCode: '1100' },
  { code: '1200', name: 'Receivables',        accountClass: 'Asset',     accountType: 'Receivable',     isSystemAccount: true, isActive: true, isDefault: false, icon: '🤝', sortOrder: 10, parentCode: null },

  // LIABILITIES — 2000s
  { code: '2000', name: 'Current Liabilities', accountClass: 'Liability', accountType: 'Group',         isSystemAccount: true, isActive: true, isDefault: false, icon: '💳', sortOrder: 20, parentCode: null },
  { code: '2001', name: 'Credit Cards',        accountClass: 'Liability', accountType: 'Credit Card',   isSystemAccount: true, isActive: true, isDefault: false, icon: '💳', sortOrder: 21, parentCode: '2000' },
  { code: '2101', name: 'Tabby / BNPL',        accountClass: 'Liability', accountType: 'BNPL',          isSystemAccount: true, isActive: true, isDefault: false, icon: '🛍️', sortOrder: 22, parentCode: '2000' },
  { code: '2100', name: 'Long-term Loans',     accountClass: 'Liability', accountType: 'Group',         isSystemAccount: true, isActive: true, isDefault: false, icon: '🏦', sortOrder: 23, parentCode: null },
  { code: '2110', name: 'Personal Loans',      accountClass: 'Liability', accountType: 'Loan',          isSystemAccount: true, isActive: true, isDefault: false, icon: '🤝', sortOrder: 24, parentCode: '2100' },
  { code: '2200', name: 'Personal Debts',      accountClass: 'Liability', accountType: 'Loan',          isSystemAccount: true, isActive: true, isDefault: false, icon: '👥', sortOrder: 25, parentCode: '2100' },

  // EQUITY — 3000s
  { code: '3001', name: 'Net Worth / Capital', accountClass: 'Equity',    accountType: 'Equity',        isSystemAccount: true, isActive: true, isDefault: true,  icon: '📊', sortOrder: 30, parentCode: null },

  // INCOME — 4000s
  { code: '4010', name: 'Salary Income',       accountClass: 'Income',    accountType: 'Primary',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '💼', sortOrder: 40, parentCode: null },
  { code: '4020', name: 'Freelance Income',    accountClass: 'Income',    accountType: 'Secondary',     isSystemAccount: true, isActive: true, isDefault: true,  icon: '🧑‍💻', sortOrder: 41, parentCode: null },
  { code: '4030', name: 'Business Income',     accountClass: 'Income',    accountType: 'Secondary',     isSystemAccount: true, isActive: true, isDefault: false, icon: '🏢', sortOrder: 42, parentCode: null },
  { code: '4040', name: 'Investment Returns',  accountClass: 'Income',    accountType: 'Passive',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '📈', sortOrder: 43, parentCode: null },
  { code: '4050', name: 'Rental Income',       accountClass: 'Income',    accountType: 'Passive',       isSystemAccount: true, isActive: true, isDefault: false, icon: '🏠', sortOrder: 44, parentCode: null },
  { code: '4060', name: 'Gift / Bonus',        accountClass: 'Income',    accountType: 'Other',         isSystemAccount: true, isActive: true, isDefault: true,  icon: '🎁', sortOrder: 45, parentCode: null },
  { code: '4090', name: 'Other Income',        accountClass: 'Income',    accountType: 'Other',         isSystemAccount: true, isActive: true, isDefault: true,  icon: '➕', sortOrder: 46, parentCode: null },

  // EXPENSES — 5000s
  { code: '5010', name: 'Rent / Accommodation', accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: true,  icon: '🏠', sortOrder: 50, parentCode: null },
  { code: '5020', name: 'Food & Dining',        accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '🍔', sortOrder: 51, parentCode: null },
  { code: '5030', name: 'Transport / Fuel',     accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '🚗', sortOrder: 52, parentCode: null },
  { code: '5040', name: 'Bank Fees & Charges',  accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: true,  icon: '🏧', sortOrder: 53, parentCode: null },
  { code: '5050', name: 'Forex / Exchange',     accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: false, icon: '💱', sortOrder: 54, parentCode: null },
  { code: '5060', name: 'Medical / Health',     accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '🏥', sortOrder: 55, parentCode: null },
  { code: '5070', name: 'Education',            accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '📚', sortOrder: 56, parentCode: null },
  { code: '5080', name: 'Shopping',             accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '🛍️', sortOrder: 57, parentCode: null },
  { code: '5081', name: 'Entertainment',        accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '🎬', sortOrder: 58, parentCode: null },
  { code: '5082', name: 'Utilities (DEWA/etc)', accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: true,  icon: '💡', sortOrder: 59, parentCode: null },
  { code: '5083', name: 'Family Support',       accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: true,  icon: '👨‍👩‍👧', sortOrder: 60, parentCode: null },
  { code: '5084', name: 'Religious / Charity',  accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: false, icon: '🛐', sortOrder: 61, parentCode: null },
  { code: '5085', name: 'EMI / Loan Payment',   accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: true,  icon: '💳', sortOrder: 62, parentCode: null },
  { code: '5086', name: 'Subscriptions',        accountClass: 'Expense', accountType: 'Fixed',          isSystemAccount: true, isActive: true, isDefault: false, icon: '📱', sortOrder: 63, parentCode: null },
  { code: '5087', name: 'Travel',               accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: false, icon: '✈️', sortOrder: 64, parentCode: null },
  { code: '5090', name: 'Other Expenses',       accountClass: 'Expense', accountType: 'Variable',       isSystemAccount: true, isActive: true, isDefault: true,  icon: '➕', sortOrder: 99, parentCode: null },
];

// ─── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Initialize default Chart of Accounts for new user
 * Idempotent — won't duplicate if already exists
 */
export async function initializeChartOfAccounts(userId: string): Promise<number> {
  if (!userId) return 0;

  // Check if already initialized
  const existing = await getDocs(
    query(collection(db, 'glAccounts'), where('userId', '==', userId))
  );
  if (!existing.empty) {
    console.log('[CoA] Already initialized:', existing.size, 'accounts');
    return 0;
  }

  // Batch create all defaults
  const batch = writeBatch(db);
  let count = 0;

  for (const account of DEFAULT_GL_ACCOUNTS) {
    const docRef = doc(collection(db, 'glAccounts'));
    batch.set(docRef, {
      ...account,
      userId,
      createdAt: serverTimestamp(),
    });
    count++;
  }

  await batch.commit();
  console.log('[CoA] Initialized', count, 'default accounts');
  return count;
}

/**
 * Listen to all GL accounts for a user
 */
export function listenGLAccounts(
  userId: string,
  callback: (accounts: GLAccount[]) => void
): () => void {
  const q = query(collection(db, 'glAccounts'), where('userId', '==', userId));
  return onSnapshot(q, snap => {
    const accounts = snap.docs.map(d => ({ id: d.id, ...d.data() } as GLAccount));
    // Sort by code
    accounts.sort((a, b) => a.code.localeCompare(b.code));
    callback(accounts);
  });
}

/**
 * Add a new custom GL account
 */
export async function addGLAccount(account: Omit<GLAccount, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'glAccounts'), {
    ...account,
    isSystemAccount: false,  // user-created
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an existing GL account
 */
export async function updateGLAccount(id: string, data: Partial<GLAccount>): Promise<void> {
  await updateDoc(doc(db, 'glAccounts', id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft delete (set isActive: false)
 * System accounts cannot be deleted
 */
export async function deactivateGLAccount(id: string, isSystem: boolean): Promise<void> {
  if (isSystem) {
    throw new Error('System accounts cannot be deleted. You can rename it instead.');
  }
  await updateDoc(doc(db, 'glAccounts', id), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Reactivate a soft-deleted account
 */
export async function reactivateGLAccount(id: string): Promise<void> {
  await updateDoc(doc(db, 'glAccounts', id), {
    isActive: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Calculate balance for a GL account from transactions
 */
export function calculateGLAccountBalance(
  account: GLAccount,
  transactions: Transaction[]
): number {
  let debits = 0;
  let credits = 0;

  transactions.forEach(tx => {
    if (tx.isReversed) return;
    if (tx.debitAccountId === account.code) debits += tx.amount;
    if (tx.creditAccountId === account.code) credits += tx.amount;
  });

  // Asset/Expense: Debit increases balance
  // Liability/Income/Equity: Credit increases balance
  if (account.accountClass === 'Asset' || account.accountClass === 'Expense') {
    return debits - credits;
  } else {
    return credits - debits;
  }
}

/**
 * Get next available code in a class
 * e.g. if 5010, 5020, 5030 exist → returns "5031"
 */
export function getNextAccountCode(
  accountClass: AccountClass,
  existingAccounts: GLAccount[]
): string {
  const prefix: Record<AccountClass, string> = {
    Asset: '1',
    Liability: '2',
    Equity: '3',
    Income: '4',
    Expense: '5',
  };

  const startRange = prefix[accountClass] + '000';
  const endRange = prefix[accountClass] + '999';

  const codesInClass = existingAccounts
    .filter(a => a.code >= startRange && a.code <= endRange)
    .map(a => parseInt(a.code))
    .sort((a, b) => b - a);

  if (codesInClass.length === 0) {
    return prefix[accountClass] + '001';
  }

  const highest = codesInClass[0];
  return String(highest + 1).padStart(4, '0');
}

/**
 * Get accounts filtered by class
 */
export function getAccountsByClass(
  accounts: GLAccount[],
  accountClass: AccountClass,
  activeOnly = true
): GLAccount[] {
  return accounts
    .filter(a => a.accountClass === accountClass)
    .filter(a => !activeOnly || a.isActive)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * Build account hierarchy tree
 */
export function buildAccountTree(accounts: GLAccount[]): Map<string, GLAccount[]> {
  const tree = new Map<string, GLAccount[]>();
  accounts.forEach(acc => {
    const parent = acc.parentCode || 'root';
    if (!tree.has(parent)) tree.set(parent, []);
    tree.get(parent)!.push(acc);
  });
  return tree;
}