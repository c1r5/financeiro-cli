import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('settings starts at 70/20/10 and rejects a split that is not 100', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-settings-'));
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
		expect(await run(['--file', file, 'settings', 'show'])).toBe(0);
		expect(lines.slice(-5)).toEqual([
			'currency BRL',
			'general 70',
			'debts 20',
			'reserve 10',
			'margin 10000'
		]);
		expect(
			await run(['--file', file, 'settings', 'set', '--debts', '30', '--general', '60'])
		).toBe(0);
		expect(lines.slice(-5)).toEqual([
			'currency BRL',
			'general 60',
			'debts 30',
			'reserve 10',
			'margin 10000'
		]);
		expect(await run(['--file', file, 'settings', 'set', '--reserve', '20'])).toBe(1);
		expect(errors.at(-1)).toBe('divisao_invalida');
		expect(await run(['--file', file, 'settings', 'show'])).toBe(0);
		expect(lines.slice(-5)).toEqual([
			'currency BRL',
			'general 60',
			'debts 30',
			'reserve 10',
			'margin 10000'
		]);
	} finally {
		console.log = log;
		console.error = error;
		await rm(dir, { recursive: true, force: true });
	}
});
