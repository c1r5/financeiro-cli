# src

Entrada do processo e a fronteira com o `financeiro-sdk`. O agente chama o binário. Estes arquivos explicam de onde saem o id, a data e o objeto que o CLI grava.

## Sumário

- `main.ts` lê `process.argv` a partir do terceiro item e encerra com o código de `run`.
- `help.ts` guarda o manual e recorta o uso de um comando.
- `model.ts` define os objetos em inglês que o SQLite devolve.
- `sdk.ts` traduz esses objetos para o SDK e devolve o resultado já em inglês.
- `system-clock.ts` fornece o instante ISO e a data civil local.
- `uuid-generator.ts` gera o id de cada registro novo.

## Operações

`main.ts` não interpreta flag. Toda a linha de comando passa por `src/cli/run.ts`.

`usage` em `help.ts` ignora `--help`, `-h`, `--json` e o par `--file`. Sem comando, devolve o manual inteiro. Com comando, devolve as linhas daquele comando. Comando desconhecido também devolve o manual inteiro, e a saída continua 0 porque a ajuda não executa nada.

`SystemClock.today()` é a data civil do fuso da máquina, no formato `YYYY-MM-DD`. `now()` é o instante usado em `createdAt`. Projeção, fatura e recorrência usam esse hoje. Não há flag para fixar a data.

`UuidGenerator` cria um id por registro. A chave de idempotência não substitui o id. Ela faz a segunda chamada devolver o id da primeira.

`src/sdk.ts` é o único ponto que importa `financeiro-sdk`. Conta vira `corrente` ou `poupanca` lá dentro. Lançamento vira `entrada`, `saida` ou `transferencia`. O CLI continua falando `checking`, `savings`, `income`, `expense` e `transfer`. Funções exportadas que os comandos usam: `openAccount`, `readBalances`, `postTransaction`, `listLedger`, `deleteTransaction`, `createCard`, `purchaseOnCard`, `installmentOnCard`, `invoiceBase`, `readInvoice`, `payInvoice`, `summarizeCard`, `createRecurring`, `pendingRecurrings`, `createForecast`, `projectBalance`, `divideIncome`, `listDebts`, `debtHorizons`, `checkSettings`.

O modelo em `model.ts` é o formato de `data` nas listas. Campo opcional ausente sai `null` no JSON de conta, previsão e recorrência.
