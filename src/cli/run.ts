import {
	abrirConta,
	consultarSaldos,
	listarTransacoes,
	registrarTransacao,
	removerTransacao,
	type CategoriaTransacao,
	type EntradaDeTransacao,
	type FiltroDeTransacoes
} from 'financeiro-sdk';
import { HELP } from '../help';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import { SystemClock } from '../system-clock';
import { UuidGenerator } from '../uuid-generator';
import { accountCategory, accountType, cliType, transactionType } from './vocabulary';

export async function run(argv: string[]): Promise<number> {
	const args = [...argv];
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(HELP);
		return 0;
	}

	try {
		const arquivo = option(args, '--file') ?? 'financeiro.sqlite';
		const repo = new SqliteLedgerRepository(arquivo);
		const clock = new SystemClock();
		const ids = new UuidGenerator();
		try {
			await executar(args, repo, clock, ids);
		} finally {
			repo.close();
		}
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unknown error';
		console.error(message);
		return 1;
	}
}

async function executar(
	args: string[],
	repo: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const command = args[0];
	if (command === 'account' && args[1] === 'open') {
		await abrir(args.slice(2), repo, clock, ids);
		return;
	}
	if (command === 'balance') {
		const saldos = await consultarSaldos(repo, clock);
		console.log(`available ${saldos.totalCorrente}`);
		console.log(`savings ${saldos.totalPoupanca}`);
		console.log(`total ${saldos.total}`);
		return;
	}
	if (command === 'post') {
		await lancar(args.slice(1), repo, clock, ids);
		return;
	}
	if (command === 'list') {
		await listar(args.slice(1), repo);
		return;
	}
	if (command === 'remove') {
		const id = args[1];
		if (!id) throw new Error('missing id');
		await removerTransacao(repo, id);
		return;
	}
	throw new Error(`unknown command: ${command}`);
}

async function abrir(
	flags: string[],
	repo: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const tipo = accountType(required(flags, '--type'));
	const nome = required(flags, '--name');
	const saldoInicial = cents(required(flags, '--balance'));
	const linked = option(flags, '--linked');
	const category = option(flags, '--category');
	const aberto = abrirConta({
		id: ids.novoId(),
		lancamentoId: ids.novoId(),
		criadoEm: clock.agora(),
		hoje: clock.hoje(),
		tipo,
		nome,
		descricao: '',
		saldoInicial,
		contaVinculadaId: linked,
		categoria: category ? accountCategory(category) : undefined
	});
	await repo.gravarConta(aberto.conta);
	if (aberto.lancamento) await repo.incluirTransacao(aberto.lancamento);
	console.log(aberto.conta.id);
}

async function lancar(
	flags: string[],
	repo: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const entrada: EntradaDeTransacao = {
		data: required(flags, '--date'),
		descricao: required(flags, '--description'),
		tipo: transactionType(required(flags, '--type')),
		valor: cents(required(flags, '--amount')),
		categoria: (option(flags, '--category') ?? 'outros') as CategoriaTransacao,
		contaId: required(flags, '--account')
	};
	const destino = option(flags, '--to');
	if (destino) entrada.contaDestinoId = destino;
	const transacao = await registrarTransacao(repo, clock, ids, entrada);
	console.log(transacao.id);
}

async function listar(flags: string[], repo: SqliteLedgerRepository): Promise<void> {
	const filtro: FiltroDeTransacoes = {};
	const month = option(flags, '--month');
	const year = option(flags, '--year');
	if (month !== undefined && year !== undefined) {
		filtro.mes = Number(month);
		filtro.ano = Number(year);
	}
	const type = option(flags, '--type');
	if (type) filtro.tipo = transactionType(type);
	const text = option(flags, '--text');
	if (text) filtro.texto = text;
	const lista = await listarTransacoes(repo, filtro);
	for (const transacao of lista) {
		const tipo = cliType(transacao.tipo);
		console.log(
			`${transacao.id} ${transacao.data} ${tipo} ${transacao.valor} ${transacao.descricao}`
		);
	}
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
	args.splice(index, 2);
	return value;
}

function required(args: string[], name: string): string {
	const value = option(args, name);
	if (value === undefined) throw new Error(`missing ${name}`);
	return value;
}

function cents(value: string): number {
	if (!/^-?\d+$/.test(value)) throw new Error(`invalid amount: ${value}`);
	return Number(value);
}
