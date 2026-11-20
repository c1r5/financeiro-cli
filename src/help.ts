export const HELP = `financeiro — ledger on SQLite

Usage:
  financeiro [--file <path>] <command>

Commands:
  account open --type checking|savings --name <name> --balance <cents> [--linked <id>] [--category reserve|goal]
  balance
  post --type income|expense|transfer --amount <cents> --date YYYY-MM-DD --description <text> --account <id> [--to <id>] [--category <name>]
  list [--month <n>] [--year <n>] [--type income|expense|transfer] [--text <query>]
  remove <id>

Amounts are integer cents. The default file is ./financeiro.sqlite.`;
