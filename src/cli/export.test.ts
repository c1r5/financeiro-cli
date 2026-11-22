import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemClock } from '../system-clock';
import { run } from './run';

test('export writes frontend json and import inspect reads the same ids', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-export-'));
	const ledger = join(dir, 'ledger.sqlite');
	const target = join(dir, 'financeiro.json');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const today = new SystemClock().today();
		const month = today.slice(0, 7);
		expect(
			await run(['--file', ledger, 'account', 'open', '--type', 'checking', '--name', 'Cash', '--balance', '0'])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
		expect(
			await run([
				'--file',
				ledger,
				'post',
				'--type',
				'expense',
				'--amount',
				'500',
				'--date',
				today,
				'--description',
				'Mercado',
				'--account',
				accountId,
				'--category',
				'mercado'
			])
		).toBe(0);
		expect(
			await run([
				'--file',
				ledger,
				'recurring',
				'add',
				'--type',
				'expense',
				'--name',
				'Otica',
				'--amount',
				'900',
				'--day',
				'5',
				'--start',
				`${month}-01`,
				'--account',
				accountId,
				'--category',
				'divida'
			])
		).toBe(0);
		const recurringId = lines.at(-1) ?? '';
		expect(await run(['--file', ledger, 'recurring', 'pay', '--id', recurringId, '--month', month])).toBe(0);
		expect(
			await run([
				'--file',
				ledger,
				'forecast',
				'add',
				'--type',
				'expense',
				'--frequency',
				'monthly',
				'--name',
				'Havan',
				'--amount',
				'11999',
				'--date',
				'2027-01-10',
				'--category',
				'divida',
				'--account',
				accountId
			])
		).toBe(0);
		const forecastId = lines.at(-1) ?? '';

		lines.length = 0;
		expect(await run(['--file', ledger, 'export', '--to', target, '--json'])).toBe(0);
		const envelope = JSON.parse(lines[0]) as {
			ok: boolean;
			data: {
				path: string;
				version: number;
				counts: { accounts: number; cards: number; transactions: number; recurrings: number; forecasts: number };
			};
		};
		expect(envelope.ok).toBe(true);
		expect(envelope.data).toEqual({
			path: target,
			version: 18,
			counts: { accounts: 1, cards: 0, transactions: 2, recurrings: 1, forecasts: 1 }
		});
		const raw = await readFile(target, 'utf8');
		expect(raw).not.toBe(lines[0]);
		const file = JSON.parse(raw) as {
			versao: number;
			configuracao: { moeda: string; divisao: { geral: number; dividas: number; reserva: number }; margemSeguranca: number };
			contas: Array<{ id: string; tipo: string; nome: string }>;
			transacoes: Array<{ tipo: string; descricao: string; valor: number }>;
			recorrentes: Array<{ id: string; statusPorMes: Record<string, string> }>;
			historicoSimulacoes: Array<Record<string, unknown>>;
		};
		expect(file.versao).toBe(18);
		expect(file.configuracao).toEqual({
			moeda: 'BRL',
			divisao: { geral: 70, dividas: 20, reserva: 10 },
			margemSeguranca: 10000
		});
		expect(file.contas).toEqual([expect.objectContaining({ id: accountId, tipo: 'corrente', nome: 'Cash' })]);
		expect(file.transacoes.some((row) => row.tipo === 'saida' && row.descricao === 'Mercado' && row.valor === 500)).toBe(
			true
		);
		expect(file.recorrentes).toEqual([
			expect.objectContaining({ id: recurringId, statusPorMes: { [month]: 'paga' } })
		]);
		expect(file.historicoSimulacoes).toEqual([
			expect.objectContaining({ id: forecastId, frequencia: 'mensal', nome: 'Havan' })
		]);
		expect(file.historicoSimulacoes[0].contaId).toBeUndefined();

		lines.length = 0;
		expect(
			await run(['--file', ledger, 'import', 'inspect', '--from', target, '--entity', 'recurring', '--json'])
		).toBe(0);
		const recurrings = JSON.parse(lines[0]) as { data: { rows: Array<{ id: string }> } };
		expect(recurrings.data.rows.map((row) => row.id)).toEqual([recurringId]);
		lines.length = 0;
		expect(
			await run(['--file', ledger, 'import', 'inspect', '--from', target, '--entity', 'forecast', '--json'])
		).toBe(0);
		const forecasts = JSON.parse(lines[0]) as { data: { rows: Array<{ id: string }> } };
		expect(forecasts.data.rows.map((row) => row.id)).toEqual([forecastId]);
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});
