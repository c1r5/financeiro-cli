#!/usr/bin/env bun
import { HELP } from './help';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
	console.log(HELP);
	process.exit(0);
}

console.error(`unknown command: ${args[0]}`);
process.exit(1);
