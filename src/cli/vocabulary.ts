import type { AccountCategory, AccountType, TransactionType } from '../model';

export function accountType(value: string): AccountType {
	if (value === 'checking' || value === 'savings') return value;
	throw new Error(`unknown account type: ${value}`);
}

export function accountCategory(value: string): AccountCategory {
	if (value === 'reserve' || value === 'goal') return value;
	throw new Error(`unknown account category: ${value}`);
}

export function flowType(value: string): 'income' | 'expense' {
	if (value === 'income' || value === 'expense') return value;
	throw new Error(`unknown flow: ${value}`);
}

export function transactionType(value: string): TransactionType {
	if (value === 'income' || value === 'expense' || value === 'transfer') return value;
	throw new Error(`unknown transaction type: ${value}`);
}
