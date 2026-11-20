import { checkSettings } from '../sdk';
import { SettingsRepository, type Settings } from '../settings/settings';

export function showSettings(file: string): Settings {
	const repository = new SettingsRepository(file);
	try {
		return repository.read();
	} finally {
		repository.close();
	}
}

export function formatSettings(settings: Settings): string[] {
	return [
		`currency ${settings.currency}`,
		`general ${settings.general}`,
		`debts ${settings.debts}`,
		`reserve ${settings.reserve}`,
		`margin ${settings.safetyMargin}`
	];
}

export function updateSettings(file: string, flags: string[]): Settings {
	const repository = new SettingsRepository(file);
	try {
		const current = repository.read();
		const next: Settings = {
			currency: option(flags, '--currency') ?? current.currency,
			general: numberOption(flags, '--general') ?? current.general,
			debts: numberOption(flags, '--debts') ?? current.debts,
			reserve: numberOption(flags, '--reserve') ?? current.reserve,
			safetyMargin: numberOption(flags, '--margin') ?? current.safetyMargin
		};
		const checked = checkSettings(next);
		repository.save(checked);
		return checked;
	} finally {
		repository.close();
	}
}

function option(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${name}`);
	return value;
}

function numberOption(args: string[], name: string): number | undefined {
	const value = option(args, name);
	if (value === undefined) return undefined;
	if (!/^-?\d+$/.test(value)) throw new Error(`invalid number: ${value}`);
	return Number(value);
}
