import { expect, test } from 'bun:test';
import { applyRelease, planRelease } from './release';

test('export commits since 0.0.3 plan 0.1.0 and the changelog section', () => {
	const planned = planRelease('0.0.3', [
		{ subject: 'feat: exporta o razão no JSON do frontend', body: '' },
		{ subject: 'docs: descreve o export na skill', body: '' }
	]);
	expect(planned).not.toBeNull();
	expect(planned?.version).toBe('0.1.0');
	expect(planned?.section).toBe(
		`## 0.1.0

### Adicionado

- exporta o razão no JSON do frontend

### Documentação

- descreve o export na skill
`
	);

	const files = applyRelease(
		{
			packageJson: '{\n\t"version": "0.0.3"\n}\n',
			changelog: '# Changelog\n\n## 0.0.3\n\n## 0.0.2\n\n## 0.0.1\n',
			readme: 'A release `v0.0.3` publica\nhttps://example/v0.0.3/financeiro-linux-x64\nhttps://example/v0.0.3/financeiro-linux-x64.sha256\n'
		},
		'0.0.3',
		planned ?? { version: '', section: '' }
	);
	expect(files.packageJson).toContain('"version": "0.1.0"');
	expect(files.changelog).toBe(
		`# Changelog

## 0.1.0

### Adicionado

- exporta o razão no JSON do frontend

### Documentação

- descreve o export na skill

## 0.0.3

## 0.0.2

## 0.0.1
`
	);
	expect(files.readme).toBe(
		'A release `v0.1.0` publica\nhttps://example/v0.1.0/financeiro-linux-x64\nhttps://example/v0.1.0/financeiro-linux-x64.sha256\n'
	);
});
