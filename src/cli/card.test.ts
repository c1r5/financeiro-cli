import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('a card invoice sums base, purchase and installment, then the payment', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-card-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const month = today.slice(0, 7);
		const purchaseDate = `${month}-05`;
		const [year, monthNumber] = month.split('-').map(Number);
		const dueMonth = monthNumber === 12 ? 1 : monthNumber + 1;
		const dueYear = monthNumber === 12 ? year + 1 : year;
		const due = `${dueYear}-${String(dueMonth).padStart(2, '0')}-10`;

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
				'0'
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
				'Nubank',
				'--limit',
				'500000',
				'--closes',
				'20',
				'--due',
				'10',
				'--color',
				'#3B82F6'
			])
		).toBe(0);
		const cardId = lines.at(-1) ?? '';
		expect(await run(['--file', file, 'card', 'base', '--card', cardId, '--reference', month, '--amount', '100000'])).toBe(0);
		expect(
			await run([
				'--file',
				file,
				'card',
				'purchase',
				'--card',
				cardId,
				'--amount',
				'50000',
				'--date',
				purchaseDate,
				'--description',
				'Market',
				'--category',
				'mercado'
			])
		).toBe(0);
		const beforeParcels = lines.length;
		expect(
			await run([
				'--file',
				file,
				'card',
				'installment',
				'--card',
				cardId,
				'--amount',
				'100',
				'--date',
				purchaseDate,
				'--description',
				'Notebook',
				'--category',
				'lazer',
				'--count',
				'3'
			])
		).toBe(0);
		const parcels = lines.slice(beforeParcels).map((line) => Number(line.split(' ')[1]));
		expect(parcels).toEqual([33, 33, 34]);
		expect(
			await run([
				'--file',
				file,
				'card',
				'pay',
				'--card',
				cardId,
				'--account',
				accountId,
				'--amount',
				'20000',
				'--reference',
				month,
				'--date',
				today
			])
		).toBe(0);
		expect(lines.at(-1)).toContain('invoice-payment');
		const beforeInvoice = lines.length;
		expect(await run(['--file', file, 'card', 'invoice', '--card', cardId, '--reference', month])).toBe(0);
		expect(lines.slice(beforeInvoice)).toEqual([
			`reference ${month}`,
			'balance 130033',
			`closed ${today >= `${month}-20`}`,
			`due ${due}`,
			'expected 100000'
		]);
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});
