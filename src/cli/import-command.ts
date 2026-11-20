import { recordLines } from './record';
import type { Reply } from './output';
import { readImport } from '../import/source';
import {
	assertFilterValues,
	importEntity,
	invoiceGroups,
	rejectUnusedFilters,
	selectEntity,
	settingsRow,
	type ImportQuery
} from '../import/select';

export async function executeImport(args: string[], reply: Reply): Promise<void> {
	const action = args[1];
	if (action === 'inspect') {
		inspect(args.slice(2), reply);
		return;
	}
	throw new Error(`unknown command: import${action ? ` ${action}` : ''}`);
}

function inspect(flags: string[], reply: Reply): void {
	const from = required(flags, '--from');
	const present = flagNames(flags);
	for (const name of ['--with-deps', '--allow-dangling', '--on-account']) {
		if (present.includes(name)) throw new Error(`invalid import filter: ${name}`);
	}
	const source = readImport(from);
	const entityFlag = option(flags, '--entity');
	if (!entityFlag) {
		const extra = flagNames(flags);
		if (extra.length > 0) throw new Error(`invalid import filter: ${extra[0]}`);
		const invoices = invoiceGroups(source.transactions);
		const lines = [
			`version ${source.version}`,
			`accounts ${source.accounts.length}`,
			`cards ${source.cards.length}`,
			`transactions ${source.transactions.length}`,
			`recurrings ${source.recurrings.length}`,
			`forecasts ${source.forecasts.length}`,
			...recordLines([settingsRow(source)]),
			...recordLines(invoices.map((invoice) => ({ ...invoice }))),
			...source.ignored.map((key) => `ignored ${key}`)
		];
		reply(lines, {
			version: source.version,
			counts: {
				accounts: source.accounts.length,
				cards: source.cards.length,
				transactions: source.transactions.length,
				recurrings: source.recurrings.length,
				forecasts: source.forecasts.length
			},
			settings: settingsRow(source),
			invoices,
			ignored: source.ignored
		});
		return;
	}
	const entity = importEntity(entityFlag);
	const selected = flagNames(flags);
	const query = queryFrom(flags);
	rejectUnusedFilters(entity, selected);
	assertFilterValues(entity, query);
	const rows = selectEntity(source, entity, query);
	reply(recordLines(rows as Array<Record<string, unknown>>), { rows });
}

function queryFrom(flags: string[]): ImportQuery {
	const ids: string[] = [];
	let name: string | undefined;
	let category: string | undefined;
	let type: string | undefined;
	let card: string | undefined;
	let account: string | undefined;
	let reference: string | undefined;
	let active: boolean | undefined;
	let month: string | undefined;
	while (flags.length > 0) {
		const nameFlag = flags[0];
		if (!nameFlag.startsWith('--')) throw new Error(`invalid import filter: ${nameFlag}`);
		const value = option(flags, nameFlag);
		if (value === undefined) throw new Error(`missing ${nameFlag}`);
		if (nameFlag === '--id') ids.push(value);
		else if (nameFlag === '--name') name = value;
		else if (nameFlag === '--category') category = value;
		else if (nameFlag === '--type') type = value;
		else if (nameFlag === '--card') card = value;
		else if (nameFlag === '--account') account = value;
		else if (nameFlag === '--reference') {
			if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('invalid import filter: --reference');
			reference = value;
		} else if (nameFlag === '--active') {
			if (value !== 'true' && value !== 'false') throw new Error('invalid import filter: --active');
			active = value === 'true';
		} else if (nameFlag === '--month') {
			if (!/^\d{4}-\d{2}$/.test(value)) throw new Error('invalid import filter: --month');
			month = value;
		} else throw new Error(`invalid import filter: ${nameFlag}`);
	}
	return { ids, name, category, type, card, account, reference, active, month };
}

function flagNames(flags: string[]): string[] {
	const names: string[] = [];
	for (let index = 0; index < flags.length; index++) {
		const token = flags[index];
		if (!token.startsWith('--')) continue;
		names.push(token);
		const next = flags[index + 1];
		if (next !== undefined && !next.startsWith('--')) index++;
	}
	return names;
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
	args.splice(index, 2);
	return value;
}

function required(args: string[], name: string): string {
	const value = option(args, name);
	if (value === undefined) throw new Error(`missing ${name}`);
	return value;
}
