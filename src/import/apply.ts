import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';
import type { Account, Card, Forecast, Recurring, Transaction } from '../model';
import { checkSettings } from '../sdk';
import type { Settings } from '../settings/settings';
import { planImport, type PlanRef } from './plan';
import type { ParsedImport } from './source';
import type { ImportEntity } from './select';

export interface AppliedImport {
	inserted: PlanRef[];
	unchanged: PlanRef[];
}

const ORDER: ImportEntity[] = ['account', 'card', 'transaction', 'recurring', 'forecast', 'settings'];

export async function applyImport(
	source: ParsedImport,
	file: string,
	entity: ImportEntity,
	selected: unknown[],
	withDeps: boolean,
	onAccount: string | undefined,
	allowDangling: boolean
): Promise<AppliedImport> {
	const planned = await planImport(source, file, entity, selected, withDeps, onAccount);
	if (planned.conflict.length > 0) {
		throw new Error(`invalid import conflict: ${planned.conflict.map((row) => row.id).join(' ')}`);
	}
	const blocked = planned.blocked.filter((row) => !allowDangling || !storable(source, row, onAccount));
	if (blocked.length > 0) {
		throw new Error(`invalid import blocked: ${blocked[0].id} ${blocked[0].missing}`);
	}
	const writing = [
		...planned.insert,
		...(allowDangling ? planned.blocked.filter((row) => storable(source, row, onAccount)) : [])
	];
	if (writing.length === 0) return { inserted: [], unchanged: planned.unchanged };
	const db = openDatabase(file);
	ensureSchema(db);
	const write = db.transaction(() => {
		for (const row of sort(writing)) {
			if (row.entity === 'account') insertAccount(db, must(source.accounts, row.id));
			else if (row.entity === 'card') insertCard(db, must(source.cards, row.id));
			else if (row.entity === 'transaction') insertTransaction(db, must(source.transactions, row.id));
			else if (row.entity === 'recurring') insertRecurring(db, must(source.recurrings, row.id));
			else if (row.entity === 'forecast') insertForecast(db, forecastFrom(source, row.id, onAccount));
			else insertSettings(db, source.settings);
		}
	});
	try {
		write();
	} finally {
		db.close();
	}
	return { inserted: sort(writing), unchanged: planned.unchanged };
}

function storable(source: ParsedImport, row: PlanRef, onAccount: string | undefined): boolean {
	if (row.entity === 'forecast') {
		const forecast = source.forecasts.find((item) => item.id === row.id);
		return Boolean(forecast && (forecast.accountId || onAccount));
	}
	if (row.entity === 'account') return source.accounts.some((item) => item.id === row.id);
	if (row.entity === 'card') return source.cards.some((item) => item.id === row.id);
	if (row.entity === 'transaction') return source.transactions.some((item) => item.id === row.id);
	if (row.entity === 'recurring') return source.recurrings.some((item) => item.id === row.id);
	return row.entity === 'settings';
}

function forecastFrom(source: ParsedImport, id: string, onAccount: string | undefined): Forecast {
	const forecast = must(source.forecasts, id);
	const accountId = forecast.accountId ?? onAccount;
	if (!accountId) throw new Error(`invalid import blocked: ${id} account`);
	return {
		id: forecast.id,
		name: forecast.name,
		amount: forecast.amount,
		type: forecast.type,
		frequency: forecast.frequency,
		weekdays: forecast.weekdays ?? undefined,
		endsOn: forecast.endsOn ?? undefined,
		statusByDay: {},
		paymentsByDay: {},
		amountsByDay: {},
		excluded: [],
		date: forecast.date,
		category: forecast.category,
		accountId
	};
}

function must<T extends { id: string }>(rows: T[], id: string): T {
	const found = rows.find((row) => row.id === id);
	if (!found) throw new Error(`invalid import blocked: ${id}`);
	return found;
}

function sort(rows: PlanRef[]): PlanRef[] {
	return [...rows].sort(
		(left, right) => ORDER.indexOf(left.entity) - ORDER.indexOf(right.entity) || left.id.localeCompare(right.id)
	);
}

function insertAccount(db: ReturnType<typeof openDatabase>, account: Account): void {
	db.query(
		`INSERT INTO accounts (
			id, type, name, description, opening_balance, active,
			linked_account_id, category, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		account.id,
		account.type,
		account.name,
		account.description,
		account.openingBalance,
		account.active ? 1 : 0,
		account.linkedAccountId ?? null,
		account.category ?? null,
		account.createdAt
	);
}

function insertCard(db: ReturnType<typeof openDatabase>, card: Card): void {
	db.query(
		`INSERT INTO cards (
			id, name, credit_limit, closing_day, due_day, color, active, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(card.id, card.name, card.limit, card.closingDay, card.dueDay, card.color, card.active ? 1 : 0, card.createdAt);
}

function insertTransaction(db: ReturnType<typeof openDatabase>, transaction: Transaction): void {
	db.query(
		`INSERT INTO transactions (
			id, date, description, type, amount, category, account_id,
			destination_account_id, card_id, invoice_reference,
			installment_current, installment_total, installment_group_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		transaction.id,
		transaction.date,
		transaction.description,
		transaction.type,
		transaction.amount,
		transaction.category,
		transaction.accountId,
		transaction.destinationAccountId ?? null,
		transaction.cardId ?? null,
		transaction.invoiceReference ?? null,
		transaction.installment?.current ?? null,
		transaction.installment?.total ?? null,
		transaction.installmentGroupId ?? null,
		transaction.createdAt
	);
}

function insertRecurring(db: ReturnType<typeof openDatabase>, recurring: Recurring): void {
	db.query(
		`INSERT INTO recurrings (
			id, name, category, type, expected_amount, due_day, starts_on, ends_on,
			account_id, card_id, active, status_by_month, payments_by_month, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		recurring.id,
		recurring.name,
		recurring.category,
		recurring.type,
		recurring.expectedAmount,
		recurring.dueDay,
		recurring.startsOn,
		recurring.endsOn ?? null,
		recurring.accountId,
		recurring.cardId ?? null,
		recurring.active ? 1 : 0,
		JSON.stringify(recurring.statusByMonth),
		JSON.stringify(recurring.paymentsByMonth),
		recurring.createdAt
	);
}

function insertForecast(db: ReturnType<typeof openDatabase>, forecast: Forecast): void {
	db.query(
		`INSERT INTO forecasts (
			id, name, amount, type, frequency, weekdays, ends_on, status_by_day,
			payments_by_day, amounts_by_day, excluded_dates, date, category, account_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		forecast.id,
		forecast.name,
		forecast.amount,
		forecast.type,
		forecast.frequency,
		forecast.weekdays ? JSON.stringify(forecast.weekdays) : null,
		forecast.endsOn ?? null,
		JSON.stringify(forecast.statusByDay),
		JSON.stringify(forecast.paymentsByDay),
		JSON.stringify(forecast.amountsByDay),
		JSON.stringify(forecast.excluded),
		forecast.date,
		forecast.category,
		forecast.accountId
	);
}

function insertSettings(db: ReturnType<typeof openDatabase>, settings: Settings): void {
	let checked: Settings;
	try {
		checked = checkSettings(settings);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'settings';
		throw new Error(`invalid import file: ${message}`);
	}
	db.query(
		`INSERT INTO settings (id, currency, general, debts, reserve, safety_margin)
		VALUES (1, ?, ?, ?, ?, ?)`
	).run(checked.currency, checked.general, checked.debts, checked.reserve, checked.safetyMargin);
}
