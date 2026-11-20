import {
	abrirConta,
	consultarSaldos,
	criarCartao,
	criarValorBase,
	gerarFatura,
	gerarResumo,
	listarTransacoes,
	registrarGasto,
	registrarGastoParcelado,
	registrarPagamento,
	aplicarASerie,
	calcularDivisao,
	calcularGastoDiarioDisponivel,
	calcularReservaAcumulada,
	calcularUsoDividas,
	contaNaProjecao,
	criarRecorrente,
	dataDaOcorrencia,
	definirValorDoDia,
	excluirOcorrencia,
	listarPendentesNoMes,
	marcarComoPaga,
	marcarComoPrevista,
	marcarDiaPago,
	ocorreNoDia,
	projetarCustoDividas,
	projetarSaldo,
	valorNoDia,
	type Frequencia,
	type Previsao,
	registrarTransacao,
	removerTransacao,
	validarConfiguracao,
	type Recorrente,
	type CategoriaConta,
	type CategoriaTransacao,
	type Cartao,
	type Conta,
	type EntradaDeTransacao,
	type FiltroDeTransacoes,
	type HorizonteCustoDividas,
	type LinhaDivida,
	type GeradorDeId,
	type Relogio,
	type RepositorioDoLivro,
	type TipoConta,
	type TipoTransacao,
	type Transacao
} from 'financeiro-sdk';
import type { SqliteLedgerRepository } from './ledger/sqlite-ledger-repository';
import type { Settings } from './settings/settings';
import type {
	Account,
	AccountCategory,
	AccountType,
	Card,
	CardSummary,
	Forecast,
	ForecastFrequency,
	Invoice,
	Recurring,
	RecurringStatus,
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

export function createCard(input: {
	id: string;
	createdAt: string;
	name: string;
	limit: number;
	closingDay: number;
	dueDay: number;
	color: string;
}): Card {
	return fromSdkCard(
		criarCartao({
			id: input.id,
			criadoEm: input.createdAt,
			nome: input.name,
			limite: input.limit,
			diaFechamento: input.closingDay,
			diaVencimento: input.dueDay,
			cor: input.color
		})
	);
}

export function purchaseOnCard(input: {
	id: string;
	createdAt: string;
	card: Card;
	date: string;
	description: string;
	amount: number;
	category: string;
}): Transaction {
	return fromSdkTransaction(
		registrarGasto({
			id: input.id,
			criadoEm: input.createdAt,
			cartao: toSdkCard(input.card),
			data: input.date,
			descricao: input.description,
			valor: input.amount,
			categoria: input.category as CategoriaTransacao
		})
	);
}

export function installmentOnCard(input: {
	groupId: string;
	ids: string[];
	createdAt: string;
	card: Card;
	date: string;
	description: string;
	amount: number;
	count: number;
	category: string;
}): Transaction[] {
	return registrarGastoParcelado({
		grupoId: input.groupId,
		ids: input.ids,
		criadoEm: input.createdAt,
		cartao: toSdkCard(input.card),
		data: input.date,
		descricao: input.description,
		valorTotal: input.amount,
		totalParcelas: input.count,
		categoria: input.category as CategoriaTransacao
	}).map(fromSdkTransaction);
}

export function invoiceBase(input: {
	id: string;
	createdAt: string;
	card: Card;
	reference: string;
	amount: number;
}): Transaction {
	return fromSdkTransaction(
		criarValorBase({
			id: input.id,
			criadoEm: input.createdAt,
			cartao: toSdkCard(input.card),
			referencia: input.reference,
			valor: input.amount
		})
	);
}

export function readInvoice(
	card: Card,
	transactions: Transaction[],
	reference: string,
	today: string
): Invoice {
	const invoice = gerarFatura(
		toSdkCard(card),
		transactions.map(toSdkTransaction),
		reference,
		today
	);
	return {
		reference: invoice.referencia,
		balance: invoice.saldo,
		closed: invoice.fechada,
		due: invoice.vencimento,
		expected: invoice.valorPrevisto
	};
}

export function payInvoice(input: {
	id: string;
	createdAt: string;
	card: Card;
	accountId: string;
	date: string;
	amount: number;
	reference: string;
}): Transaction {
	return fromSdkTransaction(
		registrarPagamento({
			id: input.id,
			criadoEm: input.createdAt,
			cartao: toSdkCard(input.card),
			contaId: input.accountId,
			data: input.date,
			valor: input.amount,
			faturaReferencia: input.reference
		})
	);
}

export function summarizeCard(
	card: Card,
	transactions: Transaction[],
	today: string
): CardSummary {
	const summary = gerarResumo(toSdkCard(card), transactions.map(toSdkTransaction), today);
	return {
		used: summary.limiteUsado,
		available: summary.limiteDisponivel,
		reference: summary.faturaAtual.referencia
	};
}

function toSdkCard(card: Card): Cartao {
	return {
		id: card.id,
		nome: card.name,
		limite: card.limit,
		diaFechamento: card.closingDay,
		diaVencimento: card.dueDay,
		cor: card.color,
		ativo: card.active,
		criadoEm: card.createdAt
	};
}

function fromSdkCard(card: Cartao): Card {
	return {
		id: card.id,
		name: card.nome,
		limit: card.limite,
		closingDay: card.diaFechamento,
		dueDay: card.diaVencimento,
		color: card.cor,
		active: card.ativo,
		createdAt: card.criadoEm
	};
}

const recurringStatusToSdk: Record<RecurringStatus, 'prevista' | 'paga'> = {
	expected: 'prevista',
	paid: 'paga'
};

const recurringStatusFromSdk: Record<'prevista' | 'paga', RecurringStatus> = {
	prevista: 'expected',
	paga: 'paid'
};

export interface RecurringDraft {
	id: string;
	createdAt: string;
	name: string;
	category: string;
	type: 'income' | 'expense';
	expectedAmount: number;
	dueDay: number;
	startsOn: string;
	endsOn?: string;
	accountId: string;
	cardId?: string;
}

export interface RecurringOccurrence {
	id: string;
	date: string;
	name: string;
	amount: number;
}

export function createRecurring(input: RecurringDraft): Recurring {
	return fromSdkRecurring(
		criarRecorrente({
			id: input.id,
			criadoEm: input.createdAt,
			nome: input.name,
			categoria: input.category as CategoriaTransacao,
			tipo: input.type === 'income' ? 'entrada' : 'saida',
			valorEsperado: input.expectedAmount,
			diaVencimento: input.dueDay,
			dataInicio: input.startsOn,
			dataFim: input.endsOn,
			contaId: input.accountId,
			cartaoId: input.cardId
		})
	);
}

export function recurringOccurrence(recurring: Recurring, month: string): string | null {
	return dataDaOcorrencia(toSdkRecurring(recurring), month);
}

export function pendingRecurrings(items: Recurring[], month: string): RecurringOccurrence[] {
	const pending = listarPendentesNoMes(items.map(toSdkRecurring), month);
	const occurrences: RecurringOccurrence[] = [];
	for (const item of pending) {
		const date = dataDaOcorrencia(item, month);
		if (!date) continue;
		occurrences.push({
			id: item.id,
			date,
			name: item.nome,
			amount: item.valorEsperado
		});
	}
	occurrences.sort(byDateThenId);
	return occurrences;
}

export function markRecurringPaid(
	recurring: Recurring,
	month: string,
	transactionId: string
): Recurring {
	return fromSdkRecurring(marcarComoPaga(toSdkRecurring(recurring), month, transactionId));
}

export function markRecurringExpected(recurring: Recurring, month: string): Recurring {
	return fromSdkRecurring(marcarComoPrevista(toSdkRecurring(recurring), month));
}

function byDateThenId(a: RecurringOccurrence, b: RecurringOccurrence): number {
	if (a.date < b.date) return -1;
	if (a.date > b.date) return 1;
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
}

function toSdkRecurring(recurring: Recurring): Recorrente {
	const statusPorMes: Record<string, 'prevista' | 'paga'> = {};
	for (const [month, status] of Object.entries(recurring.statusByMonth)) {
		statusPorMes[month] = recurringStatusToSdk[status];
	}
	const mapped: Recorrente = {
		id: recurring.id,
		nome: recurring.name,
		categoria: recurring.category as CategoriaTransacao,
		tipo: recurring.type === 'income' ? 'entrada' : 'saida',
		valorEsperado: recurring.expectedAmount,
		diaVencimento: recurring.dueDay,
		dataInicio: recurring.startsOn,
		contaId: recurring.accountId,
		ativa: recurring.active,
		statusPorMes,
		criadoEm: recurring.createdAt
	};
	if (recurring.endsOn) mapped.dataFim = recurring.endsOn;
	if (recurring.cardId) mapped.cartaoId = recurring.cardId;
	if (Object.keys(recurring.paymentsByMonth).length > 0) {
		mapped.pagamentosPorMes = { ...recurring.paymentsByMonth };
	}
	return mapped;
}

function fromSdkRecurring(recurring: Recorrente): Recurring {
	const statusByMonth: Record<string, RecurringStatus> = {};
	for (const [month, status] of Object.entries(recurring.statusPorMes)) {
		statusByMonth[month] = recurringStatusFromSdk[status];
	}
	const mapped: Recurring = {
		id: recurring.id,
		name: recurring.nome,
		category: recurring.categoria,
		type: recurring.tipo === 'entrada' ? 'income' : 'expense',
		expectedAmount: recurring.valorEsperado,
		dueDay: recurring.diaVencimento,
		startsOn: recurring.dataInicio,
		accountId: recurring.contaId,
		active: recurring.ativa,
		statusByMonth,
		paymentsByMonth: { ...(recurring.pagamentosPorMes ?? {}) },
		createdAt: recurring.criadoEm
	};
	if (recurring.dataFim) mapped.endsOn = recurring.dataFim;
	if (recurring.cartaoId) mapped.cardId = recurring.cartaoId;
	return mapped;
}

const frequencyToSdk: Record<ForecastFrequency, Frequencia> = {
	once: 'pontual',
	monthly: 'mensal',
	daily: 'diario'
};

const frequencyFromSdk: Record<Frequencia, ForecastFrequency> = {
	pontual: 'once',
	mensal: 'monthly',
	diario: 'daily'
};

export interface ForecastDraft {
	id: string;
	name: string;
	amount: number;
	type: 'income' | 'expense';
	frequency: ForecastFrequency;
	date: string;
	category: string;
	accountId: string;
	weekdays?: number[];
	endsOn?: string;
}

export function createForecast(input: ForecastDraft): Forecast {
	const forecast: Forecast = {
		id: input.id,
		name: input.name,
		amount: input.amount,
		type: input.type,
		frequency: input.frequency,
		date: input.date,
		category: input.category,
		accountId: input.accountId,
		statusByDay: {},
		paymentsByDay: {},
		amountsByDay: {},
		excluded: []
	};
	if (input.weekdays) forecast.weekdays = input.weekdays;
	if (input.endsOn) forecast.endsOn = input.endsOn;
	return forecast;
}

export function forecastOccurs(forecast: Forecast, date: string): boolean {
	return ocorreNoDia(toSdkForecast(forecast), date);
}

export function forecastAmount(forecast: Forecast, date: string): number {
	return valorNoDia(toSdkForecast(forecast), date);
}

export function forecastCounts(forecast: Forecast, date: string, start: string): boolean {
	return contaNaProjecao(toSdkForecast(forecast), date, start);
}

export function excludeForecastDate(forecast: Forecast, date: string): Forecast {
	return fromSdkForecast(excluirOcorrencia(toSdkForecast(forecast), date), forecast.accountId);
}

export function editForecastDay(forecast: Forecast, date: string, amount: number): Forecast {
	return fromSdkForecast(
		definirValorDoDia(toSdkForecast(forecast), date, amount),
		forecast.accountId
	);
}

export function editForecastSeries(forecast: Forecast, amount: number): Forecast {
	const original = toSdkForecast(forecast);
	const edited = toSdkForecast({ ...forecast, amount });
	return fromSdkForecast(aplicarASerie(original, edited), forecast.accountId);
}

export function markForecastPaid(forecast: Forecast, date: string, transactionId: string): Forecast {
	return fromSdkForecast(
		marcarDiaPago(toSdkForecast(forecast), date, transactionId),
		forecast.accountId
	);
}

function toSdkForecast(forecast: Forecast): Previsao {
	const mapped: Previsao = {
		id: forecast.id,
		nome: forecast.name,
		valor: forecast.amount,
		tipo: forecast.type === 'income' ? 'entrada' : 'saida',
		frequencia: frequencyToSdk[forecast.frequency],
		data: forecast.date,
		categoria: forecast.category as CategoriaTransacao
	};
	if (forecast.weekdays) mapped.diasSemana = forecast.weekdays;
	if (forecast.endsOn) mapped.dataFim = forecast.endsOn;
	if (Object.keys(forecast.statusByDay).length > 0) {
		const statusPorDia: Record<string, 'paga'> = {};
		for (const day of Object.keys(forecast.statusByDay)) statusPorDia[day] = 'paga';
		mapped.statusPorDia = statusPorDia;
	}
	if (Object.keys(forecast.paymentsByDay).length > 0) {
		mapped.pagamentosPorDia = { ...forecast.paymentsByDay };
	}
	if (Object.keys(forecast.amountsByDay).length > 0) {
		mapped.valoresPorDia = { ...forecast.amountsByDay };
	}
	if (forecast.excluded.length > 0) mapped.ocorrenciasExcluidas = [...forecast.excluded];
	return mapped;
}

function fromSdkForecast(forecast: Previsao, accountId: string): Forecast {
	const mapped: Forecast = {
		id: forecast.id,
		name: forecast.nome,
		amount: forecast.valor,
		type: forecast.tipo === 'entrada' ? 'income' : 'expense',
		frequency: frequencyFromSdk[forecast.frequencia],
		date: forecast.data,
		category: forecast.categoria ?? '',
		accountId,
		statusByDay: {},
		paymentsByDay: { ...(forecast.pagamentosPorDia ?? {}) },
		amountsByDay: { ...(forecast.valoresPorDia ?? {}) },
		excluded: [...(forecast.ocorrenciasExcluidas ?? [])]
	};
	if (forecast.diasSemana) mapped.weekdays = forecast.diasSemana;
	if (forecast.dataFim) mapped.endsOn = forecast.dataFim;
	if (forecast.statusPorDia) {
		for (const day of Object.keys(forecast.statusPorDia)) mapped.statusByDay[day] = 'paid';
	}
	return mapped;
}

export interface ProjectedDay {
	date: string;
	balance: number;
	events: string[];
}

export function projectBalance(input: {
	available: number;
	transactions: Transaction[];
	accounts: Account[];
	today: string;
	days: number;
	recurrings: Recurring[];
	cards: Card[];
	forecasts: Forecast[];
	margin: number;
}): { days: ProjectedDay[]; dailyLimit: number } {
	const projected = projetarSaldo({
		saldoAtual: input.available,
		transacoes: input.transactions.map(toSdkTransaction),
		contas: input.accounts.map(toSdkAccount),
		dataInicio: input.today,
		horizonteDias: input.days,
		recorrentes: input.recurrings.map(toSdkRecurring),
		cartoes: input.cards.map(toSdkCard),
		previsoes: input.forecasts.map(toSdkForecast)
	});
	const limits = calcularGastoDiarioDisponivel(projected, input.margin);
	return {
		days: projected.map((day) => ({
			date: day.data,
			balance: day.saldoProjetado,
			events: day.eventos.map(eventName)
		})),
		dailyLimit: limits[0] ?? 0
	};
}

function eventName(event: { nome: string }): string {
	if (event.nome.startsWith('Fatura ')) return `Invoice ${event.nome.slice('Fatura '.length)}`;
	return event.nome;
}

export interface IncomeSplit {
	general: number;
	debts: number;
	reserve: number;
	income: number;
}

export interface DebtLine {
	kind: 'payable' | 'paid';
	date: string;
	amount: number;
	description: string;
	reference: string;
}

export interface DebtHorizon {
	months: number;
	cost: number;
	bucket: number;
	surplus: number;
}

export function divideIncome(input: {
	recurrings: Recurring[];
	forecasts: Forecast[];
	month: number;
	year: number;
	settings: Settings;
}): IncomeSplit {
	const split = calcularDivisao({
		recorrentes: input.recurrings.map(toSdkRecurring),
		previsoes: input.forecasts.map(toSdkForecast),
		mes: input.month,
		ano: input.year,
		divisao: {
			geral: input.settings.general,
			dividas: input.settings.debts,
			reserva: input.settings.reserve
		}
	});
	return {
		general: split.geral,
		debts: split.dividas,
		reserve: split.reserva,
		income: split.totalEntradas
	};
}

export function listDebts(input: {
	recurrings: Recurring[];
	forecasts: Forecast[];
	cards: Card[];
	transactions: Transaction[];
	month: number;
	year: number;
	today: string;
}): DebtLine[] {
	const usage = calcularUsoDividas({
		recorrentes: input.recurrings.map(toSdkRecurring),
		previsoes: input.forecasts.map(toSdkForecast),
		cartoes: input.cards.map(toSdkCard),
		transacoes: input.transactions.map(toSdkTransaction),
		mes: input.month,
		ano: input.year,
		hoje: input.today
	});
	return [
		...usage.aPagar.map((line) => debtLine('payable', line)),
		...usage.pagas.map((line) => debtLine('paid', line))
	];
}

export function debtHorizons(input: {
	recurrings: Recurring[];
	forecasts: Forecast[];
	month: number;
	year: number;
	settings: Settings;
	horizons: number[];
}): DebtHorizon[] {
	const rows = projetarCustoDividas({
		recorrentes: input.recurrings.map(toSdkRecurring),
		previsoes: input.forecasts.map(toSdkForecast),
		divisao: {
			geral: input.settings.general,
			dividas: input.settings.debts,
			reserva: input.settings.reserve
		},
		mes: input.month,
		ano: input.year,
		horizontes: input.horizons
	});
	return rows.map(debtHorizon);
}

export async function savedReserve(
	repository: SqliteLedgerRepository,
	clock: SystemClock
): Promise<number> {
	const balances = await consultarSaldos(toSdkRepository(repository), toSdkClock(clock));
	return calcularReservaAcumulada(
		balances.contas.map((item) => item.conta),
		balances.contas
	);
}

function debtLine(kind: 'payable' | 'paid', line: LinhaDivida): DebtLine {
	return {
		kind,
		date: line.data,
		amount: line.valor,
		description: publicName(line.descricao),
		reference: line.id
	};
}

function debtHorizon(row: HorizonteCustoDividas): DebtHorizon {
	return {
		months: row.meses,
		cost: row.custoDividas,
		bucket: row.baldeAcumulado,
		surplus: row.excedente
	};
}

function publicName(name: string): string {
	if (name.startsWith('Fatura ')) return `Invoice ${name.slice('Fatura '.length)}`;
	return name;
}

export function checkSettings(settings: Settings): Settings {
	validarConfiguracao({
		moeda: settings.currency,
		divisao: {
			geral: settings.general,
			dividas: settings.debts,
			reserva: settings.reserve
		},
		margemSeguranca: settings.safetyMargin
	});
	return settings;
}
