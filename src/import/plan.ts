import { existsSync } from 'node:fs';
import { CardRepository } from '../cards/cards';
import { ForecastRepository } from '../forecasts/forecasts';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Account, Card, Forecast, Recurring, Transaction } from '../model';
import { RecurringRepository } from '../recurring/recurrings';
import { SettingsRepository, type Settings } from '../settings/settings';
import type { ImportForecast, ParsedImport } from './source';
import {
	accountRow,
	cardRow,
	forecastRow,
	recurringRow,
	transactionRow,
	type ImportEntity
} from './select';

export interface PlanRef {
	entity: ImportEntity;
	id: string;
}

export interface PlanConflict extends PlanRef {
	fields: string[];
}

export interface PlanBlock extends PlanRef {
	missing: string;
}

export interface ImportPlan {
	insert: PlanRef[];
	unchanged: PlanRef[];
	conflict: PlanConflict[];
	blocked: PlanBlock[];
	deps: PlanRef[];
}

interface Piece {
	entity: ImportEntity;
	id: string;
	normalized: Record<string, unknown>;
	selected: boolean;
}

interface Destination {
	accounts: Map<string, Account>;
	cards: Map<string, Card>;
	transactions: Map<string, Transaction>;
	recurrings: Map<string, Recurring>;
	forecasts: Map<string, Forecast>;
	settings: Settings | null;
}

const ORDER: ImportEntity[] = ['account', 'card', 'transaction', 'recurring', 'forecast', 'settings'];

export async function planImport(
	source: ParsedImport,
	file: string,
	entity: ImportEntity,
	selected: unknown[],
	withDeps: boolean,
	onAccount: string | undefined
): Promise<ImportPlan> {
	const records = selectedRecords(source, entity, selected, onAccount);
	const destination = await readDestination(file);
	const pieces = collect(source, records, withDeps);
	const present = new Set(pieces.map(keyOf));
	const insert: PlanRef[] = [];
	const unchanged: PlanRef[] = [];
	const conflict: PlanConflict[] = [];
	const blocked: PlanBlock[] = [];
	for (const piece of pieces) {
		if (piece.entity === 'forecast' && typeof piece.normalized.accountId !== 'string') {
			blocked.push({ entity: piece.entity, id: piece.id, missing: 'account' });
			continue;
		}
		const missing = requiredRefs(piece).find(
			(ref) => !present.has(keyOf(ref)) && !destinationHas(destination, ref)
		);
		if (missing) {
			blocked.push({ entity: piece.entity, id: piece.id, missing: `${missing.reason} ${missing.id}` });
			continue;
		}
		const current = destinationRow(destination, piece);
		if (!current) {
			insert.push({ entity: piece.entity, id: piece.id });
			continue;
		}
		const fields = diff(piece.normalized, current);
		if (fields.length === 0) unchanged.push({ entity: piece.entity, id: piece.id });
		else conflict.push({ entity: piece.entity, id: piece.id, fields });
	}
	const sort = <T extends PlanRef>(rows: T[]) =>
		rows.sort(
			(left, right) =>
				ORDER.indexOf(left.entity) - ORDER.indexOf(right.entity) || left.id.localeCompare(right.id)
		);
	return {
		insert: sort(insert),
		unchanged: sort(unchanged),
		conflict: sort(conflict),
		blocked: sort(blocked),
		deps: sort(pieces.filter((piece) => !piece.selected).map((piece) => ({ entity: piece.entity, id: piece.id })))
	};
}

function selectedRecords(
	source: ParsedImport,
	entity: ImportEntity,
	selected: unknown[],
	onAccount: string | undefined
): Piece[] {
	if (entity === 'forecast' && onAccount !== undefined) {
		const forecasts = source.forecasts.filter((forecast) =>
			selected.some((row) => (row as { id: string }).id === forecast.id)
		);
		if (forecasts.some((forecast) => forecast.accountId)) {
			throw new Error('invalid import filter: --on-account');
		}
	}
	if (entity !== 'forecast' && onAccount !== undefined) {
		throw new Error('invalid import filter: --on-account');
	}
	return selected.map((row) => {
		const id = entity === 'settings' ? '1' : (row as { id: string }).id;
		const record = entity === 'forecast' && onAccount !== undefined ? { ...(row as object), accountId: onAccount } : row;
		return {
			entity,
			id,
			normalized: record as Record<string, unknown>,
			selected: true
		};
	});
}

function collect(source: ParsedImport, seeds: Piece[], withDeps: boolean): Piece[] {
	const pieces = new Map<string, Piece>();
	for (const seed of seeds) pieces.set(keyOf(seed), seed);
	if (!withDeps) return [...pieces.values()];
	let grew = true;
	while (grew) {
		grew = false;
		for (const piece of [...pieces.values()]) {
			for (const ref of requiredRefs(piece)) {
				const id = keyOf(ref);
				if (pieces.has(id)) continue;
				const found = materialize(source, ref);
				if (!found) continue;
				pieces.set(id, found);
				grew = true;
			}
		}
	}
	return [...pieces.values()];
}

interface Need extends PlanRef {
	reason: string;
}

function requiredRefs(piece: Piece): Need[] {
	if (piece.entity === 'account') {
		const linked = piece.normalized.linkedAccountId;
		return typeof linked === 'string' ? [{ entity: 'account', id: linked, reason: 'account' }] : [];
	}
	if (piece.entity === 'recurring') {
		const refs: Need[] = [
			{ entity: 'account', id: String(piece.normalized.accountId), reason: 'account' }
		];
		if (typeof piece.normalized.cardId === 'string') {
			refs.push({ entity: 'card', id: piece.normalized.cardId, reason: 'card' });
		}
		const payments = piece.normalized.paymentsByMonth;
		if (payments && typeof payments === 'object') {
			for (const paymentId of Object.values(payments as Record<string, string>)) {
				refs.push({ entity: 'transaction', id: paymentId, reason: 'payment' });
			}
		}
		return refs;
	}
	if (piece.entity === 'transaction') {
		const type = piece.normalized.type;
		if (type === 'card-expense') {
			const cardId = piece.normalized.cardId ?? piece.normalized.accountId;
			return [{ entity: 'card', id: String(cardId), reason: 'card' }];
		}
		if (type === 'invoice-payment') {
			const refs: Need[] = [{ entity: 'account', id: String(piece.normalized.accountId), reason: 'account' }];
			if (typeof piece.normalized.cardId === 'string') {
				refs.push({ entity: 'card', id: piece.normalized.cardId, reason: 'card' });
			}
			return refs;
		}
		const refs: Need[] = [{ entity: 'account', id: String(piece.normalized.accountId), reason: 'account' }];
		if (typeof piece.normalized.destinationAccountId === 'string') {
			refs.push({ entity: 'account', id: piece.normalized.destinationAccountId, reason: 'account' });
		}
		return refs;
	}
	if (piece.entity === 'forecast') {
		const accountId = piece.normalized.accountId;
		return typeof accountId === 'string' ? [{ entity: 'account', id: accountId, reason: 'account' }] : [];
	}
	return [];
}

function materialize(source: ParsedImport, ref: PlanRef): Piece | undefined {
	if (ref.entity === 'account') {
		const account = source.accounts.find((item) => item.id === ref.id);
		return account ? { entity: 'account', id: account.id, normalized: accountRow(account), selected: false } : undefined;
	}
	if (ref.entity === 'card') {
		const card = source.cards.find((item) => item.id === ref.id);
		return card ? { entity: 'card', id: card.id, normalized: cardRow(card), selected: false } : undefined;
	}
	if (ref.entity === 'transaction') {
		const transaction = source.transactions.find((item) => item.id === ref.id);
		return transaction
			? { entity: 'transaction', id: transaction.id, normalized: transactionRow(transaction), selected: false }
			: undefined;
	}
	if (ref.entity === 'recurring') {
		const recurring = source.recurrings.find((item) => item.id === ref.id);
		return recurring
			? { entity: 'recurring', id: recurring.id, normalized: recurringRow(recurring), selected: false }
			: undefined;
	}
	if (ref.entity === 'forecast') {
		const forecast = source.forecasts.find((item) => item.id === ref.id);
		return forecast
			? { entity: 'forecast', id: forecast.id, normalized: forecastRecord(forecast), selected: false }
			: undefined;
	}
	return undefined;
}

function forecastRecord(forecast: ImportForecast): Record<string, unknown> {
	return {
		...forecastRow(forecast),
		statusByDay: {},
		paymentsByDay: {},
		amountsByDay: {},
		excluded: []
	};
}

function destinationRow(destination: Destination, piece: Piece): Record<string, unknown> | undefined {
	if (piece.entity === 'account') {
		const account = destination.accounts.get(piece.id);
		return account ? accountRow(account) : undefined;
	}
	if (piece.entity === 'card') {
		const card = destination.cards.get(piece.id);
		return card ? cardRow(card) : undefined;
	}
	if (piece.entity === 'transaction') {
		const transaction = destination.transactions.get(piece.id);
		return transaction ? transactionRow(transaction) : undefined;
	}
	if (piece.entity === 'recurring') {
		const recurring = destination.recurrings.get(piece.id);
		return recurring ? recurringRow(recurring) : undefined;
	}
	if (piece.entity === 'forecast') {
		const forecast = destination.forecasts.get(piece.id);
		return forecast ? storedForecast(forecast) : undefined;
	}
	if (piece.entity === 'settings') {
		return destination.settings
			? {
					currency: destination.settings.currency,
					general: destination.settings.general,
					debts: destination.settings.debts,
					reserve: destination.settings.reserve,
					margin: destination.settings.safetyMargin
				}
			: undefined;
	}
	return undefined;
}

function storedForecast(forecast: Forecast): Record<string, unknown> {
	return {
		id: forecast.id,
		name: forecast.name,
		amount: forecast.amount,
		type: forecast.type,
		frequency: forecast.frequency,
		weekdays: forecast.weekdays ?? null,
		endsOn: forecast.endsOn ?? null,
		date: forecast.date,
		category: forecast.category,
		accountId: forecast.accountId,
		statusByDay: forecast.statusByDay,
		paymentsByDay: forecast.paymentsByDay,
		amountsByDay: forecast.amountsByDay,
		excluded: forecast.excluded
	};
}

function destinationHas(destination: Destination, ref: PlanRef): boolean {
	if (ref.entity === 'account') return destination.accounts.has(ref.id);
	if (ref.entity === 'card') return destination.cards.has(ref.id);
	if (ref.entity === 'transaction') return destination.transactions.has(ref.id);
	if (ref.entity === 'recurring') return destination.recurrings.has(ref.id);
	if (ref.entity === 'forecast') return destination.forecasts.has(ref.id);
	return destination.settings !== null;
}

function diff(incoming: Record<string, unknown>, current: Record<string, unknown>): string[] {
	const fields: string[] = [];
	for (const key of new Set([...Object.keys(incoming), ...Object.keys(current)])) {
		if (JSON.stringify(incoming[key]) !== JSON.stringify(current[key])) fields.push(key);
	}
	return fields.sort();
}

async function readDestination(file: string): Promise<Destination> {
	if (!existsSync(file)) {
		return {
			accounts: new Map(),
			cards: new Map(),
			transactions: new Map(),
			recurrings: new Map(),
			forecasts: new Map(),
			settings: null
		};
	}
	const ledger = new SqliteLedgerRepository(file);
	const cards = new CardRepository(file);
	const recurrings = new RecurringRepository(file);
	const forecasts = new ForecastRepository(file);
	const settings = new SettingsRepository(file);
	try {
		return {
			accounts: new Map((await ledger.listAccounts()).map((account) => [account.id, account])),
			cards: new Map(cards.list().map((card) => [card.id, card])),
			transactions: new Map((await ledger.listTransactions()).map((transaction) => [transaction.id, transaction])),
			recurrings: new Map(recurrings.list().map((recurring) => [recurring.id, recurring])),
			forecasts: new Map(forecasts.list().map((forecast) => [forecast.id, forecast])),
			settings: settings.stored()
		};
	} finally {
		ledger.close();
		cards.close();
		recurrings.close();
		forecasts.close();
		settings.close();
	}
}

function keyOf(ref: PlanRef): string {
	return `${ref.entity}:${ref.id}`;
}
