import type { Database } from 'bun:sqlite';
import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';
import type { Card } from '../model';

interface CardRow {
	id: string;
	name: string;
	credit_limit: number;
	closing_day: number;
	due_day: number;
	color: string;
	active: number;
	created_at: string;
}

export class CardRepository {
	private readonly db: Database;

	constructor(file: string) {
		this.db = openDatabase(file);
		ensureSchema(this.db);
	}

	list(): Card[] {
		return this.db
			.query<CardRow, []>('SELECT * FROM cards ORDER BY created_at, id')
			.all()
			.map(cardFromRow);
	}

	find(id: string): Card {
		const card = this.list().find((item) => item.id === id);
		if (!card) throw new Error(`unknown card: ${id}`);
		return card;
	}

	save(card: Card): void {
		this.db
			.query(
				`INSERT INTO cards (
					id, name, credit_limit, closing_day, due_day, color, active, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				card.id,
				card.name,
				card.limit,
				card.closingDay,
				card.dueDay,
				card.color,
				card.active ? 1 : 0,
				card.createdAt
			);
	}

	close(): void {
		this.db.close();
	}
}

function cardFromRow(row: CardRow): Card {
	return {
		id: row.id,
		name: row.name,
		limit: row.credit_limit,
		closingDay: row.closing_day,
		dueDay: row.due_day,
		color: row.color,
		active: row.active === 1,
		createdAt: row.created_at
	};
}
