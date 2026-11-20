import { Database } from 'bun:sqlite';
import type { CategoriaConta, Conta, TipoConta } from 'financeiro-sdk';
import type { RepositorioDoLivro } from 'financeiro-sdk';
import type {
	CategoriaTransacao,
	Parcela,
	TipoTransacao,
	Transacao
} from 'financeiro-sdk';

interface AccountRow {
	id: string;
	type: string;
	name: string;
	description: string;
	opening_balance: number;
	active: number;
	linked_account_id: string | null;
	category: string | null;
	created_at: string;
}

interface TransactionRow {
	id: string;
	date: string;
	description: string;
	type: string;
	amount: number;
	category: string;
	account_id: string;
	destination_account_id: string | null;
	card_id: string | null;
	invoice_reference: string | null;
	installment_current: number | null;
	installment_total: number | null;
	installment_group_id: string | null;
	created_at: string;
}

export class SqliteLedgerRepository implements RepositorioDoLivro {
	private readonly db: Database;

	constructor(arquivo: string) {
		this.db = new Database(arquivo);
		this.db.run(`CREATE TABLE IF NOT EXISTS accounts (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL,
			opening_balance INTEGER NOT NULL,
			active INTEGER NOT NULL,
			linked_account_id TEXT,
			category TEXT,
			created_at TEXT NOT NULL
		)`);
		this.db.run(`CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY,
			date TEXT NOT NULL,
			description TEXT NOT NULL,
			type TEXT NOT NULL,
			amount INTEGER NOT NULL,
			category TEXT NOT NULL,
			account_id TEXT NOT NULL,
			destination_account_id TEXT,
			card_id TEXT,
			invoice_reference TEXT,
			installment_current INTEGER,
			installment_total INTEGER,
			installment_group_id TEXT,
			created_at TEXT NOT NULL
		)`);
	}

	async listarContas(): Promise<Conta[]> {
		const rows = this.db.query<AccountRow, []>('SELECT * FROM accounts ORDER BY created_at, id').all();
		return rows.map(contaDe);
	}

	async gravarConta(conta: Conta): Promise<void> {
		this.db
			.query(
				`INSERT INTO accounts (
					id, type, name, description, opening_balance, active,
					linked_account_id, category, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				conta.id,
				conta.tipo,
				conta.nome,
				conta.descricao,
				conta.saldoInicial,
				conta.ativa ? 1 : 0,
				conta.contaVinculadaId ?? null,
				conta.categoria ?? null,
				conta.criadoEm
			);
	}

	async listarTransacoes(): Promise<Transacao[]> {
		const rows = this.db
			.query<TransactionRow, []>('SELECT * FROM transactions ORDER BY created_at, id')
			.all();
		return rows.map(transacaoDe);
	}

	async incluirTransacao(transacao: Transacao): Promise<void> {
		this.db
			.query(
				`INSERT INTO transactions (
					id, date, description, type, amount, category, account_id,
					destination_account_id, card_id, invoice_reference,
					installment_current, installment_total, installment_group_id,
					created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				transacao.id,
				transacao.data,
				transacao.descricao,
				transacao.tipo,
				transacao.valor,
				transacao.categoria,
				transacao.contaId,
				transacao.contaDestinoId ?? null,
				transacao.cartaoId ?? null,
				transacao.faturaReferencia ?? null,
				transacao.parcela?.atual ?? null,
				transacao.parcela?.total ?? null,
				transacao.grupoParcelamentoId ?? null,
				transacao.criadoEm
			);
	}

	async removerTransacao(id: string): Promise<void> {
		this.db.query('DELETE FROM transactions WHERE id = ?').run(id);
	}

	close(): void {
		this.db.close();
	}
}

function contaDe(row: AccountRow): Conta {
	const conta: Conta = {
		id: row.id,
		tipo: row.type as TipoConta,
		nome: row.name,
		descricao: row.description,
		saldoInicial: row.opening_balance,
		ativa: row.active === 1,
		criadoEm: row.created_at
	};
	if (row.linked_account_id) conta.contaVinculadaId = row.linked_account_id;
	if (row.category) conta.categoria = row.category as CategoriaConta;
	return conta;
}

function transacaoDe(row: TransactionRow): Transacao {
	const transacao: Transacao = {
		id: row.id,
		data: row.date,
		descricao: row.description,
		tipo: row.type as TipoTransacao,
		valor: row.amount,
		categoria: row.category as CategoriaTransacao,
		contaId: row.account_id,
		criadoEm: row.created_at
	};
	if (row.destination_account_id) transacao.contaDestinoId = row.destination_account_id;
	if (row.card_id) transacao.cartaoId = row.card_id;
	if (row.invoice_reference) transacao.faturaReferencia = row.invoice_reference;
	if (row.installment_current !== null && row.installment_total !== null) {
		const parcela: Parcela = { atual: row.installment_current, total: row.installment_total };
		transacao.parcela = parcela;
	}
	if (row.installment_group_id) transacao.grupoParcelamentoId = row.installment_group_id;
	return transacao;
}
