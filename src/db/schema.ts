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
	db.run(`CREATE TABLE IF NOT EXISTS cards (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		credit_limit INTEGER NOT NULL,
		closing_day INTEGER NOT NULL,
		due_day INTEGER NOT NULL,
		color TEXT NOT NULL,
		active INTEGER NOT NULL,
		created_at TEXT NOT NULL
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS recurrings (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		category TEXT NOT NULL,
		type TEXT NOT NULL,
		expected_amount INTEGER NOT NULL,
		due_day INTEGER NOT NULL,
		starts_on TEXT NOT NULL,
		ends_on TEXT,
		account_id TEXT NOT NULL,
		card_id TEXT,
		active INTEGER NOT NULL,
		status_by_month TEXT NOT NULL,
		payments_by_month TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS forecasts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		amount INTEGER NOT NULL,
		type TEXT NOT NULL,
		frequency TEXT NOT NULL,
		weekdays TEXT,
		ends_on TEXT,
		status_by_day TEXT NOT NULL,
		payments_by_day TEXT NOT NULL,
		amounts_by_day TEXT NOT NULL,
		excluded_dates TEXT NOT NULL,
		date TEXT NOT NULL,
		category TEXT NOT NULL,
		account_id TEXT NOT NULL
	)`);
	db.run(`CREATE TABLE IF NOT EXISTS idempotency_keys (
		key TEXT PRIMARY KEY,
		command TEXT NOT NULL,
		result TEXT NOT NULL
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
