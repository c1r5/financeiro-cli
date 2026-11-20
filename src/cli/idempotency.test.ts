import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('the same idempotency key replays a post and conflicts on another command', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-idem-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const errors: string[] = [];
	const log = console.log;
	const error = console.error;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	console.error = (...args: unknown[]) => {
		errors.push(args.map(String).join(' '));
	};
	try {
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
				'9000'
			])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
		expect(
			await run([
				'--file',
				file,
				'card',
				'open',
				'--name',
				'Visa',
				'--limit',
				'100000',
				'--closes',
				'20',
				'--due',
				'10',
				'--color',
				'blue'
			])
		).toBe(0);
		const cardId = lines.at(-1) ?? '';

		const post = [
			'--file',
			file,
			'post',
			'--json',
			'--idempotency-key',
			'k1',
			'--type',
			'expense',
			'--amount',
			'300',
			'--date',
			'2026-12-04',
			'--description',
			'Bus',
			'--account',
			accountId,
			'--category',
			'transporte'
		];
		lines.length = 0;
		expect(await run(post)).toBe(0);
		const first = JSON.parse(lines[0]) as { ok: boolean; data: { id: string } };
		expect(first.ok).toBe(true);
		lines.length = 0;
		expect(await run(post)).toBe(0);
		const second = JSON.parse(lines[0]) as { ok: boolean; data: { id: string } };
		expect(second).toEqual(first);

		lines.length = 0;
		expect(await run(['--file', file, 'list', '--json'])).toBe(0);
		const listed = JSON.parse(lines[0]) as { data: { transactions: Array<{ id: string; type: string }> } };
		const expenses = listed.data.transactions.filter((row) => row.type === 'expense');
		expect(expenses.map((row) => row.id)).toEqual([first.data.id]);

		lines.length = 0;
		expect(
			await run([
				'--file',
				file,
				'card',
				'purchase',
				'--json',
				'--idempotency-key',
				'k1',
				'--card',
				cardId,
				'--amount',
				'300',
				'--date',
				'2026-12-04',
				'--description',
				'Bus',
				'--category',
				'transporte'
			])
		).toBe(1);
		expect(JSON.parse(lines[0])).toEqual({
			ok: false,
			error: { code: 'idempotency_conflict', message: 'idempotency_conflict' }
		});

		lines.length = 0;
		expect(
			await run([
				'--file',
				file,
				'post',
				'--json',
				'--type',
				'expense',
				'--amount',
				'100',
				'--date',
				'2026-12-05',
				'--description',
				'Coffee',
				'--account',
				accountId,
				'--category',
				'alimentacao'
			])
		).toBe(0);
		const third = JSON.parse(lines[0]) as { data: { id: string } };
		expect(third.data.id).not.toBe(first.data.id);
		lines.length = 0;
		expect(await run(['--file', file, 'list', '--json', '--type', 'expense'])).toBe(0);
		const after = JSON.parse(lines[0]) as { data: { transactions: Array<{ id: string }> } };
		expect(after.data.transactions.map((row) => row.id)).toEqual([first.data.id, third.data.id]);
		expect(errors).toEqual([]);
	} finally {
		console.log = log;
		console.error = error;
		await rm(dir, { recursive: true, force: true });
	}
});
