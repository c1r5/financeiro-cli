import type { Account, Card, Recurring, Transaction } from '../model';
import { transactionCategory } from '../cli/vocabulary';
import type { ImportForecast, ParsedImport } from './source';

export type ImportEntity =
	| 'account'
	| 'card'
	| 'transaction'
	| 'invoice'
	| 'recurring'
	| 'forecast'
	| 'settings';

export interface ImportQuery {
	entity?: ImportEntity;
	ids: string[];
	name?: string;
	category?: string;
	type?: string;
	card?: string;
	account?: string;
	reference?: string;
	active?: boolean;
	month?: string;
}

const ENTITIES: ImportEntity[] = [
	'account',
	'card',
	'transaction',
	'invoice',
	'recurring',
	'forecast',
	'settings'
];

const FLAGS: Record<ImportEntity, string[]> = {
	account: ['--id', '--name', '--type', '--category', '--active'],
	card: ['--id', '--name', '--active'],
	transaction: ['--id', '--category', '--type', '--card', '--account', '--reference', '--month'],
	invoice: ['--id', '--category', '--type', '--card', '--account', '--reference', '--month'],
	recurring: ['--id', '--name', '--category', '--type', '--card', '--account', '--active', '--month'],
	forecast: ['--id', '--name', '--category', '--type', '--account'],
	settings: []
};

const TYPES: Record<ImportEntity, string[]> = {
	account: ['checking', 'savings'],
	card: [],
	transaction: ['income', 'expense', 'transfer', 'card-expense', 'invoice-payment'],
	invoice: ['income', 'expense', 'transfer', 'card-expense', 'invoice-payment'],
	recurring: ['income', 'expense'],
	forecast: ['income', 'expense'],
	settings: []
};

export function importEntity(value: string): ImportEntity {
	if (ENTITIES.includes(value as ImportEntity)) return value as ImportEntity;
	throw new Error(`invalid import entity: ${value}`);
}

export function rejectUnusedFilters(entity: ImportEntity, present: string[]): void {
	for (const flag of present) {
		if (!FLAGS[entity].includes(flag)) throw new Error(`invalid import filter: ${flag}`);
	}
}

export function assertFilterValues(entity: ImportEntity, query: ImportQuery): void {
	if (query.type !== undefined && !TYPES[entity].includes(query.type)) {
		throw new Error('invalid import filter: --type');
	}
	if (query.category === undefined) return;
	if (entity === 'account') {
		if (query.category !== 'reserve' && query.category !== 'goal') {
			throw new Error('invalid import filter: --category');
		}
		return;
	}
	transactionCategory(query.category);
}

export interface InvoiceGroup {
	cardId: string;
	reference: string;
	count: number;
	expenses: number;
	payments: number;
}

export function invoiceGroups(transactions: Transaction[]): InvoiceGroup[] {
	const groups = new Map<string, InvoiceGroup>();
	for (const transaction of transactions) {
		if (!transaction.invoiceReference) continue;
		const cardId = transaction.cardId ?? '';
		const key = `${cardId}\n${transaction.invoiceReference}`;
		const group = groups.get(key) ?? {
			cardId,
			reference: transaction.invoiceReference,
			count: 0,
			expenses: 0,
			payments: 0
		};
		group.count += 1;
		if (transaction.type === 'card-expense') group.expenses += transaction.amount;
		if (transaction.type === 'invoice-payment') group.payments += transaction.amount;
		groups.set(key, group);
	}
	return [...groups.values()].sort((left, right) =>
		`${left.reference}\n${left.cardId}`.localeCompare(`${right.reference}\n${right.cardId}`)
	);
}

export function selectEntity(source: ParsedImport, entity: ImportEntity, query: ImportQuery): unknown[] {
	if (entity === 'settings') {
		if (query.ids.length > 0) throw new Error(`invalid import id: ${query.ids[0]}`);
		return [settingsRow(source)];
	}
	const rows = rowsOf(source, entity);
	const known = new Set(rows.map((row) => row.id));
	for (const id of query.ids) {
		if (!known.has(id)) throw new Error(`invalid import id: ${id}`);
	}
	return rows.filter((row) => matches(row, entity, query)).map((row) => toRow(row, entity));
}

type Listed = Account | Card | Transaction | Recurring | ImportForecast;

function rowsOf(source: ParsedImport, entity: ImportEntity): Listed[] {
	if (entity === 'account') return source.accounts;
	if (entity === 'card') return source.cards;
	if (entity === 'transaction') return source.transactions;
	if (entity === 'invoice') return source.transactions.filter((row) => row.invoiceReference);
	if (entity === 'recurring') return source.recurrings;
	return source.forecasts;
}

function matches(row: Listed, entity: ImportEntity, query: ImportQuery): boolean {
	if (query.ids.length > 0 && !query.ids.includes(row.id)) return false;
	if (query.name !== undefined && 'name' in row && row.name !== query.name) return false;
	if (query.category !== undefined && 'category' in row && row.category !== query.category) return false;
	if (query.type !== undefined && 'type' in row && row.type !== query.type) return false;
	if (query.active !== undefined && 'active' in row && row.active !== query.active) return false;
	if (query.card !== undefined) {
		const cardId = 'cardId' in row ? row.cardId : undefined;
		if (cardId !== query.card) return false;
	}
	if (query.account !== undefined) {
		const accountId = 'accountId' in row ? row.accountId : undefined;
		if (accountId !== query.account) return false;
	}
	if (query.reference !== undefined) {
		const reference = 'invoiceReference' in row ? row.invoiceReference : undefined;
		if (reference !== query.reference) return false;
	}
	if (query.month !== undefined) {
		if (entity === 'recurring' && 'statusByMonth' in row) {
			if (!(query.month in row.statusByMonth)) return false;
		} else if ('date' in row) {
			if (!row.date.startsWith(query.month)) return false;
		}
	}
	return true;
}

function toRow(row: Listed, entity: ImportEntity): Record<string, unknown> {
	if (entity === 'account') return accountRow(row as Account);
	if (entity === 'card') return cardRow(row as Card);
	if (entity === 'transaction' || entity === 'invoice') return transactionRow(row as Transaction);
	if (entity === 'recurring') return recurringRow(row as Recurring);
	return forecastRow(row as ImportForecast);
}

export function accountRow(account: Account): Record<string, unknown> {
	return {
		id: account.id,
		type: account.type,
		name: account.name,
		description: account.description,
		openingBalance: account.openingBalance,
		active: account.active,
		linkedAccountId: account.linkedAccountId ?? null,
		category: account.category ?? null,
		createdAt: account.createdAt
	};
}

export function cardRow(card: Card): Record<string, unknown> {
	return {
		id: card.id,
		name: card.name,
		limit: card.limit,
		closingDay: card.closingDay,
		dueDay: card.dueDay,
		color: card.color,
		active: card.active,
		createdAt: card.createdAt
	};
}

export function transactionRow(transaction: Transaction): Record<string, unknown> {
	return {
		id: transaction.id,
		date: transaction.date,
		description: transaction.description,
		type: transaction.type,
		amount: transaction.amount,
		category: transaction.category,
		accountId: transaction.accountId,
		destinationAccountId: transaction.destinationAccountId ?? null,
		cardId: transaction.cardId ?? null,
		invoiceReference: transaction.invoiceReference ?? null,
		installment: transaction.installment ?? null,
		installmentGroupId: transaction.installmentGroupId ?? null,
		createdAt: transaction.createdAt
	};
}

export function recurringRow(recurring: Recurring): Record<string, unknown> {
	return {
		id: recurring.id,
		name: recurring.name,
		category: recurring.category,
		type: recurring.type,
		expectedAmount: recurring.expectedAmount,
		dueDay: recurring.dueDay,
		startsOn: recurring.startsOn,
		endsOn: recurring.endsOn ?? null,
		accountId: recurring.accountId,
		cardId: recurring.cardId ?? null,
		active: recurring.active,
		statusByMonth: recurring.statusByMonth,
		paymentsByMonth: recurring.paymentsByMonth,
		createdAt: recurring.createdAt
	};
}

export function forecastRow(forecast: ImportForecast): Record<string, unknown> {
	return {
		id: forecast.id,
		name: forecast.name,
		amount: forecast.amount,
		type: forecast.type,
		frequency: forecast.frequency,
		weekdays: forecast.weekdays,
		endsOn: forecast.endsOn,
		date: forecast.date,
		category: forecast.category,
		accountId: forecast.accountId
	};
}

export function settingsRow(source: ParsedImport): Record<string, unknown> {
	return {
		currency: source.settings.currency,
		general: source.settings.general,
		debts: source.settings.debts,
		reserve: source.settings.reserve,
		margin: source.settings.safetyMargin
	};
}
