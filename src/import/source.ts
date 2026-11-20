import { readFileSync } from 'node:fs';
import type {
	Account,
	AccountCategory,
	AccountType,
	Card,
	ForecastFrequency,
	Installment,
	Recurring,
	RecurringStatus,
	RecurringType,
	Transaction,
	TransactionType
} from '../model';
import type { Settings } from '../settings/settings';
import { transactionCategory } from '../cli/vocabulary';

export interface ImportForecast {
	id: string;
	name: string;
	amount: number;
	type: RecurringType;
	frequency: ForecastFrequency;
	weekdays: number[] | null;
	endsOn: string | null;
	date: string;
	category: string;
	accountId: string | null;
}

export interface ParsedImport {
	version: number;
	ignored: string[];
	accounts: Account[];
	cards: Card[];
	transactions: Transaction[];
	recurrings: Recurring[];
	forecasts: ImportForecast[];
	settings: Settings;
}

const ROOT_KEYS = [
	'configuracao',
	'contas',
	'transacoes',
	'cartoes',
	'recorrentes',
	'historicoSimulacoes',
	'versao'
] as const;

export function readImport(path: string): ParsedImport {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		throw new Error('invalid import file: not found');
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('invalid import file: json');
	}
	if (!isRecord(raw)) throw new Error('invalid import file: json');
	for (const key of ROOT_KEYS) {
		if (!(key in raw)) throw new Error(`invalid import file: missing ${key}`);
	}
	const ignored = Object.keys(raw).filter((key) => !ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number]));
	const accounts = arrayOf(raw.contas, 'contas').map((row, index) =>
		mapAccount(row, index, ignored)
	);
	const cards = arrayOf(raw.cartoes, 'cartoes').map((row, index) => mapCard(row, index, ignored));
	const transactions = arrayOf(raw.transacoes, 'transacoes').map((row, index) =>
		mapTransaction(row, index, ignored)
	);
	const recurrings = arrayOf(raw.recorrentes, 'recorrentes').map((row, index) =>
		mapRecurring(row, index, ignored)
	);
	const forecasts = arrayOf(raw.historicoSimulacoes, 'historicoSimulacoes').map((row, index) =>
		mapForecast(row, index, ignored)
	);
	return {
		version: integer(raw.versao, 'versao'),
		ignored,
		accounts,
		cards,
		transactions,
		recurrings,
		forecasts,
		settings: mapSettings(raw.configuracao, ignored)
	};
}

function mapAccount(row: unknown, index: number, ignored: string[]): Account {
	const record = objectAt(row, 'contas', index);
	noteIgnored(record, 'contas', ACCOUNT_KEYS, ignored);
	const id = text(record.id, `contas ${index} id`);
	const category = record.categoria === undefined ? undefined : accountCategory(record.categoria, id);
	return {
		id,
		type: accountType(record.tipo, id),
		name: text(record.nome, `${id} nome`),
		description: textOrEmpty(record.descricao, `${id} descricao`),
		openingBalance: integer(record.saldoInicial, `${id} saldoInicial`),
		active: flag(record.ativa, `${id} ativa`),
		linkedAccountId: record.contaVinculadaId === undefined ? undefined : text(record.contaVinculadaId, `${id} contaVinculadaId`),
		category,
		createdAt: text(record.criadoEm, `${id} criadoEm`)
	};
}

function mapCard(row: unknown, index: number, ignored: string[]): Card {
	const record = objectAt(row, 'cartoes', index);
	noteIgnored(record, 'cartoes', CARD_KEYS, ignored);
	const id = text(record.id, `cartoes ${index} id`);
	return {
		id,
		name: text(record.nome, `${id} nome`),
		limit: integer(record.limite, `${id} limite`),
		closingDay: integer(record.diaFechamento, `${id} diaFechamento`),
		dueDay: integer(record.diaVencimento, `${id} diaVencimento`),
		color: text(record.cor, `${id} cor`),
		active: flag(record.ativo, `${id} ativo`),
		createdAt: text(record.criadoEm, `${id} criadoEm`)
	};
}

function mapTransaction(row: unknown, index: number, ignored: string[]): Transaction {
	const record = objectAt(row, 'transacoes', index);
	noteIgnored(record, 'transacoes', TRANSACTION_KEYS, ignored);
	const id = text(record.id, `transacoes ${index} id`);
	let category: string;
	try {
		category = transactionCategory(text(record.categoria, `${id} categoria`));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid category';
		throw new Error(`invalid import file: ${id} ${message}`);
	}
	const transaction: Transaction = {
		id,
		date: text(record.data, `${id} data`),
		description: textOrEmpty(record.descricao, `${id} descricao`),
		type: transactionKind(record.tipo, id),
		amount: integer(record.valor, `${id} valor`),
		category,
		accountId: text(record.contaId, `${id} contaId`),
		createdAt: text(record.criadoEm, `${id} criadoEm`)
	};
	if (record.contaDestinoId !== undefined) {
		transaction.destinationAccountId = text(record.contaDestinoId, `${id} contaDestinoId`);
	}
	if (record.cartaoId !== undefined) transaction.cardId = text(record.cartaoId, `${id} cartaoId`);
	if (record.faturaReferencia !== undefined) {
		transaction.invoiceReference = text(record.faturaReferencia, `${id} faturaReferencia`);
	}
	if (record.parcela !== undefined) transaction.installment = installment(record.parcela, id);
	if (record.grupoParcelamentoId !== undefined) {
		transaction.installmentGroupId = text(record.grupoParcelamentoId, `${id} grupoParcelamentoId`);
	}
	return transaction;
}

function mapRecurring(row: unknown, index: number, ignored: string[]): Recurring {
	const record = objectAt(row, 'recorrentes', index);
	noteIgnored(record, 'recorrentes', RECURRING_KEYS, ignored);
	const id = text(record.id, `recorrentes ${index} id`);
	let category: string;
	try {
		category = transactionCategory(text(record.categoria, `${id} categoria`));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid category';
		throw new Error(`invalid import file: ${id} ${message}`);
	}
	const recurring: Recurring = {
		id,
		name: text(record.nome, `${id} nome`),
		category,
		type: flow(record.tipo, id),
		expectedAmount: integer(record.valorEsperado, `${id} valorEsperado`),
		dueDay: integer(record.diaVencimento, `${id} diaVencimento`),
		startsOn: text(record.dataInicio, `${id} dataInicio`),
		accountId: text(record.contaId, `${id} contaId`),
		active: flag(record.ativa, `${id} ativa`),
		statusByMonth: statusMap(record.statusPorMes, id),
		paymentsByMonth: stringMap(record.pagamentosPorMes, `${id} pagamentosPorMes`),
		createdAt: text(record.criadoEm, `${id} criadoEm`)
	};
	if (record.dataFim !== undefined) recurring.endsOn = text(record.dataFim, `${id} dataFim`);
	if (record.cartaoId !== undefined) recurring.cardId = text(record.cartaoId, `${id} cartaoId`);
	return recurring;
}

function mapForecast(row: unknown, index: number, ignored: string[]): ImportForecast {
	const record = objectAt(row, 'historicoSimulacoes', index);
	noteIgnored(record, 'historicoSimulacoes', FORECAST_KEYS, ignored);
	const id = text(record.id, `historicoSimulacoes ${index} id`);
	let category: string;
	try {
		category = transactionCategory(text(record.categoria, `${id} categoria`));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'invalid category';
		throw new Error(`invalid import file: ${id} ${message}`);
	}
	return {
		id,
		name: text(record.nome, `${id} nome`),
		amount: integer(record.valor, `${id} valor`),
		type: flow(record.tipo, id),
		frequency: frequency(record.frequencia, id),
		weekdays: null,
		endsOn: record.dataFim === undefined ? null : text(record.dataFim, `${id} dataFim`),
		date: text(record.data, `${id} data`),
		category,
		accountId: record.contaId === undefined ? null : text(record.contaId, `${id} contaId`)
	};
}

function mapSettings(value: unknown, ignored: string[]): Settings {
	if (!isRecord(value)) throw new Error('invalid import file: configuracao');
	noteIgnored(value, 'configuracao', ['moeda', 'divisao', 'margemSeguranca'], ignored);
	if (!isRecord(value.divisao)) throw new Error('invalid import file: divisao');
	noteIgnored(value.divisao, 'divisao', ['geral', 'dividas', 'reserva'], ignored);
	return {
		currency: text(value.moeda, 'moeda'),
		general: integer(value.divisao.geral, 'geral'),
		debts: integer(value.divisao.dividas, 'dividas'),
		reserve: integer(value.divisao.reserva, 'reserva'),
		safetyMargin: integer(value.margemSeguranca, 'margemSeguranca')
	};
}

const ACCOUNT_KEYS = [
	'id',
	'tipo',
	'nome',
	'descricao',
	'saldoInicial',
	'ativa',
	'criadoEm',
	'contaVinculadaId',
	'categoria'
];
const CARD_KEYS = ['id', 'nome', 'limite', 'diaFechamento', 'diaVencimento', 'cor', 'ativo', 'criadoEm'];
const TRANSACTION_KEYS = [
	'id',
	'data',
	'descricao',
	'tipo',
	'valor',
	'categoria',
	'contaId',
	'criadoEm',
	'contaDestinoId',
	'cartaoId',
	'faturaReferencia',
	'parcela',
	'grupoParcelamentoId'
];
const RECURRING_KEYS = [
	'id',
	'nome',
	'categoria',
	'tipo',
	'valorEsperado',
	'diaVencimento',
	'dataInicio',
	'dataFim',
	'contaId',
	'cartaoId',
	'ativa',
	'statusPorMes',
	'pagamentosPorMes',
	'criadoEm'
];
const FORECAST_KEYS = [
	'id',
	'nome',
	'valor',
	'tipo',
	'data',
	'categoria',
	'frequencia',
	'dataFim',
	'contaId'
];

function accountType(value: unknown, id: string): AccountType {
	if (value === 'corrente') return 'checking';
	if (value === 'poupanca') return 'savings';
	throw new Error(`invalid import file: ${id} tipo`);
}

function accountCategory(value: unknown, id: string): AccountCategory {
	if (value === 'reserva') return 'reserve';
	if (value === 'meta') return 'goal';
	throw new Error(`invalid import file: ${id} categoria`);
}

function transactionKind(value: unknown, id: string): TransactionType {
	if (value === 'entrada') return 'income';
	if (value === 'saida') return 'expense';
	if (value === 'transferencia') return 'transfer';
	if (value === 'gasto-cartao') return 'card-expense';
	if (value === 'pagamento-fatura') return 'invoice-payment';
	throw new Error(`invalid import file: ${id} tipo`);
}

function flow(value: unknown, id: string): RecurringType {
	if (value === 'entrada') return 'income';
	if (value === 'saida') return 'expense';
	throw new Error(`invalid import file: ${id} tipo`);
}

function frequency(value: unknown, id: string): ForecastFrequency {
	if (value === 'mensal') return 'monthly';
	if (value === 'unica') return 'once';
	if (value === 'diaria') return 'daily';
	throw new Error(`invalid import file: ${id} frequencia`);
}

function statusMap(value: unknown, id: string): Record<string, RecurringStatus> {
	if (!isRecord(value)) throw new Error(`invalid import file: ${id} statusPorMes`);
	const mapped: Record<string, RecurringStatus> = {};
	for (const [month, status] of Object.entries(value)) {
		if (status === 'paga') mapped[month] = 'paid';
		else if (status === 'esperada') mapped[month] = 'expected';
		else throw new Error(`invalid import file: ${id} status`);
	}
	return mapped;
}

function stringMap(value: unknown, label: string): Record<string, string> {
	if (!isRecord(value)) throw new Error(`invalid import file: ${label}`);
	const mapped: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) mapped[key] = text(entry, label);
	return mapped;
}

function installment(value: unknown, id: string): Installment {
	if (!isRecord(value)) throw new Error(`invalid import file: ${id} parcela`);
	return {
		current: integer(value.atual, `${id} parcela`),
		total: integer(value.total, `${id} parcela`)
	};
}

function arrayOf(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) throw new Error(`invalid import file: ${label}`);
	return value;
}

function objectAt(value: unknown, label: string, index: number): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`invalid import file: ${label} ${index}`);
	return value;
}

function noteIgnored(
	record: Record<string, unknown>,
	label: string,
	known: string[],
	ignored: string[]
): void {
	for (const key of Object.keys(record)) {
		if (known.includes(key)) continue;
		const name = `${label}.${key}`;
		if (!ignored.includes(name)) ignored.push(name);
	}
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || value === '') throw new Error(`invalid import file: ${label}`);
	return value;
}

function textOrEmpty(value: unknown, label: string): string {
	if (typeof value !== 'string') throw new Error(`invalid import file: ${label}`);
	return value;
}

function integer(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		throw new Error(`invalid import file: ${label}`);
	}
	return value;
}

function flag(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') throw new Error(`invalid import file: ${label}`);
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
