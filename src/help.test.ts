import { expect, test } from 'bun:test';
import { calcularSaldos as calculateBalances } from 'financeiro-sdk';
import { HELP } from './help';

test('help lists the commands without opening a database', async () => {
	expect(typeof calculateBalances).toBe('function');
	const root = import.meta.dir + '/..';
	const proc = Bun.spawn(['bun', 'src/main.ts'], {
		cwd: root,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const stdout = await new Response(proc.stdout).text();
	expect(await proc.exited).toBe(0);
	expect(stdout).toBe(`${HELP}\n`);
	expect(await Bun.file(`${root}/financeiro.sqlite`).exists()).toBe(false);

	const help = Bun.spawn(['bun', 'src/main.ts', '--help'], {
		cwd: root,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	expect(await new Response(help.stdout).text()).toBe(`${HELP}\n`);
	expect(await help.exited).toBe(0);
});
