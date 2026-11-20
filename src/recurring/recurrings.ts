import type { Database } from 'bun:sqlite';
import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';
import type { Recurring, RecurringStatus, RecurringType } from '../model';

interface RecurringRow {
	id: string;
	name: string;
	category: string;
	type: string;
	expected_amount: number;
	due_day: number;
	starts_on: string;
	ends_on: string | null;
	account_id: string;
	card_id: string | null;
	active: number;
	status_by_month: string;
	payments_by_month: string;
	created_at: string;
}

export class RecurringRepository {
	private readonly db: Database;

	constructor(file: string) {
		this.db = openDatabase(file);
		ensureSchema(this.db);
	}

	list(): Recurring[] {
		return this.db
			.query<RecurringRow, []>('SELECT * FROM recurrings ORDER BY created_at, id')
			.all()
			.map(recurringFromRow);
	}

	find(id: string): Recurring {
		const recurring = this.list().find((item) => item.id === id);
		if (!recurring) throw new Error(`unknown recurring: ${id}`);
		return recurring;
	}

	save(recurring: Recurring): void {
		this.db
			.query(
				`INSERT INTO recurrings (
					id, name, category, type, expected_amount, due_day, starts_on, ends_on,
					account_id, card_id, active, status_by_month, payments_by_month, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					category = excluded.category,
					type = excluded.type,
					expected_amount = excluded.expected_amount,
					due_day = excluded.due_day,
					starts_on = excluded.starts_on,
					ends_on = excluded.ends_on,
					account_id = excluded.account_id,
					card_id = excluded.card_id,
					active = excluded.active,
					status_by_month = excluded.status_by_month,
					payments_by_month = excluded.payments_by_month`
			)
			.run(
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

	close(): void {
		this.db.close();
	}
}

function recurringFromRow(row: RecurringRow): Recurring {
	const recurring: Recurring = {
		id: row.id,
		name: row.name,
		category: row.category,
		type: row.type as RecurringType,
		expectedAmount: row.expected_amount,
		dueDay: row.due_day,
		startsOn: row.starts_on,
		accountId: row.account_id,
		active: row.active === 1,
		statusByMonth: statuses(row.status_by_month),
		paymentsByMonth: JSON.parse(row.payments_by_month) as Record<string, string>,
		createdAt: row.created_at
	};
	if (row.ends_on) recurring.endsOn = row.ends_on;
	if (row.card_id) recurring.cardId = row.card_id;
	return recurring;
}

function statuses(raw: string): Record<string, RecurringStatus> {
	const parsed = JSON.parse(raw) as Record<string, string>;
	const result: Record<string, RecurringStatus> = {};
	for (const [month, status] of Object.entries(parsed)) {
		if (status !== 'expected' && status !== 'paid') throw new Error(`invalid status: ${status}`);
		result[month] = status;
	}
	return result;
}
