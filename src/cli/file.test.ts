import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('the database file follows --file, then FINANCEIRO_FILE, and waits on a lock', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-file-'));
	const fromEnv = join(dir, 'a.sqlite');
	const fromFlag = join(dir, 'b.sqlite');
	const previousEnv = process.env.FINANCEIRO_FILE;
	const previousDir = process.cwd();
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		process.env.FINANCEIRO_FILE = fromEnv;
		expect(await run(['balance'])).toBe(0);
		expect(await Bun.file(fromEnv).exists()).toBe(true);
		expect(lines.slice(-3)).toEqual(['available 0', 'savings 0', 'total 0']);

		process.chdir(dir);
		delete process.env.FINANCEIRO_FILE;
		expect(await run(['balance'])).toBe(0);
		expect(await Bun.file(join(dir, 'financeiro.sqlite')).exists()).toBe(true);

		process.env.FINANCEIRO_FILE = fromEnv;
		expect(
			await run([
				'--file',
				fromFlag,
				'account',
				'open',
				'--type',
				'checking',
				'--name',
				'Cash',
				'--balance',
				'2500'
			])
		).toBe(0);
		expect(await run(['balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 0', 'savings 0', 'total 0']);
		expect(await run(['--file', fromFlag, 'balance'])).toBe(0);
		expect(lines.slice(-3)).toEqual(['available 2500', 'savings 0', 'total 2500']);

		const locked = new Database(fromEnv);
		locked.exec('BEGIN EXCLUSIVE');
		const root = import.meta.dir + '/../..';
		const child = Bun.spawn(['bun', 'src/main.ts', 'balance'], {
			cwd: root,
			env: { ...process.env, FINANCEIRO_FILE: fromEnv },
			stdout: 'pipe',
			stderr: 'pipe'
		});
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(child.exitCode).toBeNull();
		locked.exec('COMMIT');
		locked.close();
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toBe('available 0\nsavings 0\ntotal 0\n');
		expect(await new Response(child.stderr).text()).toBe('');
	} finally {
		console.log = log;
		process.chdir(previousDir);
		if (previousEnv === undefined) delete process.env.FINANCEIRO_FILE;
		else process.env.FINANCEIRO_FILE = previousEnv;
		await rm(dir, { recursive: true, force: true });
	}
});
