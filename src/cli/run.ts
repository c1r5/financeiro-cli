import { HELP } from '../help';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { TransactionType } from '../model';
import {
	deleteTransaction,
	listLedger,
	openAccount,
	postTransaction,
	readBalances,
	type ListFilter,
	type PostInput
} from '../sdk';
import { SystemClock } from '../system-clock';
import { UuidGenerator } from '../uuid-generator';
import { runCard } from './card-command';
import { runDebt, runDivision } from './division-command';
import { runForecast } from './forecast-command';
import { runProjection } from './projection-command';
import { runRecurring } from './recurring-command';
import { formatSettings, showSettings, updateSettings } from './settings-command';
import { accountCategory, accountType, transactionType } from './vocabulary';

export async function run(argv: string[]): Promise<number> {
	const args = [...argv];
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(HELP);
		return 0;
	}

	try {
		const file = option(args, '--file') ?? 'financeiro.sqlite';
		const repository = new SqliteLedgerRepository(file);
		const clock = new SystemClock();
		const ids = new UuidGenerator();
		try {
			await execute(args, file, repository, clock, ids);
		} finally {
			repository.close();
		}
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unknown error';
		console.error(message);
		return 1;
	}
}

async function execute(
	args: string[],
	file: string,
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const command = args[0];
	if (command === 'account' && args[1] === 'open') {
		await open(args.slice(2), repository, clock, ids);
		return;
	}
	if (command === 'balance') {
		const balances = await readBalances(repository, clock);
		console.log(`available ${balances.available}`);
		console.log(`savings ${balances.savings}`);
		console.log(`total ${balances.total}`);
		return;
	}
	if (command === 'post') {
		await post(args.slice(1), repository, clock, ids);
		return;
	}
	if (command === 'list') {
		await list(args.slice(1), repository);
		return;
	}
	if (command === 'remove') {
		const id = args[1];
		if (!id) throw new Error('missing id');
		await deleteTransaction(repository, id);
		return;
	}
	if (command === 'card') {
		await runCard(args, file, repository, clock, ids);
		return;
	}
	if (command === 'recurring') {
		await runRecurring(args, file, repository, clock, ids);
		return;
	}
	if (command === 'forecast') {
		await runForecast(args, file, repository, clock, ids);
		return;
	}
	if (command === 'projection') {
		await runProjection(args, file, repository, clock);
		return;
	}
	if (command === 'division') {
		await runDivision(args, file, repository, clock);
		return;
	}
	if (command === 'debt') {
		await runDebt(args, file, repository, clock);
		return;
	}
	if (command === 'settings' && args[1] === 'show') {
		for (const line of formatSettings(showSettings(file))) console.log(line);
		return;
	}
	if (command === 'settings' && args[1] === 'set') {
		const saved = updateSettings(file, args.slice(2));
		for (const line of formatSettings(saved)) console.log(line);
		return;
	}
	throw new Error(`unknown command: ${command}`);
}

async function open(
	flags: string[],
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const category = option(flags, '--category');
	const linked = option(flags, '--linked');
	const opened = openAccount({
		id: ids.newId(),
		transactionId: ids.newId(),
		createdAt: clock.now(),
		today: clock.today(),
		type: accountType(required(flags, '--type')),
		name: required(flags, '--name'),
		description: '',
		openingBalance: cents(required(flags, '--balance')),
		linkedAccountId: linked,
		category: category ? accountCategory(category) : undefined
	});
	await repository.saveAccount(opened.account);
	if (opened.transaction) await repository.insertTransaction(opened.transaction);
	console.log(opened.account.id);
}

async function post(
	flags: string[],
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const input: PostInput = {
		date: required(flags, '--date'),
		description: required(flags, '--description'),
		type: transactionType(required(flags, '--type')),
		amount: cents(required(flags, '--amount')),
		category: option(flags, '--category') ?? 'outros',
		accountId: required(flags, '--account')
	};
	const destination = option(flags, '--to');
	if (destination) input.destinationAccountId = destination;
	const transaction = await postTransaction(repository, clock, ids, input);
	console.log(transaction.id);
}

async function list(flags: string[], repository: SqliteLedgerRepository): Promise<void> {
	const filter: ListFilter = {};
	const month = option(flags, '--month');
	const year = option(flags, '--year');
	if (month !== undefined && year !== undefined) {
		filter.month = Number(month);
		filter.year = Number(year);
	}
	const type = option(flags, '--type');
	if (type) filter.type = transactionType(type);
	const text = option(flags, '--text');
	if (text) filter.text = text;
	const rows = await listLedger(repository, filter);
	for (const transaction of rows) {
		console.log(formatTransaction(transaction));
	}
}

function formatTransaction(transaction: {
	id: string;
	date: string;
	type: TransactionType;
	amount: number;
	description: string;
}): string {
	const { id, date, type, amount, description } = transaction;
	return `${id} ${date} ${type} ${amount} ${description}`;
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
	args.splice(index, 2);
	return value;
}

function required(args: string[], name: string): string {
	const value = option(args, name);
	if (value === undefined) throw new Error(`missing ${name}`);
	return value;
}

function cents(value: string): number {
	if (!/^-?\d+$/.test(value)) throw new Error(`invalid amount: ${value}`);
	return Number(value);
}
