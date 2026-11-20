import type { CategoriaConta, TipoConta, TipoTransacao } from 'financeiro-sdk';

export function accountType(value: string): TipoConta {
	if (value === 'checking') return 'corrente';
	if (value === 'savings') return 'poupanca';
	throw new Error(`unknown account type: ${value}`);
}

export function accountCategory(value: string): CategoriaConta {
	if (value === 'reserve') return 'reserva';
	if (value === 'goal') return 'objetivo';
	throw new Error(`unknown account category: ${value}`);
}

export function transactionType(value: string): TipoTransacao {
	if (value === 'income') return 'entrada';
	if (value === 'expense') return 'saida';
	if (value === 'transfer') return 'transferencia';
	throw new Error(`unknown transaction type: ${value}`);
}

export function cliType(tipo: TipoTransacao): string {
	if (tipo === 'entrada') return 'income';
	if (tipo === 'saida') return 'expense';
	if (tipo === 'transferencia') return 'transfer';
	return tipo;
}
