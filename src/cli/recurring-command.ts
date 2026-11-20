import { CardRepository } from '../cards/cards';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import type { Transaction } from '../model';
import { RecurringRepository } from '../recurring/recurrings';
import {
	createRecurring,
	markRecurringExpected,
	markRecurringPaid,
	pendingRecurrings,
	postTransaction,
	purchaseOnCard,
	recurringOccurrence
} from '../sdk';
import type { SystemClock } from '../system-clock';
import type { UuidGenerator } from '../uuid-generator';
import type { Reply } from './output';
import { flowType } from './vocabulary';

export async function runRecurring(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
): Promise<void> {
	const action = args[1];
	const flags = args.slice(2);
	const recurrings = new RecurringRepository(file);
	const cards = new CardRepository(file);
	try {
		if (action === 'add') {
			const until = option(flags, '--until');
			const cardId = option(flags, '--card');
			const recurring = createRecurring({
				id: ids.newId(),
				createdAt: clock.now(),
				name: required(flags, '--name'),
				category: required(flags, '--category'),
				type: flowType(required(flags, '--type')),
				expectedAmount: cents(required(flags, '--amount')),
				dueDay: cents(required(flags, '--day')),
				startsOn: required(flags, '--start'),
				endsOn: until,
				accountId: required(flags, '--account'),
				cardId
			});
			recurrings.save(recurring);
			reply([recurring.id], { id: recurring.id });
			return;
		}
		if (action === 'list') {
			const month = yearMonth(required(flags, '--month'));
			const pending = pendingRecurrings(recurrings.list(), month);
			reply(
				pending.map((item) => `${item.id} ${item.date} ${item.name} ${item.amount}`),
				{
					month,
					pending: pending.map((item) => ({
						id: item.id,
						date: item.date,
						name: item.name,
						amount: item.amount
					}))
				}
			);
			return;
		}
		if (action === 'pay') {
			const recurring = recurrings.find(required(flags, '--id'));
			const month = yearMonth(required(flags, '--month'));
			const date = recurringOccurrence(recurring, month);
			if (!date) throw new Error(`no occurrence in ${month}`);
			const cardFlag = option(flags, '--card');
			const accountFlag = option(flags, '--account');
			if (cardFlag && accountFlag) throw new Error('use either --card or --account');
			const amount = option(flags, '--amount');
			const paidAmount = amount === undefined ? recurring.expectedAmount : cents(amount);
			const cardId = cardFlag ?? (accountFlag ? undefined : recurring.cardId);
			let transaction: Transaction;
			if (cardId) {
				transaction = purchaseOnCard({
					id: ids.newId(),
					createdAt: clock.now(),
					card: cards.find(cardId),
					date,
					description: recurring.name,
					amount: paidAmount,
					category: recurring.category
				});
				await ledger.insertTransaction(transaction);
			} else {
				transaction = await postTransaction(ledger, clock, ids, {
					date,
					description: recurring.name,
					type: recurring.type,
					amount: paidAmount,
					category: recurring.category,
					accountId: accountFlag ?? recurring.accountId
				});
			}
			recurrings.save(markRecurringPaid(recurring, month, transaction.id));
			reply([transaction.id], { id: transaction.id });
			return;
		}
		if (action === 'revert') {
			const recurring = recurrings.find(required(flags, '--id'));
			const month = yearMonth(required(flags, '--month'));
			const paymentId = recurring.paymentsByMonth[month];
			if (paymentId) await ledger.deleteTransaction(paymentId);
			recurrings.save(markRecurringExpected(recurring, month));
			reply([], { id: recurring.id, month });
			return;
		}
		throw new Error(`unknown recurring command: ${action}`);
	} finally {
		recurrings.close();
		cards.close();
	}
}

function yearMonth(value: string): string {
	if (!/^\d{4}-\d{2}$/.test(value)) throw new Error(`invalid month: ${value}`);
	return value;
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
