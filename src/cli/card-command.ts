import { CardRepository } from '../cards/cards';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Card, Invoice } from '../model';
import {
	createCard,
	installmentOnCard,
	invoiceBase,
	payInvoice,
	purchaseOnCard,
	readInvoice,
	summarizeCard
} from '../sdk';
import type { SystemClock } from '../system-clock';
import type { UuidGenerator } from '../uuid-generator';
import type { Reply } from './output';
import { recordLines } from './record';
import { transactionCategory } from './vocabulary';

export async function runCard(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
): Promise<void> {
	const action = args[1];
	const flags = args.slice(2);
	const cards = new CardRepository(file);
	try {
		if (action === 'list') {
			const listed = cards.list().map(cardData);
			reply(recordLines(listed), { cards: listed });
			return;
		}
		if (action === 'open') {
			const card = createCard({
				id: ids.newId(),
				createdAt: clock.now(),
				name: required(flags, '--name'),
				limit: cents(required(flags, '--limit')),
				closingDay: cents(required(flags, '--closes')),
				dueDay: cents(required(flags, '--due')),
				color: required(flags, '--color')
			});
			cards.save(card);
			reply([card.id], { id: card.id });
			return;
		}
		const card = cards.find(required(flags, '--card'));
		if (action === 'base') {
			const transaction = invoiceBase({
				id: ids.newId(),
				createdAt: clock.now(),
				card,
				reference: required(flags, '--reference'),
				amount: cents(required(flags, '--amount'))
			});
			await ledger.insertTransaction(transaction);
			reply([transaction.id], { id: transaction.id });
			return;
		}
		if (action === 'purchase') {
			const transaction = purchaseOnCard({
				id: ids.newId(),
				createdAt: clock.now(),
				card,
				date: required(flags, '--date'),
				description: required(flags, '--description'),
				amount: cents(required(flags, '--amount')),
				category: transactionCategory(required(flags, '--category'))
			});
			await ledger.insertTransaction(transaction);
			reply([transaction.id], { id: transaction.id });
			return;
		}
		if (action === 'installment') {
			const count = cents(required(flags, '--count'));
			const parcelIds = Array.from({ length: count }, () => ids.newId());
			const parcels = installmentOnCard({
				groupId: ids.newId(),
				ids: parcelIds,
				createdAt: clock.now(),
				card,
				date: required(flags, '--date'),
				description: required(flags, '--description'),
				amount: cents(required(flags, '--amount')),
				count,
				category: transactionCategory(required(flags, '--category'))
			});
			for (const parcel of parcels) await ledger.insertTransaction(parcel);
			reply(
				parcels.map((parcel) => `${parcel.id} ${parcel.amount}`),
				{ parcels: parcels.map((parcel) => ({ id: parcel.id, amount: parcel.amount })) }
			);
			return;
		}
		if (action === 'invoice') {
			const invoice = readInvoice(
				card,
				await ledger.listTransactions(),
				required(flags, '--reference'),
				clock.today()
			);
			reply(formatInvoice(invoice), invoice);
			return;
		}
		if (action === 'pay') {
			const transaction = payInvoice({
				id: ids.newId(),
				createdAt: clock.now(),
				card,
				accountId: required(flags, '--account'),
				date: required(flags, '--date'),
				amount: cents(required(flags, '--amount')),
				reference: required(flags, '--reference')
			});
			await ledger.insertTransaction(transaction);
			reply([`${transaction.id} ${transaction.type}`], {
				id: transaction.id,
				type: transaction.type
			});
			return;
		}
		if (action === 'summary') {
			const summary = summarizeCard(card, await ledger.listTransactions(), clock.today());
			reply(
				[
					`used ${summary.used}`,
					`available ${summary.available}`,
					`reference ${summary.reference}`
				],
				summary
			);
			return;
		}
		throw new Error(`unknown card command: ${action}`);
	} finally {
		cards.close();
	}
}

function cardData(card: Card): Record<string, unknown> {
	return {
		id: card.id,
		name: card.name,
		limit: card.limit,
		closingDay: card.closingDay,
		dueDay: card.dueDay,
		color: card.color,
		active: card.active,
		createdAt: card.createdAt
	};
}

function formatInvoice(invoice: Invoice): string[] {
	const lines = [
		`reference ${invoice.reference}`,
		`balance ${invoice.balance}`,
		`closed ${invoice.closed}`,
		`due ${invoice.due}`
	];
	if (invoice.expected !== undefined) lines.push(`expected ${invoice.expected}`);
	return lines;
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
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
