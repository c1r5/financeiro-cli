import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('projection drops open events once and prints the daily limit', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-projection-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const month = today.slice(0, 7);
		const dueDay = today.slice(-2);
		const tomorrow = shiftDate(today, 1);
		const due = `${shiftMonth(month, 1)}-10`;
		const purchaseDay = `${month}-05`;
		expect(await open(file, 'checking', 'Cash', '100000')).toBe(0);
		const cashId = lines.at(-1) ?? '';
		expect(await open(file, 'savings', 'Nest', '25000', ['--category', 'goal'])).toBe(0);
		expect(
			await run([
				'--file',
				file,
				'recurring',
				'add',
				'--type',
				'expense',
				'--name',
				'Rent',
				'--amount',
				'1000',
				'--day',
				String(Number(dueDay)),
				'--start',
				'2020-01-01',
				'--account',
				cashId,
				'--category',
				'moradia'
			])
		).toBe(0);
		expect(await card(file, 'Old', '1', '2')).toBe(0);
		const oldId = lines.at(-1) ?? '';
		expect(await card(file, 'Visa', '20', '10')).toBe(0);
		const visaId = lines.at(-1) ?? '';
		expect(await purchase(file, oldId, '7000', `${shiftMonth(month, -1)}-01`, 'Oldbill')).toBe(0);
		expect(await purchase(file, visaId, '5000', purchaseDay, 'Market')).toBe(0);
		expect(await daily(file, 'Lunch', '300', today, cashId)).toBe(0);
		expect(await daily(file, 'Coffee', '400', today, cashId)).toBe(0);
		const coffeeId = lines.at(-1) ?? '';
		expect(
			await run(['--file', file, 'forecast', 'pay', '--id', coffeeId, '--date', today])
		).toBe(0);
		const beforeBalance = lines.length;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(beforeBalance)).toEqual(['available 99600', 'savings 25000', 'total 124600']);
		const beforeShow = lines.length;
		expect(await run(['--file', file, 'projection', 'show', '--days', '45'])).toBe(0);
		const shown = lines.slice(beforeShow);
		const todayBalance = 99600 - 1000 - 7000 - 300;
		expect(shown[0]).toBe(`${today} ${todayBalance} Rent,Lunch,Invoice Old`);
		expect(shown[0]).not.toContain('Coffee');
		expect(shown[0]).not.toContain('Market');
		expect(shown[1]).toBe(`${tomorrow} ${todayBalance - 700} Coffee,Lunch`);
		const dueLine = shown.find((line) => line.startsWith(`${due} `));
		const dueIndex = shown.findIndex((line) => line.startsWith(`${due} `));
		expect(dueLine).toContain('Invoice Visa');
		expect(dueLine).not.toContain('Market');
		const previous = Number(shown[dueIndex - 1]?.split(' ')[1]);
		const dueBalance = Number(dueLine?.split(' ')[1]);
		const rentOnDue = due.endsWith(`-${dueDay}`) ? 1000 : 0;
		expect(previous - dueBalance).toBe(5000 + 700 + rentOnDue);
		const bought = shown.find((line) => line.startsWith(`${purchaseDay} `));
		if (bought) {
			expect(bought).not.toContain('Market');
			expect(bought).not.toContain('Invoice Visa');
		}
		expect(shown.at(-1)).toBe(`daily-limit ${dailyLimit(shown, 10000)}`);
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

async function open(
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

function card(file: string, name: string, closes: string, due: string): Promise<number> {
	return run([
		'--file',
		file,
		'card',
		'open',
		'--name',
		name,
		'--limit',
		'500000',
		'--closes',
		closes,
		'--due',
		due,
		'--color',
		'blue'
	]);
}

function purchase(
	file: string,
	cardId: string,
	amount: string,
	date: string,
	description: string
): Promise<number> {
	return run([
		'--file',
		file,
		'card',
		'purchase',
		'--card',
		cardId,
		'--amount',
		amount,
		'--date',
		date,
		'--description',
		description,
		'--category',
		'outros'
	]);
}

function daily(
	file: string,
	name: string,
	amount: string,
	date: string,
	accountId: string
): Promise<number> {
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
		name,
		'--amount',
		amount,
		'--date',
		date,
		'--category',
		'alimentacao',
		'--account',
		accountId,
		'--weekdays',
		'0,1,2,3,4,5,6'
	]);
}

function dailyLimit(lines: string[], margin: number): number {
	const days = lines.filter((line) => /^\d{4}-\d{2}-\d{2} /.test(line));
	const month = days[0]?.slice(0, 7) ?? '';
	const inMonth = days.filter((line) => line.startsWith(month));
	let minimum = Infinity;
	for (let index = 0; index < inMonth.length; index++) {
		const balance = Number(inMonth[index]?.split(' ')[1]);
		const rate = (balance - margin) / (index + 1);
		if (rate < minimum) minimum = rate;
	}
	return Math.round(minimum);
}

function shiftMonth(month: string, delta: number): string {
	const [year, monthNumber] = month.split('-').map(Number);
	const index = year * 12 + (monthNumber - 1) + delta;
	const nextYear = Math.floor(index / 12);
	const nextMonth = index - nextYear * 12;
	return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}

function shiftDate(iso: string, days: number): string {
	const [year, month, day] = iso.split('-').map(Number);
	const shifted = new Date(Date.UTC(year, month - 1, day + days));
	const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
	const nextDay = String(shifted.getUTCDate()).padStart(2, '0');
	return `${shifted.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}
