import type { Database } from 'bun:sqlite';
import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';

export interface Settings {
	currency: string;
	general: number;
	debts: number;
	reserve: number;
	safetyMargin: number;
}

export const defaultSettings: Settings = {
	currency: 'BRL',
	general: 70,
	debts: 20,
	reserve: 10,
	safetyMargin: 10000
};

interface SettingsRow {
	currency: string;
	general: number;
	debts: number;
	reserve: number;
	safety_margin: number;
}

export class SettingsRepository {
	private readonly db: Database;

	constructor(file: string) {
		this.db = openDatabase(file);
		ensureSchema(this.db);
	}

	read(): Settings {
		const row = this.db
			.query<SettingsRow, []>(
				'SELECT currency, general, debts, reserve, safety_margin FROM settings WHERE id = 1'
			)
			.get();
		if (!row) return { ...defaultSettings };
		return {
			currency: row.currency,
			general: row.general,
			debts: row.debts,
			reserve: row.reserve,
			safetyMargin: row.safety_margin
		};
	}

	save(settings: Settings): void {
		this.db
			.query(
				`INSERT INTO settings (id, currency, general, debts, reserve, safety_margin)
				VALUES (1, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					currency = excluded.currency,
					general = excluded.general,
					debts = excluded.debts,
					reserve = excluded.reserve,
					safety_margin = excluded.safety_margin`
			)
			.run(
				settings.currency,
				settings.general,
				settings.debts,
				settings.reserve,
				settings.safetyMargin
			);
	}

	close(): void {
		this.db.close();
	}
}
