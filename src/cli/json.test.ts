import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('json balance, a missing amount and post help stay on one command', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-json-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const errors: string[] = [];
	const log = console.log;
	const error = console.error;
	const previousDir = process.cwd();
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	console.error = (...args: unknown[]) => {
		errors.push(args.map(String).join(' '));
	};
	try {
		process.chdir(dir);
		expect(await run(['post', '--help'])).toBe(0);
		const help = lines.join('\n');
		expect(help).toContain('post --type income|expense|transfer');
		expect(help).not.toContain('account open');
		expect(await Bun.file(join(dir, 'financeiro.sqlite')).exists()).toBe(false);

		lines.length = 0;
		expect(await run(['post', '--help', '--json'])).toBe(0);
		const helped = JSON.parse(lines[0]) as { ok: boolean; data: { usage: string } };
		expect(helped.ok).toBe(true);
		expect(helped.data.usage).toContain('post --type');
		expect(errors).toEqual([]);

		lines.length = 0;
		expect(await run(['--file', file, 'balance', '--json'])).toBe(0);
		expect(JSON.parse(lines[0])).toEqual({
			ok: true,
			data: { available: 0, savings: 0, total: 0 }
		});
		expect(errors).toEqual([]);

		lines.length = 0;
		expect(
			await run([
				'--file',
				file,
				'post',
				'--json',
				'--date',
				'2026-11-20',
				'--description',
				'Market',
				'--type',
				'expense',
				'--account',
				'missing'
			])
		).toBe(1);
		expect(JSON.parse(lines[0])).toEqual({
			ok: false,
			error: { code: 'missing_flag', message: 'missing --amount' }
		});
		expect(errors).toEqual([]);

		lines.length = 0;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 0', 'savings 0', 'total 0']);
	} finally {
		console.log = log;
		console.error = error;
		process.chdir(previousDir);
		await rm(dir, { recursive: true, force: true });
	}
});
