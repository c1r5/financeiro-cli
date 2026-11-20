export const HELP = `financeiro — ledger on SQLite

Usage:
  financeiro [--file <path>] <command>

Commands:
  account open --type checking|savings --name <name> --balance <cents> [--linked <id>] [--category reserve|goal]
  balance
  post --type income|expense|transfer --amount <cents> --date YYYY-MM-DD --description <text> --account <id> [--to <id>] [--category <name>]
  list [--month <n>] [--year <n>] [--type income|expense|transfer] [--text <query>]
  remove <id>
  card open --name <name> --limit <cents> --closes <day> --due <day> --color <value>
  card base --card <id> --reference YYYY-MM --amount <cents>
  card purchase --card <id> --amount <cents> --date YYYY-MM-DD --description <text> --category <name>
  card installment --card <id> --amount <cents> --date YYYY-MM-DD --description <text> --category <name> --count <n>
  card invoice --card <id> --reference YYYY-MM
  card pay --card <id> --account <id> --amount <cents> --reference YYYY-MM --date YYYY-MM-DD
  card summary --card <id>
  recurring add --type income|expense --name <name> --amount <cents> --day <n> --start YYYY-MM-DD --account <id> --category <name> [--until YYYY-MM-DD] [--card <id>]
  recurring list --month YYYY-MM
  recurring pay --id <id> --month YYYY-MM [--amount <cents>] [--account <id>] [--card <id>]
  recurring revert --id <id> --month YYYY-MM
  forecast add --type income|expense --frequency once|monthly|daily --name <name> --amount <cents> --date YYYY-MM-DD --category <name> --account <id> [--until YYYY-MM-DD] [--weekdays 0,1,2,3,4,5,6]
  forecast exclude --id <id> --date YYYY-MM-DD
  forecast pay --id <id> --date YYYY-MM-DD [--account <id>]
  forecast edit --id <id> --date YYYY-MM-DD --amount <cents>
  forecast edit --id <id> --amount <cents> --all
  settings show
  settings set [--currency <code>] [--general <n>] [--debts <n>] [--reserve <n>] [--margin <cents>]

Amounts are integer cents. The default file is ./financeiro.sqlite.`;
