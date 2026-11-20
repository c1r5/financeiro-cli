import { Database } from 'bun:sqlite';

export function openDatabase(file: string): Database {
	const db = new Database(file);
	db.exec('PRAGMA busy_timeout = 5000');
	return db;
}
