export const HELP = `financeiro — ledger on SQLite

Usage:
  financeiro [--file <path>] [--json] <command>

Commands:
  account open --type checking|savings --name <name> --balance <cents> [--linked <id>] [--category reserve|goal]
  account list
  balance
  category list
  post --type income|expense|transfer --amount <cents> --date YYYY-MM-DD --description <text> --account <id> [--to <id>] [--category <name>]
  list [--month <n>] [--year <n>] [--type income|expense|transfer] [--text <query>]
  remove <id>
  card list
  card open --name <name> --limit <cents> --closes <day> --due <day> --color <value>
  card base --card <id> --reference YYYY-MM --amount <cents>
  card purchase --card <id> --amount <cents> --date YYYY-MM-DD --description <text> --category <name>
  card installment --card <id> --amount <cents> --date YYYY-MM-DD --description <text> --category <name> --count <n>
  card invoice --card <id> --reference YYYY-MM
  card pay --card <id> --account <id> --amount <cents> --reference YYYY-MM --date YYYY-MM-DD
  card summary --card <id>
  recurring add --type income|expense --name <name> --amount <cents> --day <n> --start YYYY-MM-DD --account <id> --category <name> [--until YYYY-MM-DD] [--card <id>]
  recurring list [--month YYYY-MM]
  recurring pay --id <id> --month YYYY-MM [--amount <cents>] [--account <id>] [--card <id>]
  recurring revert --id <id> --month YYYY-MM
  forecast list
  forecast add --type income|expense --frequency once|monthly|daily --name <name> --amount <cents> --date YYYY-MM-DD --category <name> --account <id> [--until YYYY-MM-DD] [--weekdays 0,1,2,3,4,5,6]
  forecast exclude --id <id> --date YYYY-MM-DD
  forecast pay --id <id> --date YYYY-MM-DD [--account <id>]
  forecast edit --id <id> --date YYYY-MM-DD --amount <cents>
  forecast edit --id <id> --amount <cents> --all
  projection show --days <n>
  division show --month <n> --year <n>
  debt list --month <n> --year <n>
  debt cost --month <n> --year <n> --horizons <list>
  settings show
  settings set [--currency <code>] [--general <n>] [--debts <n>] [--reserve <n>] [--margin <cents>]
  import inspect --from <path> [--entity account|card|transaction|invoice|recurring|forecast|settings] [--id <id>] [--name <text>] [--category <name>] [--type <type>] [--card <id>] [--account <id>] [--reference YYYY-MM] [--active true|false] [--month YYYY-MM]
  import plan --from <path> --entity account|card|transaction|invoice|recurring|forecast|settings [--id <id>] [--name <text>] [--category <name>] [--type <type>] [--card <id>] [--account <id>] [--reference YYYY-MM] [--active true|false] [--month YYYY-MM] [--with-deps] [--on-account <id>]
  import apply --from <path> --entity account|card|transaction|invoice|recurring|forecast|settings [--id <id>] [--name <text>] [--category <name>] [--type <type>] [--card <id>] [--account <id>] [--reference YYYY-MM] [--active true|false] [--month YYYY-MM] [--with-deps] [--on-account <id>] [--allow-dangling]

Amounts are integer cents. The file is --file, then FINANCEIRO_FILE, then ./financeiro.sqlite.
Create commands accept --idempotency-key. The same key and command return the first result.`;

export function usage(args: string[]): string {
	const tokens: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const token = args[index];
		if (token === '--help' || token === '-h' || token === '--json') continue;
		if (token === '--file') {
			index++;
			continue;
		}
		tokens.push(token);
	}
	const command = tokens[0];
	if (!command) return HELP;
	const action = tokens[1];
	const commands = HELP.split('\n').filter((line) => line.startsWith('  '));
	const matches = commands.filter((line) => {
		const text = line.trim();
		if (action && !action.startsWith('--')) return text.startsWith(`${command} ${action}`);
		return text === command || text.startsWith(`${command} `);
	});
	if (matches.length === 0) return HELP;
	return matches.join('\n');
}
