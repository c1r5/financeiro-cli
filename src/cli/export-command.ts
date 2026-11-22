import { exportLedger } from '../import/export';
import type { Reply } from './output';
import { takeBoolean } from './output';

export async function executeExport(args: string[], file: string, reply: Reply): Promise<void> {
	const flags = args.slice(1);
	const force = takeBoolean(flags, '--force');
	const target = required(flags, '--to');
	if (flags.length > 0) throw new Error(`invalid export filter: ${flags[0]}`);
	const result = await exportLedger(file, target, force);
	reply(
		[
			`path ${result.path}`,
			`version ${result.version}`,
			`accounts ${result.counts.accounts}`,
			`cards ${result.counts.cards}`,
			`transactions ${result.counts.transactions}`,
			`recurrings ${result.counts.recurrings}`,
			`forecasts ${result.counts.forecasts}`
		],
		result
	);
}

function required(args: string[], name: string): string {
	const index = args.indexOf(name);
	if (index === -1) throw new Error(`missing ${name}`);
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
	args.splice(index, 2);
	return value;
}
