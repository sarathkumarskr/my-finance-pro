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

// ─── Types ───
export type TransactionType = 'income' | 'expense';
export type Country = 'UAE' | 'India';
export type Currency = 'AED' | 'INR';

export type Transaction = {
  id?: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  country: Country;
  category: string;
  subCategory?: string;

  paymentMethod?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  paymentMethodType?: string;

  note?: string;
  date: string;

  statementDateSnapshot?: number;
  paymentDueDateSnapshot?: number;
  isTabbyProSnapshot?: boolean;

  isTabby?: boolean;
  tabbyEMIs?: {
    number: number;
    amount: number;
    dueDate: string;
    paid: boolean;
  }[];
  tabbyTotalAmount?: number;

  createdAt?: any;
};

export type IncomeCategory = {
  id: string;
  name: string;
  icon: string;
};

// ─── Default Categories ───
export const defaultIncomeCategories: IncomeCategory[] = [
  { id: 'salary', name: 'Salary', icon: '💼' },
  { id: 'freelance', name: 'Freelance', icon: '🧑‍💻' },
  { id: 'business', name: 'Business', icon: '🏢' },
  { id: 'investment', name: 'Investment Returns', icon: '📈' },
  { id: 'rental', name: 'Rental Income', icon: '🏠' },
  { id: 'gift', name: 'Gift / Bonus', icon: '🎁' },
  { id: 'other', name: 'Other', icon: '➕' },
];

export const defaultExpenseCategories = [
  { id: 'rent', name: 'Rent / Accommodation', icon: '🏠' },
  { id: 'food', name: 'Food & Dining', icon: '🍔' },
  { id: 'transport', name: 'Transport / Fuel', icon: '🚗' },
  { id: 'medical', name: 'Medical / Health', icon: '💊' },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'bills', name: 'Bills & Utilities', icon: '💡' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
  { id: 'travel', name: 'Travel', icon: '✈️' },
  { id: 'family', name: 'Family', icon: '👨‍👩‍👧' },
  { id: 'religious', name: 'Religious', icon: '🛐' },
  { id: 'emi', name: 'EMI Payment', icon: '🏦' },
  { id: 'other', name: 'Other', icon: '➕' },
];

// ─── Add Transaction ───
export const addTransaction = async (
  data: Omit<Transaction, 'id' | 'createdAt'>
) => {
  const docRef = await addDoc(collection(db, 'transactions'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

// ─── Update Transaction ───
export const updateTransaction = async (
  id: string,
  data: Partial<Transaction>
) => {
  await updateDoc(doc(db, 'transactions', id), data);
};

// ─── Delete Transaction ───
export const deleteTransaction = async (id: string) => {
  await deleteDoc(doc(db, 'transactions', id));
};

// ─── Listen to Transactions (Real-time) ───
export const listenTransactions = (
  userId: string,
  type: TransactionType | 'all',
  callback: (transactions: Transaction[]) => void
) => {
  let q;

  if (type === 'all') {
    q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
  } else {
    q = query(
      collection(db, 'transactions'),
      where('userId', '==', userId),
      where('type', '==', type),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(q, (snapshot) => {
    const data: Transaction[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
    callback(data);
  });
};

// ─── Format Currency ───
export const formatCurrency = (amount: number, currency: Currency) => {
  if (currency === 'AED') {
    return `AED ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
    })}`;
  }
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
};

// ─── Get Current Month Range ───
export const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
};

// ─── Get Today ───
export const getToday = () => new Date().toISOString().split('T')[0];
