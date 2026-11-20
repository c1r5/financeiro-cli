import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import { RecurringRepository } from '../recurring/recurrings';
import { run } from './run';

test('import apply writes source ids once and leaves a conflict untouched', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-apply-'));
	const source = join(dir, 'financeiro.json');
	const ledger = join(dir, 'ledger.sqlite');
	await writeFile(source, JSON.stringify(fixture()));
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		const args = [
			'--file',
			ledger,
			'import',
			'apply',
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
		];
		expect(await run(args)).toBe(0);
		const first = JSON.parse(lines[0]) as {
			ok: boolean;
			data: { inserted: Array<{ entity: string; id: string }>; unchanged: unknown[] };
		};
		expect(first.ok).toBe(true);
		expect(first.data.inserted).toEqual([
			{ entity: 'account', id: 'acc-1' },
			{ entity: 'transaction', id: 'tx-exp' },
			{ entity: 'recurring', id: 'rec-debt' }
		]);
		expect(first.data.unchanged).toEqual([]);

		const ledgerRows = new SqliteLedgerRepository(ledger);
		expect((await ledgerRows.listAccounts()).map((account) => ({ id: account.id, name: account.name }))).toEqual([
			{ id: 'acc-1', name: 'Cash' }
		]);
		expect((await ledgerRows.listTransactions()).map((transaction) => transaction.id)).toEqual(['tx-exp']);
		ledgerRows.close();
		const recurrings = new RecurringRepository(ledger);
		expect(recurrings.list().map((recurring) => recurring.id)).toEqual(['rec-debt']);
		expect(recurrings.list()[0].paymentsByMonth).toEqual({ '2026-11': 'tx-exp' });
		recurrings.close();

		lines.length = 0;
		expect(await run(args)).toBe(0);
		const second = JSON.parse(lines[0]) as {
			data: { inserted: unknown[]; unchanged: Array<{ entity: string; id: string }> };
		};
		expect(second.data.inserted).toEqual([]);
		expect(second.data.unchanged).toEqual([
			{ entity: 'account', id: 'acc-1' },
			{ entity: 'transaction', id: 'tx-exp' },
			{ entity: 'recurring', id: 'rec-debt' }
		]);

		const db = new Database(ledger);
		db.query('UPDATE accounts SET name = ? WHERE id = ?').run('Changed', 'acc-1');
		db.close();
		lines.length = 0;
		expect(await run(args)).toBe(1);
		const third = JSON.parse(lines[0]) as { ok: boolean; error: { code: string; message: string } };
		expect(third.ok).toBe(false);
		expect(third.error.code).toBe('invalid_value');
		expect(third.error.message).toBe('invalid import conflict: acc-1');

		const after = new SqliteLedgerRepository(ledger);
		expect((await after.listAccounts()).map((account) => account.name)).toEqual(['Changed']);
		expect(await after.listTransactions()).toHaveLength(1);
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
			}
		],
		historicoSimulacoes: []
	};
}
