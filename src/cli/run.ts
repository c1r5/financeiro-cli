import { CATEGORIAS } from 'financeiro-sdk';
import { usage } from '../help';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Account, Transaction, TransactionType } from '../model';
import {
	deleteTransaction,
	listLedger,
	openAccount,
	postTransaction,
	readBalances,
	type ListFilter,
	type PostInput
} from '../sdk';
import type { Settings } from '../settings/settings';
import { SystemClock } from '../system-clock';
import { UuidGenerator } from '../uuid-generator';
import { runCard } from './card-command';
import { runDebt, runDivision } from './division-command';
import { runForecast } from './forecast-command';
import { fail, present, takeBoolean, type Reply } from './output';
import { runProjection } from './projection-command';
import { runRecurring } from './recurring-command';
import { recordLines } from './record';
import { formatSettings, showSettings, updateSettings } from './settings-command';
import { accountCategory, accountType, transactionCategory, transactionType } from './vocabulary';

export async function run(argv: string[]): Promise<number> {
	const args = [...argv];
	const json = takeBoolean(args, '--json');
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		const text = usage(args);
		present(json, text.split('\n'), { usage: text });
		return 0;
	}

	let data: unknown = {};
	const reply: Reply = (lines, payload) => {
		data = payload;
		if (!json) {
			for (const line of lines) console.log(line);
		}
	};

	try {
		const fromEnv = process.env.FINANCEIRO_FILE;
		const file = option(args, '--file') ?? (fromEnv ? fromEnv : 'financeiro.sqlite');
		const repository = new SqliteLedgerRepository(file);
		const clock = new SystemClock();
		const ids = new UuidGenerator();
		try {
			await execute(args, file, repository, clock, ids, reply);
		} finally {
			repository.close();
		}
		if (json) console.log(JSON.stringify({ ok: true, data }));
		return 0;
	} catch (error) {
		return fail(json, error);
	}
}

async function execute(
	args: string[],
	file: string,
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
): Promise<void> {
	const command = args[0];
	if (command === 'account' && args[1] === 'list') {
		const accounts = (await repository.listAccounts()).map(accountData);
		reply(recordLines(accounts), { accounts });
		return;
	}
	if (command === 'category' && args[1] === 'list') {
		const categories = CATEGORIAS.map((category) => ({
			value: category.value,
			label: category.label,
			flow: category.fluxo.map((flow) => (flow === 'entrada' ? 'income' : 'expense')),
			group: category.grupo === 'divida' ? 'debt' : null
		}));
		reply(recordLines(categories), { categories });
		return;
	}
	if (command === 'account' && args[1] === 'open') {
		await open(args.slice(2), repository, clock, ids, reply);
		return;
	}
	if (command === 'balance') {
		const balances = await readBalances(repository, clock);
		reply(
			[`available ${balances.available}`, `savings ${balances.savings}`, `total ${balances.total}`],
			balances
		);
		return;
	}
	if (command === 'post') {
		await post(args.slice(1), repository, clock, ids, reply);
		return;
	}
	if (command === 'list') {
		await list(args.slice(1), repository, reply);
		return;
	}
	if (command === 'remove') {
		const id = args[1];
		if (!id) throw new Error('missing id');
		await deleteTransaction(repository, id);
		reply([], { id });
		return;
	}
	if (command === 'card') {
		await runCard(args, file, repository, clock, ids, reply);
		return;
	}
	if (command === 'recurring') {
		await runRecurring(args, file, repository, clock, ids, reply);
		return;
	}
	if (command === 'forecast') {
		await runForecast(args, file, repository, clock, ids, reply);
		return;
	}
	if (command === 'projection') {
		await runProjection(args, file, repository, clock, reply);
		return;
	}
	if (command === 'division') {
		await runDivision(args, file, repository, clock, reply);
		return;
	}
	if (command === 'debt') {
		await runDebt(args, file, repository, clock, reply);
		return;
	}
	if (command === 'settings' && args[1] === 'show') {
		const settings = showSettings(file);
		reply(formatSettings(settings), settingsData(settings));
		return;
	}
	if (command === 'settings' && args[1] === 'set') {
		const saved = updateSettings(file, args.slice(2));
		reply(formatSettings(saved), settingsData(saved));
		return;
	}
	throw new Error(`unknown command: ${command}`);
}

function accountData(account: Account): Record<string, unknown> {
	return {
		id: account.id,
		type: account.type,
		name: account.name,
		description: account.description,
		openingBalance: account.openingBalance,
		active: account.active,
		linkedAccountId: account.linkedAccountId ?? null,
		category: account.category ?? null
	};
}

function settingsData(settings: Settings): {
	currency: string;
	general: number;
	debts: number;
	reserve: number;
	margin: number;
} {
	return {
		currency: settings.currency,
		general: settings.general,
		debts: settings.debts,
		reserve: settings.reserve,
		margin: settings.safetyMargin
	};
}

async function open(
	flags: string[],
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
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
	reply([opened.account.id], { id: opened.account.id });
}

async function post(
	flags: string[],
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
): Promise<void> {
	const input: PostInput = {
		date: required(flags, '--date'),
		description: required(flags, '--description'),
		type: transactionType(required(flags, '--type')),
		amount: cents(required(flags, '--amount')),
		category: transactionCategory(option(flags, '--category') ?? 'outros'),
		accountId: required(flags, '--account')
	};
	const destination = option(flags, '--to');
	if (destination) input.destinationAccountId = destination;
	const transaction = await postTransaction(repository, clock, ids, input);
	reply([transaction.id], { id: transaction.id });
}

async function list(
	flags: string[],
	repository: SqliteLedgerRepository,
	reply: Reply
): Promise<void> {
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
	reply(rows.map(formatTransaction), { transactions: rows.map(transactionData) });
}

function transactionData(transaction: Transaction): {
	id: string;
	date: string;
	description: string;
	type: TransactionType;
	amount: number;
	category: string;
	accountId: string;
	destinationAccountId: string | null;
	cardId: string | null;
	invoiceReference: string | null;
	installment: Transaction['installment'] | null;
	installmentGroupId: string | null;
	createdAt: string;
} {
	return {
		id: transaction.id,
		date: transaction.date,
		description: transaction.description,
		type: transaction.type,
		amount: transaction.amount,
		category: transaction.category,
		accountId: transaction.accountId,
		destinationAccountId: transaction.destinationAccountId ?? null,
		cardId: transaction.cardId ?? null,
		invoiceReference: transaction.invoiceReference ?? null,
		installment: transaction.installment ?? null,
		installmentGroupId: transaction.installmentGroupId ?? null,
		createdAt: transaction.createdAt
	};
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
