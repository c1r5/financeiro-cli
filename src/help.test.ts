import { expect, test } from 'bun:test';
import { calcularSaldos } from 'financeiro-sdk';
import { HELP } from './help';

test('a ajuda lista os comandos sem abrir banco', async () => {
	expect(typeof calcularSaldos).toBe('function');
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

	const ajuda = Bun.spawn(['bun', 'src/main.ts', '--help'], {
		cwd: root,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	expect(await new Response(ajuda.stdout).text()).toBe(`${HELP}\n`);
	expect(await ajuda.exited).toBe(0);
});
