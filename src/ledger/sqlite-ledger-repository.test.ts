import { expect, test } from 'bun:test';
import { registrarLinha, type Conta } from 'financeiro-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteLedgerRepository } from './sqlite-ledger-repository';

test('o sqlite grava conta e lançamento e apaga o lançamento', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-'));
	const repo = new SqliteLedgerRepository(join(dir, 'livro.sqlite'));
	const conta: Conta = {
		id: 'cc',
		tipo: 'corrente',
		nome: 'Nubank',
		descricao: '',
		saldoInicial: 0,
		ativa: true,
		criadoEm: '2026-11-20T12:00:00.000Z'
	};
	await repo.gravarConta(conta);
	const linha = registrarLinha({
		id: 'tx',
		criadoEm: conta.criadoEm,
		data: '2026-11-20',
		descricao: 'Mercado',
		tipo: 'saida',
		valor: 1500,
		categoria: 'mercado',
		contaId: 'cc'
	});
	await repo.incluirTransacao(linha);
	expect(await repo.listarContas()).toEqual([conta]);
	expect(await repo.listarTransacoes()).toEqual([linha]);
	await repo.removerTransacao(linha.id);
	expect(await repo.listarTransacoes()).toEqual([]);
	expect(await repo.listarContas()).toEqual([conta]);
	await rm(dir, { recursive: true, force: true });
});
