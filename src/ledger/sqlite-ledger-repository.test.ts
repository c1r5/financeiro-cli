import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Account, Transaction } from '../model';
import { SqliteLedgerRepository } from './sqlite-ledger-repository';

test('sqlite saves an account and a transaction, then deletes the transaction', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-'));
	const repository = new SqliteLedgerRepository(join(dir, 'ledger.sqlite'));
	const account: Account = {
		id: 'cc',
		type: 'checking',
		name: 'Nubank',
		description: '',
		openingBalance: 0,
		active: true,
		createdAt: '2026-11-20T12:00:00.000Z'
	};
	const transaction: Transaction = {
		id: 'tx',
		date: '2026-11-20',
		description: 'Market',
		type: 'expense',
		amount: 1500,
		category: 'mercado',
		accountId: 'cc',
		createdAt: account.createdAt
	};
	await repository.saveAccount(account);
	await repository.insertTransaction(transaction);
	expect(await repository.listAccounts()).toEqual([account]);
	expect(await repository.listTransactions()).toEqual([transaction]);
	await repository.deleteTransaction(transaction.id);
	expect(await repository.listTransactions()).toEqual([]);
	expect(await repository.listAccounts()).toEqual([account]);
	repository.close();
	await rm(dir, { recursive: true, force: true });
});
