import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForecastRepository } from '../forecasts/forecasts';
import { forecastAmount, forecastCounts, forecastOccurs } from '../sdk';
import { run } from './run';

test('a monthly forecast skips a short month and a daily edit pays one day', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'financeiro-forecast-'));
	const file = join(dir, 'ledger.sqlite');
	const lines: string[] = [];
	const log = console.log;
	console.log = (...args: unknown[]) => {
		lines.push(args.map(String).join(' '));
	};
	try {
		expect(
			await run([
				'--file',
				file,
				'account',
				'open',
				'--type',
				'checking',
				'--name',
				'Cash',
				'--balance',
				'5000'
			])
		).toBe(0);
		const accountId = lines.at(-1) ?? '';
		expect(
			await run([
				'--file',
				file,
				'forecast',
				'add',
				'--type',
				'expense',
				'--frequency',
				'monthly',
				'--name',
				'Lease',
				'--amount',
				'3100',
				'--date',
				'2026-01-31',
				'--category',
				'moradia',
				'--account',
				accountId
			])
		).toBe(0);
		const leaseId = lines.at(-1) ?? '';
		const forecasts = new ForecastRepository(file);
		try {
			const lease = forecasts.find(leaseId);
			for (let day = 1; day <= 28; day++) {
				const date = `2026-02-${String(day).padStart(2, '0')}`;
				expect(forecastOccurs(lease, date)).toBe(false);
			}
			expect(forecastOccurs(lease, '2026-03-31')).toBe(true);
		} finally {
			forecasts.close();
		}
		expect(
			await run(['--file', file, 'forecast', 'exclude', '--id', leaseId, '--date', '2026-03-31'])
		).toBe(0);
		const tuesday = firstWeekday('2026-03-01', 2);
		const nextTuesday = firstWeekday(shiftDate(tuesday, 1), 2);
		expect(
			await run([
				'--file',
				file,
				'forecast',
				'add',
				'--type',
				'expense',
				'--frequency',
				'daily',
				'--name',
				'Lunch',
				'--amount',
				'1500',
				'--date',
				tuesday,
				'--category',
				'alimentacao',
				'--account',
				accountId,
				'--weekdays',
				'2'
			])
		).toBe(0);
		const lunchId = lines.at(-1) ?? '';
		expect(
			await run([
				'--file',
				file,
				'forecast',
				'edit',
				'--id',
				lunchId,
				'--date',
				tuesday,
				'--amount',
				'900'
			])
		).toBe(0);
		const afterEdit = new ForecastRepository(file);
		try {
			const lease = afterEdit.find(leaseId);
			const lunch = afterEdit.find(lunchId);
			expect(forecastOccurs(lease, '2026-03-31')).toBe(false);
			expect(forecastOccurs(lease, '2026-05-31')).toBe(true);
			expect(forecastAmount(lunch, tuesday)).toBe(900);
			expect(forecastAmount(lunch, nextTuesday)).toBe(1500);
		} finally {
			afterEdit.close();
		}
		expect(
			await run(['--file', file, 'forecast', 'pay', '--id', lunchId, '--date', tuesday])
		).toBe(0);
		const paymentId = lines.at(-1) ?? '';
		const beforeList = lines.length;
		expect(await run(['--file', file, 'list'])).toBe(0);
		expect(lines.slice(beforeList).some((line) => line.startsWith(paymentId))).toBe(true);
		expect(lines.slice(beforeList).some((line) => line.includes('expense 900 Lunch'))).toBe(true);
		const beforeBalance = lines.length;
		expect(await run(['--file', file, 'balance'])).toBe(0);
		expect(lines.slice(beforeBalance)[0]).toBe('available 4100');
		const afterPay = new ForecastRepository(file);
		try {
			const lunch = afterPay.find(lunchId);
			expect(forecastCounts(lunch, tuesday, tuesday)).toBe(false);
			expect(forecastOccurs(lunch, nextTuesday)).toBe(true);
			expect(forecastCounts(lunch, nextTuesday, tuesday)).toBe(true);
			expect(forecastAmount(lunch, nextTuesday)).toBe(1500);
		} finally {
			afterPay.close();
		}
		expect(
			await run(['--file', file, 'forecast', 'edit', '--id', lunchId, '--amount', '2000', '--all'])
		).toBe(0);
		const afterAll = new ForecastRepository(file);
		try {
			const lunch = afterAll.find(lunchId);
			expect(lunch.amountsByDay).toEqual({});
			expect(forecastAmount(lunch, tuesday)).toBe(2000);
			expect(forecastAmount(lunch, nextTuesday)).toBe(2000);
		} finally {
			afterAll.close();
		}
	} finally {
		console.log = log;
		await rm(dir, { recursive: true, force: true });
	}
});

function firstWeekday(start: string, weekday: number): string {
	let date = start;
	for (let i = 0; i < 7; i++) {
		if (civilWeekday(date) === weekday) return date;
		date = shiftDate(date, 1);
	}
	throw new Error(`no weekday ${weekday}`);
}

function shiftDate(iso: string, days: number): string {
	const [year, month, day] = iso.split('-').map(Number);
	const shifted = new Date(Date.UTC(year, month - 1, day + days));
	const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
	const nextDay = String(shifted.getUTCDate()).padStart(2, '0');
	return `${shifted.getUTCFullYear()}-${nextMonth}-${nextDay}`;
}

function civilWeekday(iso: string): number {
	const [year, month, day] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
