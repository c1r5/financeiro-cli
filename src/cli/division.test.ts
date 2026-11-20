import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('division keeps the 70/20/10 residue and debt list uses the paid amount', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-division-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const year = today.slice(0, 4);
		const month = String(Number(today.slice(5, 7)));
		const monthRef = today.slice(0, 7);
		expect(await open(file, 'checking', 'Cash', '10000')).toBe(0);
		const cashId = lines.at(-1) ?? '';
		expect(await open(file, 'savings', 'Nest', '8000', ['--category', 'goal'])).toBe(0);
		expect(await open(file, 'savings', 'Safe', '5000', ['--category', 'reserve'])).toBe(0);
		expect(await income(file, cashId)).toBe(0);
		expect(await dailyIncome(file, cashId)).toBe(0);
		expect(await onceDebt(file, cashId, monthRef)).toBe(0);
		const taxId = lines.at(-1) ?? '';
		expect(await debtRecurring(file, 'Loan', '3000', '20', cashId)).toBe(0);
		const loanId = lines.at(-1) ?? '';
		expect(await debtRecurring(file, 'Bill', '4000', '10', cashId)).toBe(0);
		const billId = lines.at(-1) ?? '';
		expect(await dailyDebt(file, cashId)).toBe(0);
		expect(
			await run([
				'--file',
				file,
				'recurring',
				'pay',
				'--id',
				billId,
				'--month',
				monthRef,
				'--amount',
				'2500'
			])
		).toBe(0);
		const beforeShow = lines.length;
		expect(
			await run(['--file', file, 'division', 'show', '--month', month, '--year', year])
		).toBe(0);
		expect(lines.slice(beforeShow)).toEqual([
			'general 7001',
			'debts 2000',
			'reserve 1000',
			'income 10001',
			'saved 5000'
		]);
		const beforeList = lines.length;
		expect(await run(['--file', file, 'debt', 'list', '--month', month, '--year', year])).toBe(0);
		expect(lines.slice(beforeList)).toEqual([
			`payable ${monthRef}-05 1500 Tax prev:${taxId}`,
			`payable ${monthRef}-20 3000 Loan rec:${loanId}`,
			`paid ${monthRef}-10 2500 Bill rec:${billId}`
		]);
		expect(lines.slice(beforeList).some((line) => line.includes('Snack'))).toBe(false);
		const beforeCost = lines.length;
		expect(
			await run([
				'--file',
				file,
				'debt',
				'cost',
				'--month',
				month,
				'--year',
				year,
				'--horizons',
				'1,3'
			])
		).toBe(0);
		expect(lines.slice(beforeCost)).toEqual(['1 8500 2000 6500', '3 22500 6000 16500']);
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

function open(
	file: string,
	type: string,
	name: string,
	balance: string,
	extra: string[] = []
): Promise<number> {
	return run([
		'--file',
		file,
		'account',
		'open',
		'--type',
		type,
		'--name',
		name,
		'--balance',
		balance,
		...extra
	]);
}

function income(file: string, accountId: string): Promise<number> {
	return run([
		'--file',
		file,
		'recurring',
		'add',
		'--type',
		'income',
		'--name',
		'Salary',
		'--amount',
		'10001',
		'--day',
		'1',
		'--start',
		'2020-01-01',
		'--account',
		accountId,
		'--category',
		'salario'
	]);
}

function debtRecurring(
	file: string,
	name: string,
	amount: string,
	day: string,
	accountId: string
): Promise<number> {
	return run([
		'--file',
		file,
		'recurring',
		'add',
		'--type',
		'expense',
		'--name',
		name,
		'--amount',
		amount,
		'--day',
		day,
		'--start',
		'2020-01-01',
		'--account',
		accountId,
		'--category',
		'divida'
	]);
}

function onceDebt(file: string, accountId: string, monthRef: string): Promise<number> {
	return run([
		'--file',
		file,
		'forecast',
		'add',
		'--type',
		'expense',
		'--frequency',
		'once',
		'--name',
		'Tax',
		'--amount',
		'1500',
		'--date',
		`${monthRef}-05`,
		'--category',
		'divida',
		'--account',
		accountId
	]);
}

function dailyIncome(file: string, accountId: string): Promise<number> {
	return run([
		'--file',
		file,
		'forecast',
		'add',
		'--type',
		'income',
		'--frequency',
		'daily',
		'--name',
		'Bonus',
		'--amount',
		'99999',
		'--date',
		'2020-01-01',
		'--category',
		'salario',
		'--account',
		accountId,
		'--weekdays',
		'0,1,2,3,4,5,6'
	]);
}

function dailyDebt(file: string, accountId: string): Promise<number> {
	return run([
		'--file',
		file,
		'forecast',
		'add',
		'--type',
		'expense',
		'--frequency',
		'daily',
		'--name',
		'Snack',
		'--amount',
		'50',
		'--date',
		'2020-01-01',
		'--category',
		'divida',
		'--account',
		accountId,
		'--weekdays',
		'0,1,2,3,4,5,6'
	]);
}
