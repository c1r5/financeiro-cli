import { CardRepository } from '../cards/cards';
import { ForecastRepository } from '../forecasts/forecasts';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import { RecurringRepository } from '../recurring/recurrings';
import { projectBalance, readBalances, type ProjectedDay } from '../sdk';
import { SettingsRepository } from '../settings/settings';
import type { SystemClock } from '../system-clock';
import type { Reply } from './output';

export async function runProjection(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock,
	reply: Reply
): Promise<void> {
	if (args[1] !== 'show') throw new Error(`unknown projection command: ${args[1]}`);
	const days = cents(required(args.slice(2), '--days'));
	const settings = new SettingsRepository(file);
	const cards = new CardRepository(file);
	const recurrings = new RecurringRepository(file);
	const forecasts = new ForecastRepository(file);
	try {
		const balances = await readBalances(ledger, clock);
		const projected = projectBalance({
			available: balances.available,
			transactions: await ledger.listTransactions(),
			accounts: await ledger.listAccounts(),
			today: clock.today(),
			days,
			recurrings: recurrings.list(),
			cards: cards.list(),
			forecasts: [...forecasts.list()].sort(byName),
			margin: settings.read().safetyMargin
		});
		reply(
			[...projected.days.map(formatDay), `daily-limit ${projected.dailyLimit}`],
			projected
		);
	} finally {
		settings.close();
		cards.close();
		recurrings.close();
		forecasts.close();
	}
}

function byName(a: { name: string }, b: { name: string }): number {
	if (a.name < b.name) return -1;
	if (a.name > b.name) return 1;
	return 0;
}

function formatDay(day: ProjectedDay): string {
	const events = day.events.length === 0 ? '-' : day.events.join(',');
	return `${day.date} ${day.balance} ${events}`;
}

function required(args: string[], name: string): string {
	const index = args.indexOf(name);
	const value = index === -1 ? undefined : args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing ${name}`);
	return value;
}

function cents(value: string): number {
	if (!/^\d+$/.test(value)) throw new Error(`invalid amount: ${value}`);
	return Number(value);
}
