export function recordLines(records: Array<Record<string, unknown>>): string[] {
	const lines: string[] = [];
	records.forEach((record, index) => {
		if (index > 0) lines.push('');
		for (const [key, value] of Object.entries(record)) {
			if (value === undefined || value === null) continue;
			const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
			lines.push(`${key} ${rendered}`);
		}
	});
	return lines;
}
