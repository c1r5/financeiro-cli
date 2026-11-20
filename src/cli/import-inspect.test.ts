import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

test('import inspect lists the file and a slice without creating the ledger', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-import-'));
	const source = join(dir, 'financeiro.json');
	const ledger = join(dir, 'ledger.sqlite');
	await writeFile(source, JSON.stringify(fixture()));
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		expect(await run(['--file', ledger, 'import', 'inspect', '--from', source, '--json'])).toBe(0);
		const summary = JSON.parse(lines[0]) as {
			ok: boolean;
			data: {
				version: number;
				counts: { accounts: number; cards: number; transactions: number; recurrings: number; forecasts: number };
				settings: { currency: string; general: number; debts: number; reserve: number; margin: number };
				invoices: Array<{ cardId: string; reference: string; count: number; expenses: number; payments: number }>;
				ignored: string[];
			};
		};
		expect(summary.ok).toBe(true);
		expect(summary.data.version).toBe(18);
		expect(summary.data.counts).toEqual({
			accounts: 2,
			cards: 1,
			transactions: 4,
			recurrings: 2,
			forecasts: 1
		});
		expect(summary.data.settings).toEqual({
			currency: 'BRL',
			general: 70,
			debts: 20,
			reserve: 10,
			margin: 10000
		});
		expect(summary.data.invoices).toEqual([
			{ cardId: 'card-1', reference: '2026-10', count: 1, expenses: 100, payments: 0 },
			{ cardId: 'card-1', reference: '2026-11', count: 2, expenses: 300, payments: 300 }
		]);
		expect(summary.data.ignored).toContain('extra');
		expect(await Bun.file(ledger).exists()).toBe(false);

		lines.length = 0;
		expect(
			await run([
				'--file',
				ledger,
				'import',
				'inspect',
				'--from',
				source,
				'--entity',
				'recurring',
				'--type',
				'expense',
				'--category',
				'divida',
				'--json'
			])
		).toBe(0);
		const debts = JSON.parse(lines[0]) as { ok: boolean; data: { rows: Array<{ id: string; category: string; type: string }> } };
		expect(debts.ok).toBe(true);
		expect(debts.data.rows.map((row) => row.id)).toEqual(['rec-debt']);
		expect(debts.data.rows[0]).toMatchObject({ category: 'divida', type: 'expense' });

		lines.length = 0;
		expect(
			await run([
				'--file',
				ledger,
				'import',
				'inspect',
				'--from',
				source,
				'--entity',
				'invoice',
				'--reference',
				'2026-11',
				'--json'
			])
		).toBe(0);
		const invoice = JSON.parse(lines[0]) as { ok: boolean; data: { rows: Array<{ id: string }> } };
		expect(invoice.ok).toBe(true);
		expect(invoice.data.rows.map((row) => row.id)).toEqual(['tx-card', 'tx-pay']);
		expect(await Bun.file(ledger).exists()).toBe(false);
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

function fixture(): Record<string, unknown> {
	return {
		versao: 18,
		extra: true,
		configuracao: {
			moeda: 'BRL',
			divisao: { geral: 70, dividas: 20, reserva: 10 },
			margemSeguranca: 10000
		},
		contas: [
			{
				id: 'acc-1',
				tipo: 'corrente',
				nome: 'Cash',
				descricao: '',
				saldoInicial: 0,
				ativa: true,
				criadoEm: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'acc-2',
				tipo: 'poupanca',
				nome: 'Pot',
				descricao: '',
				saldoInicial: 0,
				ativa: true,
				criadoEm: '2026-01-02T00:00:00.000Z',
				contaVinculadaId: 'acc-1',
				categoria: 'reserva'
			}
		],
		cartoes: [
			{
				id: 'card-1',
				nome: 'Itau',
				limite: 1000,
				diaFechamento: 3,
				diaVencimento: 10,
				cor: '#fff',
				ativo: true,
				criadoEm: '2026-01-01T00:00:00.000Z'
			}
		],
		transacoes: [
			{
				id: 'tx-exp',
				data: '2026-11-02',
				descricao: 'Mercado',
				tipo: 'saida',
				valor: 500,
				categoria: 'mercado',
				contaId: 'acc-1',
				criadoEm: '2026-11-02T00:00:00.000Z'
			},
			{
				id: 'tx-card',
				data: '2026-11-04',
				descricao: 'Farmacia',
				tipo: 'gasto-cartao',
				valor: 300,
				categoria: 'farmacia',
				contaId: 'card-1',
				cartaoId: 'card-1',
				faturaReferencia: '2026-11',
				criadoEm: '2026-11-04T00:00:00.000Z'
			},
			{
				id: 'tx-pay',
				data: '2026-11-10',
				descricao: 'Pgto',
				tipo: 'pagamento-fatura',
				valor: 300,
				categoria: 'cartao-credito',
				contaId: 'acc-1',
				cartaoId: 'card-1',
				faturaReferencia: '2026-11',
				criadoEm: '2026-11-10T00:00:00.000Z'
			},
			{
				id: 'tx-old',
				data: '2026-10-04',
				descricao: 'Old',
				tipo: 'gasto-cartao',
				valor: 100,
				categoria: 'farmacia',
				contaId: 'card-1',
				cartaoId: 'card-1',
				faturaReferencia: '2026-10',
				criadoEm: '2026-10-04T00:00:00.000Z'
			}
		],
		recorrentes: [
			{
				id: 'rec-debt',
				nome: 'Otica',
				categoria: 'divida',
				tipo: 'saida',
				valorEsperado: 900,
				diaVencimento: 5,
				dataInicio: '2026-09-05',
				contaId: 'acc-1',
				ativa: true,
				statusPorMes: { '2026-11': 'paga' },
				pagamentosPorMes: { '2026-11': 'tx-exp' },
				criadoEm: '2026-09-05T00:00:00.000Z'
			},
			{
				id: 'rec-pay',
				nome: 'Salario',
				categoria: 'salario',
				tipo: 'entrada',
				valorEsperado: 100,
				diaVencimento: 5,
				dataInicio: '2026-09-05',
				contaId: 'acc-1',
				ativa: true,
				statusPorMes: {},
				pagamentosPorMes: {},
				criadoEm: '2026-09-05T00:00:00.000Z'
			}
		],
		historicoSimulacoes: [
			{
				id: 'fc-1',
				nome: 'Havan',
				valor: 11999,
				tipo: 'saida',
				data: '2027-01-10',
				categoria: 'divida',
				frequencia: 'mensal',
				dataFim: '2027-02-10'
			}
		]
	};
}
