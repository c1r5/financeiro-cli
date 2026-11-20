import type { Database } from 'bun:sqlite';
import { openDatabase } from '../db/open';
import { ensureSchema } from '../db/schema';
import type {
	Account,
	AccountCategory,
	AccountType,
	Transaction,
	TransactionType
} from '../model';

interface AccountRow {
	id: string;
	type: string;
	name: string;
	description: string;
	opening_balance: number;
	active: number;
	linked_account_id: string | null;
	category: string | null;
	created_at: string;
}

interface TransactionRow {
	id: string;
	date: string;
	description: string;
	type: string;
	amount: number;
	category: string;
	account_id: string;
	destination_account_id: string | null;
	card_id: string | null;
	invoice_reference: string | null;
	installment_current: number | null;
	installment_total: number | null;
	installment_group_id: string | null;
	created_at: string;
}

export class SqliteLedgerRepository {
	private readonly db: Database;

	constructor(file: string) {
		this.db = openDatabase(file);
		ensureSchema(this.db);
	}

	async listAccounts(): Promise<Account[]> {
		const rows = this.db
			.query<AccountRow, []>('SELECT * FROM accounts ORDER BY created_at, id')
			.all();
		return rows.map(accountFromRow);
	}

	async saveAccount(account: Account): Promise<void> {
		this.db
			.query(
				`INSERT INTO accounts (
					id, type, name, description, opening_balance, active,
					linked_account_id, category, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
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

	async listTransactions(): Promise<Transaction[]> {
		const rows = this.db
			.query<TransactionRow, []>('SELECT * FROM transactions ORDER BY created_at, id')
			.all();
		return rows.map(transactionFromRow);
	}

	async insertTransaction(transaction: Transaction): Promise<void> {
		this.db
			.query(
				`INSERT INTO transactions (
					id, date, description, type, amount, category, account_id,
					destination_account_id, card_id, invoice_reference,
					installment_current, installment_total,
					installment_group_id, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
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

	async deleteTransaction(id: string): Promise<void> {
		this.db.query('DELETE FROM transactions WHERE id = ?').run(id);
	}

	close(): void {
		this.db.close();
	}
}

function accountFromRow(row: AccountRow): Account {
	const account: Account = {
		id: row.id,
		type: row.type as AccountType,
		name: row.name,
		description: row.description,
		openingBalance: row.opening_balance,
		active: row.active === 1,
		createdAt: row.created_at
	};
	if (row.linked_account_id) account.linkedAccountId = row.linked_account_id;
	if (row.category) account.category = row.category as AccountCategory;
	return account;
}

function transactionFromRow(row: TransactionRow): Transaction {
	const transaction: Transaction = {
		id: row.id,
		date: row.date,
		description: row.description,
		type: row.type as TransactionType,
		amount: row.amount,
		category: row.category,
		accountId: row.account_id,
		createdAt: row.created_at
	};
	if (row.destination_account_id) transaction.destinationAccountId = row.destination_account_id;
	if (row.card_id) transaction.cardId = row.card_id;
	if (row.invoice_reference) transaction.invoiceReference = row.invoice_reference;
	if (row.installment_current !== null && row.installment_total !== null) {
		transaction.installment = {
			current: row.installment_current,
			total: row.installment_total
		};
	}
	if (row.installment_group_id) transaction.installmentGroupId = row.installment_group_id;
	return transaction;
}
