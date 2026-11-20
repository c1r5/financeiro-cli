import type { Database } from 'bun:sqlite';

export function ensureSchema(db: Database): void {
	db.run(`CREATE TABLE IF NOT EXISTS accounts (
		id TEXT PRIMARY KEY,
		type TEXT NOT NULL,
		name TEXT NOT NULL,
		description TEXT NOT NULL,
		opening_balance INTEGER NOT NULL,
		active INTEGER NOT NULL,
		linked_account_id TEXT,
		category TEXT,
		created_at TEXT NOT NULL
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS transactions (
		id TEXT PRIMARY KEY,
		date TEXT NOT NULL,
		description TEXT NOT NULL,
		type TEXT NOT NULL,
		amount INTEGER NOT NULL,
		category TEXT NOT NULL,
		account_id TEXT NOT NULL,
		destination_account_id TEXT,
		card_id TEXT,
		invoice_reference TEXT,
		installment_current INTEGER,
		installment_total INTEGER,
		installment_group_id TEXT,
		created_at TEXT NOT NULL
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		currency TEXT NOT NULL,
		general INTEGER NOT NULL,
		debts INTEGER NOT NULL,
		reserve INTEGER NOT NULL,
		safety_margin INTEGER NOT NULL
	)`);
}
