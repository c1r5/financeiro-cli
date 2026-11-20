import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('recurring pay posts the month and revert restores the balance', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-recurring-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const current = today.slice(0, 7);
		const previous = shiftMonth(current, -1);
		const started = shiftMonth(current, -2);
		expect(
			await run([
				'--file',
				file,
				'account',
				'open',
				'--type',
				'checking',
				'--name',
				'Cash',
				'--balance',
				'20000'
			])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
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
				'10000',
				'--day',
				'15',
				'--start',
				`${started}-22`,
				'--account',
				accountId,
				'--category',
				'moradia'
			])
		).toBe(0);
		const rentId = lines.at(-1) ?? '';
		const beforeStart = lines.length;
		expect(await run(['--file', file, 'recurring', 'list', '--month', started])).toBe(0);
		expect(lines.slice(beforeStart)).toEqual([]);
		const beforePrevious = lines.length;
		expect(await run(['--file', file, 'recurring', 'list', '--month', previous])).toBe(0);
		expect(lines.slice(beforePrevious)).toEqual([`${rentId} ${previous}-15 Rent 10000`]);
		expect(
			await run(['--file', file, 'recurring', 'pay', '--id', rentId, '--month', previous])
		).toBe(0);
		const paymentId = lines.at(-1) ?? '';
		const beforePaid = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(lines.slice(beforePaid).some((line) => line.includes(`${paymentId}`))).toBe(true);
		expect(lines.slice(beforePaid).some((line) => line.includes('expense 10000 Rent'))).toBe(true);
		const beforeBalance = lines.length;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(beforeBalance)).toEqual(['available 10000', 'savings 0', 'total 10000']);
		const beforePending = lines.length;
		expect(await run(['--file', file, 'recurring', 'list', '--month', previous])).toBe(0);
		expect(lines.slice(beforePending)).toEqual([]);
		expect(
			await run(['--file', file, 'recurring', 'revert', '--id', rentId, '--month', previous])
		).toBe(0);
		const beforeRestored = lines.length;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(beforeRestored)).toEqual(['available 20000', 'savings 0', 'total 20000']);
		const beforeListed = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(lines.slice(beforeListed).some((line) => line.includes(paymentId))).toBe(false);
		expect(
			await run([
				'--file',
				file,
				'recurring',
				'add',
				'--type',
				'expense',
				'--name',
				'Leap',
				'--amount',
				'3100',
				'--day',
				'31',
				'--start',
				'2026-01-01',
				'--account',
				accountId,
				'--category',
				'moradia'
			])
		).toBe(0);
		const leapId = lines.at(-1) ?? '';
		const beforeFebruary = lines.length;
		expect(await run(['--file', file, 'recurring', 'list', '--month', '2026-02'])).toBe(0);
		expect(lines.slice(beforeFebruary).some((line) => line.includes(leapId))).toBe(false);
		expect(
			await run([
				'--file',
				file,
				'card',
				'open',
				'--name',
				'Visa',
				'--limit',
				'500000',
				'--closes',
				'20',
				'--due',
				'10',
				'--color',
				'blue'
			])
		).toBe(0);
		const cardId = lines.at(-1) ?? '';
		expect(
			await run([
				'--file',
				file,
				'recurring',
				'add',
				'--type',
				'expense',
				'--name',
				'Stream',
				'--amount',
				'1500',
				'--day',
				'3',
				'--start',
				'2020-01-01',
				'--account',
				accountId,
				'--card',
				cardId,
				'--category',
				'assinaturas'
			])
		).toBe(0);
		const streamId = lines.at(-1) ?? '';
		expect(
			await run(['--file', file, 'recurring', 'pay', '--id', streamId, '--month', previous])
		).toBe(0);
		const beforeCard = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(
			lines.slice(beforeCard).some((line) => line.includes('card-expense 1500 Stream'))
		).toBe(true);
		const beforeCash = lines.length;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(beforeCash)[0]).toBe('available 20000');
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

function shiftMonth(month: string, delta: number): string {
	const [year, monthNumber] = month.split('-').map(Number);
	const index = year * 12 + (monthNumber - 1) + delta;
	const nextYear = Math.floor(index / 12);
	const nextMonth = index - nextYear * 12;
	return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}
