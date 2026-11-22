import { existsSync, writeFileSync } from 'node:fs';
import { CardRepository } from '../cards/cards';
import { ForecastRepository } from '../forecasts/forecasts';
import { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Account, Card, Forecast, Recurring, Transaction } from '../model';
import { RecurringRepository } from '../recurring/recurrings';
import { defaultSettings, SettingsRepository, type Settings } from '../settings/settings';

export const EXPORT_VERSION = 18;

export interface ExportCounts {
	accounts: number;
	cards: number;
	transactions: number;
	recurrings: number;
	forecasts: number;
}

export interface ExportResult {
	path: string;
	version: number;
	counts: ExportCounts;
}

export async function exportLedger(file: string, target: string, force: boolean): Promise<ExportResult> {
	if (!force && existsSync(target)) throw new Error('invalid export path: exists');
	const snapshot = await readLedger(file);
	const body = {
		configuracao: configuracao(snapshot.settings),
		contas: snapshot.accounts.map(conta),
		transacoes: snapshot.transactions.map(transacao),
		cartoes: snapshot.cards.map(cartao),
		recorrentes: snapshot.recurrings.map(recorrente),
		historicoSimulacoes: snapshot.forecasts.map(simulacao),
		versao: EXPORT_VERSION
	};
	try {
		writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
	} catch {
		throw new Error(`invalid export path: ${target}`);
	}
	return {
		path: target,
		version: EXPORT_VERSION,
		counts: {
			accounts: snapshot.accounts.length,
			cards: snapshot.cards.length,
			transactions: snapshot.transactions.length,
			recurrings: snapshot.recurrings.length,
			forecasts: snapshot.forecasts.length
		}
	};
}

function configuracao(settings: Settings): Record<string, unknown> {
	return {
		moeda: settings.currency,
		divisao: {
			geral: settings.general,
			dividas: settings.debts,
			reserva: settings.reserve
		},
		margemSeguranca: settings.safetyMargin
	};
}

function conta(account: Account): Record<string, unknown> {
	return keep({
		id: account.id,
		tipo: account.type === 'checking' ? 'corrente' : 'poupanca',
		nome: account.name,
		descricao: account.description,
		saldoInicial: account.openingBalance,
		ativa: account.active,
		contaVinculadaId: account.linkedAccountId,
		categoria: account.category === 'goal' ? 'objetivo' : account.category === 'reserve' ? 'reserva' : undefined,
		criadoEm: account.createdAt
	});
}

function transacao(transaction: Transaction): Record<string, unknown> {
	return keep({
		id: transaction.id,
		data: transaction.date,
		descricao: transaction.description,
		tipo: tipoTransacao(transaction.type),
		valor: transaction.amount,
		categoria: transaction.category,
		contaId: transaction.accountId,
		contaDestinoId: transaction.destinationAccountId,
		cartaoId: transaction.cardId,
		faturaReferencia: transaction.invoiceReference,
		parcela: transaction.installment
			? { atual: transaction.installment.current, total: transaction.installment.total }
			: undefined,
		grupoParcelamentoId: transaction.installmentGroupId,
		criadoEm: transaction.createdAt
	});
}

function cartao(card: Card): Record<string, unknown> {
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

function recorrente(recurring: Recurring): Record<string, unknown> {
	return keep({
		id: recurring.id,
		nome: recurring.name,
		categoria: recurring.category,
		tipo: recurring.type === 'income' ? 'entrada' : 'saida',
		valorEsperado: recurring.expectedAmount,
		diaVencimento: recurring.dueDay,
		dataInicio: recurring.startsOn,
		dataFim: recurring.endsOn,
		contaId: recurring.accountId,
		cartaoId: recurring.cardId,
		ativa: recurring.active,
		statusPorMes: mapStatus(recurring.statusByMonth),
		pagamentosPorMes: recurring.paymentsByMonth,
		criadoEm: recurring.createdAt
	});
}

function simulacao(forecast: Forecast): Record<string, unknown> {
	const statusPorDia: Record<string, string> = {};
	for (const [day, status] of Object.entries(forecast.statusByDay)) {
		if (status === 'paid') statusPorDia[day] = 'paga';
	}
	return keep({
		id: forecast.id,
		nome: forecast.name,
		valor: forecast.amount,
		tipo: forecast.type === 'income' ? 'entrada' : 'saida',
		frequencia: frequencia(forecast.frequency),
		diasSemana: forecast.weekdays,
		dataFim: forecast.endsOn,
		statusPorDia,
		pagamentosPorDia: forecast.paymentsByDay,
		valoresPorDia: forecast.amountsByDay,
		ocorrenciasExcluidas: forecast.excluded,
		data: forecast.date,
		categoria: forecast.category
	});
}

function mapStatus(status: Record<string, string>): Record<string, string> {
	const mapped: Record<string, string> = {};
	for (const [month, value] of Object.entries(status)) {
		mapped[month] = value === 'paid' ? 'paga' : 'prevista';
	}
	return mapped;
}

function tipoTransacao(type: Transaction['type']): string {
	if (type === 'income') return 'entrada';
	if (type === 'expense') return 'saida';
	if (type === 'transfer') return 'transferencia';
	if (type === 'card-expense') return 'gasto-cartao';
	return 'pagamento-fatura';
}

function frequencia(frequency: Forecast['frequency']): string {
	if (frequency === 'once') return 'pontual';
	if (frequency === 'daily') return 'diario';
	return 'mensal';
}

function keep(record: Record<string, unknown>): Record<string, unknown> {
	const kept: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
		kept[key] = value;
	}
	return kept;
}

async function readLedger(file: string): Promise<{
	settings: Settings;
	accounts: Account[];
	cards: Card[];
	transactions: Transaction[];
	recurrings: Recurring[];
	forecasts: Forecast[];
}> {
	if (!existsSync(file)) {
		return {
			settings: { ...defaultSettings },
			accounts: [],
			cards: [],
			transactions: [],
			recurrings: [],
			forecasts: []
		};
	}
	const ledger = new SqliteLedgerRepository(file);
	const cards = new CardRepository(file);
	const recurrings = new RecurringRepository(file);
	const forecasts = new ForecastRepository(file);
	const settings = new SettingsRepository(file);
	try {
		return {
			settings: settings.stored() ?? { ...defaultSettings },
			accounts: await ledger.listAccounts(),
			cards: cards.list(),
			transactions: await ledger.listTransactions(),
			recurrings: recurrings.list(),
			forecasts: forecasts.list()
		};
	} finally {
		ledger.close();
		cards.close();
		recurrings.close();
		forecasts.close();
		settings.close();
	}
}
