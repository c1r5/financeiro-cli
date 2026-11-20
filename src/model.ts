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

export type RecurringType = 'income' | 'expense';

export type RecurringStatus = 'expected' | 'paid';

export interface Recurring {
	id: string;
	name: string;
	category: string;
	type: RecurringType;
	expectedAmount: number;
	dueDay: number;
	startsOn: string;
	endsOn?: string;
	accountId: string;
	cardId?: string;
	active: boolean;
	statusByMonth: Record<string, RecurringStatus>;
	paymentsByMonth: Record<string, string>;
	createdAt: string;
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
