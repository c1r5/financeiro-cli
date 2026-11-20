export type AccountType = 'checking' | 'savings';

export type AccountCategory = 'reserve' | 'goal';

export type TransactionType =
	| 'income'
	| 'expense'
	| 'transfer'
	| 'invoice-payment'
	| 'card-expense';

export interface Account {
	id: string;
	type: AccountType;
	name: string;
	description: string;
	openingBalance: number;
	active: boolean;
	linkedAccountId?: string;
	category?: AccountCategory;
	createdAt: string;
}

export interface Card {
	id: string;
	name: string;
	limit: number;
	closingDay: number;
	dueDay: number;
	color: string;
	active: boolean;
	createdAt: string;
}

export interface Invoice {
	reference: string;
	balance: number;
	closed: boolean;
	due: string;
	expected?: number;
}

export interface CardSummary {
	used: number;
	available: number;
	reference: string;
}

export interface Installment {
	current: number;
	total: number;
}

export interface Transaction {
	id: string;
	date: string;
	description: string;
	type: TransactionType;
	amount: number;
	category: string;
	accountId: string;
	destinationAccountId?: string;
	cardId?: string;
	invoiceReference?: string;
	installment?: Installment;
	installmentGroupId?: string;
	createdAt: string;
}
