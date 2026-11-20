import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('opening, posting a future expense, listing and removing keeps today balance', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-cli-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const tomorrow = nextDay(today);

		expect(
			await run([
				'--file',
				file,
				'account',
				'open',
				'--type',
				'checking',
				'--name',
				'Nubank',
				'--balance',
				'5000'
			])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
		expect(accountId).not.toBe('');

		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);

		expect(
			await run([
				'--file',
				file,
				'post',
				'--type',
				'expense',
				'--amount',
				'1000',
				'--date',
				tomorrow,
				'--description',
				'Market',
				'--account',
				accountId,
				'--category',
				'mercado'
			])
		).toBe(0);
		const transactionId = lines.at(-1) ?? '';
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);

		const beforeList = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		const listed = lines.slice(beforeList);
		expect(listed).toHaveLength(2);
		expect(listed[0]).toContain('income');
		expect(listed[0]).toContain('Saldo inicial de Nubank');
		expect(listed[0]).toContain(today);
		expect(listed[1]).toBe(`${transactionId} ${tomorrow} expense 1000 Market`);

		expect(await run(['--file', file, 'remove', transactionId])).toBe(0);
		const beforeSecondList = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(lines.slice(beforeSecondList)).toEqual([listed[0]]);
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);
	} finally {
		console.log = original;
		await rm(dir, { recursive: true, force: true });
	}
});

function nextDay(iso: string): string {
	const [year, month, day] = iso.split('-').map(Number);
	const date = new Date(year, month - 1, day + 1);
	const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
	const nextDayOfMonth = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${nextMonth}-${nextDayOfMonth}`;
}
