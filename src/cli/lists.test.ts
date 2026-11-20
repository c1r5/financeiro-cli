import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('lists return stored records and a category outside the catalog is rejected', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-lists-'));
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
		expect(await run(['--file', file, 'category', 'list', '--json'])).toBe(0);
		const catalog = JSON.parse(lines[0]) as {
			ok: boolean;
			data: { categories: Array<{ value: string; label: string; flow: string[]; group: string | null }> };
		};
		expect(catalog.ok).toBe(true);
		expect(catalog.data.categories.find((category) => category.value === 'salario')).toEqual({
			value: 'salario',
			label: 'Salário',
			flow: ['income'],
			group: null
		});

		lines.length = 0;
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
				'8000'
			])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
		lines.length = 0;
		expect(await run(['--file', file, 'account', 'list'])).toBe(0);
		expect(lines).toContain(`id ${accountId}`);
		expect(lines).toContain('name Cash');
		expect(lines).toContain('type checking');

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
				'2026-12-02',
				'--description',
				'Snack',
				'--account',
				accountId,
				'--category',
				'food'
			])
		).toBe(1);
		expect(JSON.parse(lines[0])).toEqual({
			ok: false,
			error: { code: 'invalid_value', message: 'invalid category: food' }
		});

		lines.length = 0;
		expect(
			await run([
				'--file',
				file,
				'post',
				'--type',
				'expense',
				'--amount',
				'100',
				'--date',
				'2026-12-02',
				'--description',
				'Snack',
				'--account',
				accountId,
				'--category',
				'alimentacao'
			])
		).toBe(0);
		expect(lines.at(-1)).not.toBe('');

		lines.length = 0;
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
		lines.length = 0;
		expect(await run(['--file', file, 'card', 'list', '--json'])).toBe(0);
		const cards = JSON.parse(lines[0]) as { data: { cards: Array<{ id: string; name: string }> } };
		expect(cards.data.cards).toEqual([
			expect.objectContaining({ id: cardId, name: 'Visa', limit: 100000, closingDay: 20, dueDay: 10 })
		]);

		lines.length = 0;
		expect(
			await run([
				'--file',
				file,
				'forecast',
				'add',
				'--type',
				'expense',
				'--frequency',
				'once',
				'--name',
				'License',
				'--amount',
				'500',
				'--date',
				'2026-12-03',
				'--category',
				'assinaturas',
				'--account',
				accountId
			])
		).toBe(0);
		lines.length = 0;
		expect(await run(['--file', file, 'forecast', 'list'])).toBe(0);
		expect(lines).toContain('name License');
		expect(lines).toContain('frequency once');

		lines.length = 0;
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
				'4000',
				'--day',
				'15',
				'--start',
				'2026-12-01',
				'--account',
				accountId,
				'--category',
				'moradia'
			])
		).toBe(0);
		const recurringId = lines.at(-1) ?? '';
		lines.length = 0;
		expect(await run(['--file', file, 'recurring', 'list'])).toBe(0);
		expect(lines).toContain(`id ${recurringId}`);
		expect(lines).toContain('name Rent');
		expect(lines).toContain('category moradia');

		lines.length = 0;
		expect(await run(['--file', file, 'recurring', 'list', '--month', '2026-12'])).toBe(0);
		expect(lines).toEqual([`${recurringId} 2026-12-15 Rent 4000`]);
		expect(errors).toEqual([]);
	} finally {
		console.log = log;
		console.error = error;
		await rm(dir, { recursive: true, force: true });
	}
});
