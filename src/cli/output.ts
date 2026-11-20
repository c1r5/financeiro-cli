export type Reply = (lines: string[], data: unknown) => void;

export function present(json: boolean, lines: string[], data: unknown): void {
	if (json) {
		console.log(JSON.stringify({ ok: true, data }));
		return;
	}
	for (const line of lines) console.log(line);
}

export function fail(json: boolean, error: unknown): number {
	const message = error instanceof Error ? error.message : 'unknown error';
	if (json) {
		console.log(JSON.stringify({ ok: false, error: { code: errorCode(message), message } }));
		return 1;
	}
	console.error(message);
	return 1;
}

export function errorCode(message: string): string {
	if (message === 'idempotency_conflict') return 'idempotency_conflict';
	if (message.startsWith('missing value for ')) return 'missing_value';
	if (message.startsWith('missing ')) return 'missing_flag';
	if (
		/^unknown (command|card command|forecast command|projection command|division command|debt command|recurring command)\b/.test(
			message
		)
	) {
		return 'unknown_command';
	}
	if (/^unknown (card|forecast|recurring): /.test(message)) return 'not_found';
	if (
		message.startsWith('unknown ') ||
		message.startsWith('invalid ') ||
		message.startsWith('use either ') ||
		message.startsWith('no occurrence') ||
		message.includes('only for')
	) {
		return 'invalid_value';
	}
	return 'unknown_error';
}

export function takeBoolean(args: string[], name: string): boolean {
	let found = false;
	for (let index = args.length - 1; index >= 0; index--) {
		if (args[index] !== name) continue;
		args.splice(index, 1);
		found = true;
	}
	return found;
}
