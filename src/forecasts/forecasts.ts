import type { Database } from 'bun:sqlite';
import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';
import type { Forecast, ForecastFrequency, RecurringType } from '../model';

interface ForecastRow {
	id: string;
	name: string;
	amount: number;
	type: string;
	frequency: string;
	weekdays: string | null;
	ends_on: string | null;
	status_by_day: string;
	payments_by_day: string;
	amounts_by_day: string;
	excluded_dates: string;
	date: string;
	category: string;
	account_id: string;
}

export class ForecastRepository {
	private readonly db: Database;

	constructor(file: string) {
		this.db = openDatabase(file);
		ensureSchema(this.db);
	}

	list(): Forecast[] {
		return this.db
			.query<ForecastRow, []>('SELECT * FROM forecasts ORDER BY date, id')
			.all()
			.map(forecastFromRow);
	}

	find(id: string): Forecast {
		const forecast = this.list().find((item) => item.id === id);
		if (!forecast) throw new Error(`unknown forecast: ${id}`);
		return forecast;
	}

	save(forecast: Forecast): void {
		this.db
			.query(
				`INSERT INTO forecasts (
					id, name, amount, type, frequency, weekdays, ends_on, status_by_day,
					payments_by_day, amounts_by_day, excluded_dates, date, category, account_id
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					amount = excluded.amount,
					type = excluded.type,
					frequency = excluded.frequency,
					weekdays = excluded.weekdays,
					ends_on = excluded.ends_on,
					status_by_day = excluded.status_by_day,
					payments_by_day = excluded.payments_by_day,
					amounts_by_day = excluded.amounts_by_day,
					excluded_dates = excluded.excluded_dates,
					date = excluded.date,
					category = excluded.category,
					account_id = excluded.account_id`
			)
			.run(
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

	close(): void {
		this.db.close();
	}
}

function forecastFromRow(row: ForecastRow): Forecast {
	const forecast: Forecast = {
		id: row.id,
		name: row.name,
		amount: row.amount,
		type: row.type as RecurringType,
		frequency: row.frequency as ForecastFrequency,
		statusByDay: paidDays(row.status_by_day),
		paymentsByDay: JSON.parse(row.payments_by_day) as Record<string, string>,
		amountsByDay: JSON.parse(row.amounts_by_day) as Record<string, number>,
		excluded: JSON.parse(row.excluded_dates) as string[],
		date: row.date,
		category: row.category,
		accountId: row.account_id
	};
	if (row.weekdays) forecast.weekdays = JSON.parse(row.weekdays) as number[];
	if (row.ends_on) forecast.endsOn = row.ends_on;
	return forecast;
}

function paidDays(raw: string): Record<string, 'paid'> {
	const parsed = JSON.parse(raw) as Record<string, string>;
	const result: Record<string, 'paid'> = {};
	for (const [day, status] of Object.entries(parsed)) {
		if (status !== 'paid') throw new Error(`invalid status: ${status}`);
		result[day] = 'paid';
	}
	return result;
}
