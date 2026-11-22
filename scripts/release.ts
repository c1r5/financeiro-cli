import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export interface Commit {
	subject: string;
	body: string;
}

export interface PlannedRelease {
	version: string;
	section: string;
}

type Group = 'Alterado' | 'Adicionado' | 'Corrigido' | 'Documentação';

const SUBJECT = /^(feat|fix|docs|chore|ci|test)(\([^)]+\))?(!)?:\s*(.+)$/;
const ORDER: Group[] = ['Alterado', 'Adicionado', 'Corrigido', 'Documentação'];

export function planRelease(version: string, commits: Commit[]): PlannedRelease | null {
	const groups = new Map<Group, string[]>(ORDER.map((name) => [name, []]));
	let breaking = false;
	let added = false;
	let fixed = false;
	for (const commit of commits) {
		const parsed = SUBJECT.exec(commit.subject.trim());
		if (!parsed) continue;
		const kind = parsed[1];
		const bang = parsed[3] === '!';
		const summary = parsed[4].trim();
		if (summary === '') continue;
		const breaks = bang || commit.body.includes('BREAKING CHANGE');
		if (kind === 'chore' || kind === 'ci' || kind === 'test') {
			if (!breaks) continue;
		}
		if (breaks) {
			breaking = true;
			groups.get('Alterado')?.push(summary);
			continue;
		}
		if (kind === 'feat') {
			added = true;
			groups.get('Adicionado')?.push(summary);
		} else if (kind === 'fix') {
			fixed = true;
			groups.get('Corrigido')?.push(summary);
		} else if (kind === 'docs') {
			groups.get('Documentação')?.push(summary);
		}
	}
	const next = bump(version, breaking, added, fixed);
	if (!next) return null;
	return { version: next, section: render(next, groups) };
}

export function applyRelease(
	files: { packageJson: string; changelog: string; readme: string },
	current: string,
	planned: PlannedRelease
): { packageJson: string; changelog: string; readme: string } {
	return {
		packageJson: files.packageJson.replace(/"version": "[^"]+"/, `"version": "${planned.version}"`),
		changelog: insertSection(files.changelog, planned.section),
		readme: files.readme.replaceAll(`v${current}`, `v${planned.version}`)
	};
}

export function changelogSection(changelog: string, version: string): string {
	const lines = changelog.split('\n');
	const start = lines.findIndex((line) => line === `## ${version}`);
	if (start === -1) throw new Error(`missing changelog section: ${version}`);
	const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
	const end = next === -1 ? lines.length : next;
	return `${lines.slice(start, end).join('\n').trimEnd()}\n`;
}

function bump(version: string, breaking: boolean, added: boolean, fixed: boolean): string | null {
	const parts = version.split('.').map((part) => Number(part));
	if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
		throw new Error(`invalid version: ${version}`);
	}
	const [major, minor, patch] = parts;
	if (breaking) return `${major + 1}.0.0`;
	if (added) return `${major}.${minor + 1}.0`;
	if (fixed) return `${major}.${minor}.${patch + 1}`;
	return null;
}

function render(version: string, groups: Map<Group, string[]>): string {
	const lines = [`## ${version}`];
	for (const name of ORDER) {
		const items = groups.get(name) ?? [];
		if (items.length === 0) continue;
		lines.push('', `### ${name}`, '', ...items.map((item) => `- ${item}`));
	}
	return `${lines.join('\n')}\n`;
}

function insertSection(changelog: string, section: string): string {
	const header = '# Changelog\n';
	if (!changelog.startsWith(header)) throw new Error('invalid changelog');
	const rest = changelog.slice(header.length).replace(/^\n/, '');
	return `${header}\n${section.trimEnd()}\n\n${rest}`;
}

function decide(): { action: 'publish' | 'pr' | 'skip'; version?: string; notes?: string } {
	const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
	const tag = `v${version}`;
	if (!tagExists(tag)) {
		return {
			action: 'publish',
			version,
			notes: changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version)
		};
	}
	const planned = planRelease(version, commitsSince(tag));
	if (!planned) return { action: 'skip' };
	return { action: 'pr', version: planned.version, notes: planned.section };
}

function tagExists(tag: string): boolean {
	const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], {
		encoding: 'utf8'
	});
	return result.status === 0;
}

function commitsSince(tag: string): Commit[] {
	const result = spawnSync(
		'git',
		['log', `${tag}..HEAD`, '--reverse', '--pretty=format:%s%x1f%b%x1e'],
		{ encoding: 'utf8' }
	);
	if (result.status !== 0) throw new Error(result.stderr || 'git log');
	return result.stdout
		.split('\x1e')
		.map((block) => block.trim())
		.filter((block) => block !== '')
		.map((block) => {
			const [subject, body] = block.split('\x1f');
			return { subject: subject ?? '', body: body ?? '' };
		});
}

function writeRelease(): void {
	const decision = decide();
	if (decision.action !== 'pr' || !decision.version || !decision.notes) return;
	const current = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
	const next = applyRelease(
		{
			packageJson: readFileSync('package.json', 'utf8'),
			changelog: readFileSync('CHANGELOG.md', 'utf8'),
			readme: readFileSync('README.md', 'utf8')
		},
		current,
		{ version: decision.version, section: decision.notes }
	);
	writeFileSync('package.json', next.packageJson);
	writeFileSync('CHANGELOG.md', next.changelog);
	writeFileSync('README.md', next.readme);
}

if (import.meta.main) {
	const command = process.argv[2] ?? 'plan';
	if (command === 'write') {
		writeRelease();
	} else if (command === 'plan') {
		console.log(JSON.stringify(decide()));
	} else {
		throw new Error(`invalid release command: ${command}`);
	}
}
