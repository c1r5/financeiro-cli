import { CardRepository } from '../cards/cards';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Invoice } from '../model';
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

export async function runCard(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator
): Promise<void> {
	const action = args[1];
	const flags = args.slice(2);
	const cards = new CardRepository(file);
	try {
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
			console.log(card.id);
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
			console.log(transaction.id);
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
				category: required(flags, '--category')
			});
			await ledger.insertTransaction(transaction);
			console.log(transaction.id);
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
				category: required(flags, '--category')
			});
			for (const parcel of parcels) await ledger.insertTransaction(parcel);
			for (const parcel of parcels) console.log(`${parcel.id} ${parcel.amount}`);
			return;
		}
		if (action === 'invoice') {
			const invoice = readInvoice(
				card,
				await ledger.listTransactions(),
				required(flags, '--reference'),
				clock.today()
			);
			for (const line of formatInvoice(invoice)) console.log(line);
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
			console.log(`${transaction.id} ${transaction.type}`);
			return;
		}
		if (action === 'summary') {
			const summary = summarizeCard(card, await ledger.listTransactions(), clock.today());
			console.log(`used ${summary.used}`);
			console.log(`available ${summary.available}`);
			console.log(`reference ${summary.reference}`);
			return;
		}
		throw new Error(`unknown card command: ${action}`);
	} finally {
		cards.close();
	}
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
