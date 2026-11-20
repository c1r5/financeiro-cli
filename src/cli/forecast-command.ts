import { ForecastRepository } from '../forecasts/forecasts';
import type { SqliteLedgerRepository } from '../ledger/sqlite-ledger-repository';
import {
	createForecast,
	editForecastDay,
	editForecastSeries,
	excludeForecastDate,
	forecastAmount,
	markForecastPaid,
	postTransaction
} from '../sdk';
import type { SystemClock } from '../system-clock';
import type { UuidGenerator } from '../uuid-generator';
import type { Reply } from './output';
import { flowType, forecastFrequency } from './vocabulary';

export async function runForecast(
	args: string[],
	file: string,
	ledger: SqliteLedgerRepository,
	clock: SystemClock,
	ids: UuidGenerator,
	reply: Reply
): Promise<void> {
	const action = args[1];
	const flags = args.slice(2);
	const forecasts = new ForecastRepository(file);
	try {
		if (action === 'add') {
			const frequency = forecastFrequency(required(flags, '--frequency'));
			const weekdays = option(flags, '--weekdays');
			const days = weekdays === undefined ? undefined : parseWeekdays(weekdays);
			if (frequency === 'daily' && (!days || days.length === 0)) {
				throw new Error('missing --weekdays');
			}
			const until = option(flags, '--until');
			const forecast = createForecast({
				id: ids.newId(),
				name: required(flags, '--name'),
				amount: cents(required(flags, '--amount')),
				type: flowType(required(flags, '--type')),
				frequency,
				date: required(flags, '--date'),
				category: required(flags, '--category'),
				accountId: required(flags, '--account'),
				weekdays: days,
				endsOn: until
			});
			forecasts.save(forecast);
			reply([forecast.id], { id: forecast.id });
			return;
		}
		if (action === 'exclude') {
			const forecast = forecasts.find(required(flags, '--id'));
			forecasts.save(excludeForecastDate(forecast, required(flags, '--date')));
			reply([], { id: forecast.id });
			return;
		}
		if (action === 'pay') {
			const forecast = forecasts.find(required(flags, '--id'));
			if (forecast.frequency !== 'daily') throw new Error('forecast pay is only for a daily series');
			const date = required(flags, '--date');
			const transaction = await postTransaction(ledger, clock, ids, {
				date,
				description: forecast.name,
				type: forecast.type,
				amount: forecastAmount(forecast, date),
				category: forecast.category,
				accountId: option(flags, '--account') ?? forecast.accountId
			});
			forecasts.save(markForecastPaid(forecast, date, transaction.id));
			reply([transaction.id], { id: transaction.id });
			return;
		}
		if (action === 'edit') {
			const forecast = forecasts.find(required(flags, '--id'));
			const amount = cents(required(flags, '--amount'));
			const all = hasFlag(flags, '--all');
			const date = option(flags, '--date');
			if (all && date) throw new Error('use either --date or --all');
			if (all) {
				forecasts.save(editForecastSeries(forecast, amount));
				reply([], { id: forecast.id });
				return;
			}
			if (!date) throw new Error('missing --date');
			if (forecast.frequency !== 'daily') throw new Error('a per-day amount is only for a daily series');
			forecasts.save(editForecastDay(forecast, date, amount));
			reply([], { id: forecast.id });
			return;
		}
		throw new Error(`unknown forecast command: ${action}`);
	} finally {
		forecasts.close();
	}
}

function parseWeekdays(value: string): number[] {
	const days = value.split(',').filter((part) => part !== '');
	if (days.length === 0) throw new Error('invalid weekdays');
	return days.map((part) => {
		if (!/^[0-6]$/.test(part)) throw new Error(`invalid weekday: ${part}`);
		return Number(part);
	});
}

function hasFlag(args: string[], name: string): boolean {
	return args.includes(name);
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
