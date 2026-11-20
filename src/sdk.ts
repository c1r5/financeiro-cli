import {
	abrirConta,
	consultarSaldos,
	listarTransacoes,
	registrarTransacao,
	removerTransacao,
	type CategoriaConta,
	type CategoriaTransacao,
	type Conta,
	type EntradaDeTransacao,
	type FiltroDeTransacoes,
	type GeradorDeId,
	type Relogio,
	type RepositorioDoLivro,
	type TipoConta,
	type TipoTransacao,
	type Transacao
} from 'financeiro-sdk';
import type { SqliteLedgerRepository } from './ledger/sqlite-ledger-repository';
import type {
	Account,
	AccountCategory,
	AccountType,
	Transaction,
	TransactionType
} from './model';
import type { SystemClock } from './system-clock';
import type { UuidGenerator } from './uuid-generator';

export interface Balances {
	available: number;
	savings: number;
	total: number;
}

export interface OpenAccountInput {
	id: string;
	transactionId: string;
	createdAt: string;
	today: string;
	type: AccountType;
	name: string;
	description: string;
	openingBalance: number;
	linkedAccountId?: string;
	category?: AccountCategory;
}

export interface OpenedAccount {
	account: Account;
	transaction?: Transaction;
}

export interface PostInput {
	date: string;
	description: string;
	type: TransactionType;
	amount: number;
	category: string;
	accountId: string;
	destinationAccountId?: string;
}

export interface ListFilter {
	month?: number;
	year?: number;
	type?: TransactionType;
	text?: string;
}

const accountTypeToSdk: Record<AccountType, TipoConta> = {
	checking: 'corrente',
	savings: 'poupanca'
};

const accountTypeFromSdk: Record<TipoConta, AccountType> = {
	corrente: 'checking',
	poupanca: 'savings'
};

const accountCategoryToSdk: Record<AccountCategory, CategoriaConta> = {
	reserve: 'reserva',
	goal: 'objetivo'
};

const accountCategoryFromSdk: Record<CategoriaConta, AccountCategory> = {
	reserva: 'reserve',
	objetivo: 'goal'
};

const transactionTypeToSdk: Record<TransactionType, TipoTransacao> = {
	income: 'entrada',
	expense: 'saida',
	transfer: 'transferencia',
	'invoice-payment': 'pagamento-fatura',
	'card-expense': 'gasto-cartao'
};

const transactionTypeFromSdk: Record<TipoTransacao, TransactionType> = {
	entrada: 'income',
	saida: 'expense',
	transferencia: 'transfer',
	'pagamento-fatura': 'invoice-payment',
	'gasto-cartao': 'card-expense'
};

export function openAccount(input: OpenAccountInput): OpenedAccount {
	const opened = abrirConta({
		id: input.id,
		lancamentoId: input.transactionId,
		criadoEm: input.createdAt,
		hoje: input.today,
		tipo: accountTypeToSdk[input.type],
		nome: input.name,
		descricao: input.description,
		saldoInicial: input.openingBalance,
		contaVinculadaId: input.linkedAccountId,
		categoria: input.category ? accountCategoryToSdk[input.category] : undefined
	});
	return {
		account: fromSdkAccount(opened.conta),
		transaction: opened.lancamento ? fromSdkTransaction(opened.lancamento) : undefined
	};
}

export async function readBalances(
	repository: SqliteLedgerRepository,
	clock: SystemClock
): Promise<Balances> {
	const balances = await consultarSaldos(toSdkRepository(repository), toSdkClock(clock));
	return {
		available: balances.totalCorrente,
		savings: balances.totalPoupanca,
		total: balances.total
	};
}

export async function postTransaction(
	repository: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	input: PostInput
): Promise<Transaction> {
	const entry: EntradaDeTransacao = {
		data: input.date,
		descricao: input.description,
		tipo: transactionTypeToSdk[input.type],
		valor: input.amount,
		categoria: input.category as CategoriaTransacao,
		contaId: input.accountId
	};
	if (input.destinationAccountId) entry.contaDestinoId = input.destinationAccountId;
	const created = await registrarTransacao(
		toSdkRepository(repository),
		toSdkClock(clock),
		toSdkIds(ids),
		entry
	);
	return fromSdkTransaction(created);
}

export async function listLedger(
	repository: SqliteLedgerRepository,
	filter: ListFilter
): Promise<Transaction[]> {
	const sdkFilter: FiltroDeTransacoes = {};
	if (filter.month !== undefined && filter.year !== undefined) {
		sdkFilter.mes = filter.month;
		sdkFilter.ano = filter.year;
	}
	if (filter.type) sdkFilter.tipo = transactionTypeToSdk[filter.type];
	if (filter.text) sdkFilter.texto = filter.text;
	const rows = await listarTransacoes(toSdkRepository(repository), sdkFilter);
	return rows.map(fromSdkTransaction);
}

export async function deleteTransaction(
	repository: SqliteLedgerRepository,
	id: string
): Promise<void> {
	await removerTransacao(toSdkRepository(repository), id);
}

function toSdkRepository(repository: SqliteLedgerRepository): RepositorioDoLivro {
	return {
		listarContas: async () => (await repository.listAccounts()).map(toSdkAccount),
		gravarConta: async (account) => {
			await repository.saveAccount(fromSdkAccount(account));
		},
		listarTransacoes: async () => (await repository.listTransactions()).map(toSdkTransaction),
		incluirTransacao: async (transaction) => {
			await repository.insertTransaction(fromSdkTransaction(transaction));
		},
		removerTransacao: (id) => repository.deleteTransaction(id)
	};
}

function toSdkClock(clock: SystemClock): Relogio {
	return { hoje: () => clock.today(), agora: () => clock.now() };
}

function toSdkIds(ids: UuidGenerator): GeradorDeId {
	return { novoId: () => ids.newId() };
}

function toSdkAccount(account: Account): Conta {
	const mapped: Conta = {
		id: account.id,
		tipo: accountTypeToSdk[account.type],
		nome: account.name,
		descricao: account.description,
		saldoInicial: account.openingBalance,
		ativa: account.active,
		criadoEm: account.createdAt
	};
	if (account.linkedAccountId) mapped.contaVinculadaId = account.linkedAccountId;
	if (account.category) mapped.categoria = accountCategoryToSdk[account.category];
	return mapped;
}

function fromSdkAccount(account: Conta): Account {
	const mapped: Account = {
		id: account.id,
		type: accountTypeFromSdk[account.tipo],
		name: account.nome,
		description: account.descricao,
		openingBalance: account.saldoInicial,
		active: account.ativa,
		createdAt: account.criadoEm
	};
	if (account.contaVinculadaId) mapped.linkedAccountId = account.contaVinculadaId;
	if (account.categoria) mapped.category = accountCategoryFromSdk[account.categoria];
	return mapped;
}

function toSdkTransaction(transaction: Transaction): Transacao {
	const mapped: Transacao = {
		id: transaction.id,
		data: transaction.date,
		descricao: transaction.description,
		tipo: transactionTypeToSdk[transaction.type],
		valor: transaction.amount,
		categoria: transaction.category as CategoriaTransacao,
		contaId: transaction.accountId,
		criadoEm: transaction.createdAt
	};
	if (transaction.destinationAccountId) mapped.contaDestinoId = transaction.destinationAccountId;
	if (transaction.cardId) mapped.cartaoId = transaction.cardId;
	if (transaction.invoiceReference) mapped.faturaReferencia = transaction.invoiceReference;
	if (transaction.installment) {
		mapped.parcela = { atual: transaction.installment.current, total: transaction.installment.total };
	}
	if (transaction.installmentGroupId) mapped.grupoParcelamentoId = transaction.installmentGroupId;
	return mapped;
}

function fromSdkTransaction(transaction: Transacao): Transaction {
	const mapped: Transaction = {
		id: transaction.id,
		date: transaction.data,
		description: transaction.descricao,
		type: transactionTypeFromSdk[transaction.tipo],
		amount: transaction.valor,
		category: transaction.categoria,
		accountId: transaction.contaId,
		createdAt: transaction.criadoEm
	};
	if (transaction.contaDestinoId) mapped.destinationAccountId = transaction.contaDestinoId;
	if (transaction.cartaoId) mapped.cardId = transaction.cartaoId;
	if (transaction.faturaReferencia) mapped.invoiceReference = transaction.faturaReferencia;
	if (transaction.parcela) {
		mapped.installment = { current: transaction.parcela.atual, total: transaction.parcela.total };
	}
	if (transaction.grupoParcelamentoId) mapped.installmentGroupId = transaction.grupoParcelamentoId;
	return mapped;
}
