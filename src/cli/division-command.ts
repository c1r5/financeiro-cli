import { CardRepository } from '../cards/cards';
import { ForecastRepository } from '../forecasts/forecasts';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import { RecurringRepository } from '../recurring/recurrings';
import {
	debtHorizons,
	divideIncome,
	listDebts,
	savedReserve,
	type DebtHorizon,
	type DebtLine,
	type IncomeSplit
} from '../sdk';
import { SettingsRepository } from '../settings/settings';
import type { SystemClock } from '../system-clock';

export async function runDivision(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock
): Promise<void> {
	if (args[1] !== 'show') throw new Error(`unknown division command: ${args[1]}`);
	const { month, year } = monthYear(args.slice(2));
	const loaded = load(file);
	try {
		const split = divideIncome({
			recurrings: loaded.recurrings.list(),
			forecasts: loaded.forecasts.list(),
			month,
			year,
			settings: loaded.settings.read()
		});
		const saved = await savedReserve(ledger, clock);
		for (const line of formatSplit(split, saved)) console.log(line);
	} finally {
		loaded.close();
	}
}

export async function runDebt(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock
): Promise<void> {
	const action = args[1];
	const flags = args.slice(2);
	const { month, year } = monthYear(flags);
	const loaded = load(file);
	try {
		if (action === 'list') {
			const lines = listDebts({
				recurrings: loaded.recurrings.list(),
				forecasts: loaded.forecasts.list(),
				cards: loaded.cards.list(),
				transactions: await ledger.listTransactions(),
				month,
				year,
				today: clock.today()
			});
			for (const line of lines) console.log(formatDebt(line));
			return;
		}
		if (action === 'cost') {
			const horizons = parseHorizons(required(flags, '--horizons'));
			const rows = debtHorizons({
				recurrings: loaded.recurrings.list(),
				forecasts: loaded.forecasts.list(),
				month,
				year,
				settings: loaded.settings.read(),
				horizons
			});
			for (const row of rows) console.log(formatHorizon(row));
			return;
		}
		throw new Error(`unknown debt command: ${action}`);
	} finally {
		loaded.close();
	}
}

function load(file: string): {
	settings: SettingsRepository;
	cards: CardRepository;
	recurrings: RecurringRepository;
	forecasts: ForecastRepository;
	close: () => void;
} {
	const settings = new SettingsRepository(file);
	const cards = new CardRepository(file);
	const recurrings = new RecurringRepository(file);
	const forecasts = new ForecastRepository(file);
	return {
		settings,
		cards,
		recurrings,
		forecasts,
		close: () => {
			settings.close();
			cards.close();
			recurrings.close();
			forecasts.close();
		}
	};
}

function formatSplit(split: IncomeSplit, saved: number): string[] {
	return [
		`general ${split.general}`,
		`debts ${split.debts}`,
		`reserve ${split.reserve}`,
		`income ${split.income}`,
		`saved ${saved}`
	];
}

function formatDebt(line: DebtLine): string {
	return `${line.kind} ${line.date} ${line.amount} ${line.description} ${line.reference}`;
}

function formatHorizon(row: DebtHorizon): string {
	return `${row.months} ${row.cost} ${row.bucket} ${row.surplus}`;
}

function monthYear(flags: string[]): { month: number; year: number } {
	const month = Number(required(flags, '--month'));
	const year = Number(required(flags, '--year'));
	if (!Number.isInteger(month) || month < 1 || month > 12) {
		throw new Error(`invalid month: ${month}`);
	}
	if (!Number.isInteger(year)) throw new Error(`invalid year: ${year}`);
	return { month, year };
}

function parseHorizons(value: string): number[] {
	const horizons = value.split(',').filter((part) => part !== '');
	if (horizons.length === 0) throw new Error('invalid horizons');
	return horizons.map((part) => {
		if (!/^\d+$/.test(part) || Number(part) === 0) throw new Error(`invalid horizon: ${part}`);
		return Number(part);
	});
}

function required(args: string[], name: string): string {
	const index = args.indexOf(name);
	const value = index === -1 ? undefined : args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing ${name}`);
	return value;
}
