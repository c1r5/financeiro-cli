import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import { run } from './run';

test('import plan lists debts, accounts, payments and a conflicting row without writing', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-plan-'));
	const source = join(dir, 'financeiro.json');
	const ledger = join(dir, 'ledger.sqlite');
	await writeFile(source, JSON.stringify(fixture()));
	const repository = new SqliteLedgerRepository(ledger);
	await repository.saveAccount({
		id: 'acc-1',
		type: 'checking',
		name: 'Other',
		description: '',
		openingBalance: 0,
		active: true,
		createdAt: '2026-01-01T00:00:00.000Z'
	});
	repository.close();
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		expect(
			await run([
				'--file',
				ledger,
				'import',
				'plan',
				'--from',
				source,
				'--entity',
				'recurring',
				'--type',
				'expense',
				'--category',
				'divida',
				'--with-deps',
				'--json'
			])
		).toBe(0);
		const planned = JSON.parse(lines[0]) as {
			ok: boolean;
			data: {
				insert: Array<{ entity: string; id: string }>;
				unchanged: Array<{ entity: string; id: string }>;
				conflict: Array<{ entity: string; id: string; fields: string[] }>;
				blocked: Array<{ entity: string; id: string; missing: string }>;
				deps: Array<{ entity: string; id: string }>;
			};
		};
		expect(planned.ok).toBe(true);
		expect(planned.data.insert).toEqual([
			{ entity: 'transaction', id: 'tx-exp' },
			{ entity: 'recurring', id: 'rec-debt' }
		]);
		expect(planned.data.unchanged).toEqual([]);
		expect(planned.data.conflict).toEqual([{ entity: 'account', id: 'acc-1', fields: ['name'] }]);
		expect(planned.data.blocked).toEqual([
			{ entity: 'recurring', id: 'rec-missing', missing: 'account gone' }
		]);
		expect(planned.data.deps).toEqual([
			{ entity: 'account', id: 'acc-1' },
			{ entity: 'transaction', id: 'tx-exp' }
		]);

		const after = new SqliteLedgerRepository(ledger);
		expect((await after.listAccounts()).map((account) => account.name)).toEqual(['Other']);
		expect(await after.listTransactions()).toEqual([]);
		after.close();
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

function fixture(): Record<string, unknown> {
	return {
		versao: 18,
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
			}
		],
		cartoes: [],
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
				id: 'rec-missing',
				nome: 'Sumida',
				categoria: 'divida',
				tipo: 'saida',
				valorEsperado: 1,
				diaVencimento: 1,
				dataInicio: '2026-09-01',
				contaId: 'gone',
				ativa: true,
				statusPorMes: {},
				pagamentosPorMes: {},
				criadoEm: '2026-09-01T00:00:00.000Z'
			}
		],
		historicoSimulacoes: []
	};
}
