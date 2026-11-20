import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('abrir, lançar no futuro, listar e remover mantém o saldo de hoje', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-cli-'));
	const file = join(dir, 'livro.sqlite');
	const linhas: string[] = [];
	const original = console.log;
	console.log = (...args: unknown[]) => {
		linhas.push(args.map(String).join(' '));
	};
	try {
		const hoje = new SystemClock().hoje();
		const amanha = diaSeguinte(hoje);

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
		const contaId = linhas.at(-1) ?? '';
		expect(contaId).not.toBe('');

		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(linhas.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);

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
				amanha,
				'--description',
				'Market',
				'--account',
				contaId,
				'--category',
				'mercado'
			])
		).toBe(0);
		const lancamentoId = linhas.at(-1) ?? '';
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(linhas.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);

		const antesDaLista = linhas.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		const lista = linhas.slice(antesDaLista);
		expect(lista).toHaveLength(2);
		expect(lista[0]).toContain('income');
		expect(lista[0]).toContain('Saldo inicial de Nubank');
		expect(lista[0]).toContain(hoje);
		expect(lista[1]).toBe(`${lancamentoId} ${amanha} expense 1000 Market`);

		expect(await run(['--file', file, 'remove', lancamentoId])).toBe(0);
		const antesDaSegunda = linhas.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(linhas.slice(antesDaSegunda)).toEqual([lista[0]]);
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(linhas.slice(-3)).toEqual(['available 5000', 'savings 0', 'total 5000']);
	} finally {
		console.log = original;
		await rm(dir, { recursive: true, force: true });
	}
});

function diaSeguinte(iso: string): string {
	const [ano, mes, dia] = iso.split('-').map(Number);
	const data = new Date(ano, mes - 1, dia + 1);
	const mesNovo = String(data.getMonth() + 1).padStart(2, '0');
	const diaNovo = String(data.getDate()).padStart(2, '0');
	return `${data.getFullYear()}-${mesNovo}-${diaNovo}`;
}
