# cli

Superfície que o agente chama. `run` resolve o arquivo, tira `--json`, trata a ajuda e despacha o comando. O detalhe de cada domínio está no README da pasta que grava o dado.

## Sumário

- [Saída](#saída)
- [Conta, saldo e lançamento](#conta-saldo-e-lançamento)
- [Cartão](#cartão)
- [Recorrência](#recorrência)
- [Previsão](#previsão)
- [Projeção, divisão e dívida](#projeção-divisão-e-dívida)
- [Configuração](#configuração)

## Saída

`output.ts` monta o envelope. `vocabulary.ts` recusa tipo, frequência e categoria desconhecidos antes do cast para o SDK. `record.ts` formata as listas novas no modo texto.

Códigos de erro e a regra da chave estão no [README da raiz](../../README.md#chamada).

## Conta, saldo e lançamento

`account open` grava a conta e um lançamento de abertura, renda, com a descrição `Saldo inicial de <nome>`. O texto imprime o id da conta. O JSON é `{"id"}`. `--type` é `checking` ou `savings`. `--category` aqui é `reserve` ou `goal`, e liga a conta a um propósito. `--linked` guarda o id de outra conta.

`account list` não grava. O JSON é `{"accounts":[...]}` com `id`, `type`, `name`, `description`, `openingBalance`, `active`, `linkedAccountId` e `category`.

`balance` lê o saldo de hoje. O JSON é `{"available","savings","total"}`. O texto são as três linhas `available`, `savings` e `total`.

`post` grava um lançamento. O JSON é `{"id"}`. `--type` é `income`, `expense` ou `transfer`. Transferência pede `--to`. `--category` omitido vira `outros`. Data `YYYY-MM-DD`, valor em centavos.

`list` lê. O JSON é `{"transactions":[...]}` com os campos de `Transaction` em `src/model.ts`: id, data, descrição, tipo, valor, categoria, contas, cartão, referência de fatura, parcela e `createdAt`. `--month` e `--year` filtram juntos. `--type` e `--text` filtram sozinhos. O texto é `id data tipo valor descrição`, e a descrição ocupa o resto da linha.

`remove <id>` apaga o lançamento com esse id. O JSON é `{"id"}`. O texto não imprime nada. O comando não verifica se o id existia. Não aceita `--idempotency-key`.

## Cartão

O contrato de cada ação está em [cards](../cards/README.md). Os comandos:

- `card list` lê. JSON `{"cards":[...]}`.
- `card open` cria. JSON `{"id"}`.
- `card base` grava o valor base da fatura `YYYY-MM`. JSON `{"id"}` do lançamento.
- `card purchase` grava uma compra. JSON `{"id"}`.
- `card installment` grava as parcelas. JSON `{"parcels":[{"id","amount"}]}`. O texto é uma linha `id valor` por parcela.
- `card invoice` lê a fatura. JSON com `reference`, `balance`, `closed`, `due` e, quando houver, `expected`.
- `card pay` grava o pagamento. JSON `{"id","type"}`. `type` é `invoice-payment`.
- `card summary` lê. JSON `{"used","available","reference"}`.

## Recorrência

O estado gravado está em [recurring](../recurring/README.md).

- `recurring add` cria. JSON `{"id"}`.
- `recurring list` sem `--month` lista as recorrências cadastradas. JSON `{"recurrings":[...]}`.
- `recurring list --month YYYY-MM` lista só o pendente daquele mês. JSON `{"month","pending":[{"id","date","name","amount"}]}`. O texto continua `id data nome valor`.
- `recurring pay` grava o pagamento do mês e devolve o id do lançamento. JSON `{"id"}`.
- `recurring revert` desfaz o pagamento do mês. JSON `{"id","month"}`. O texto não imprime nada.

## Previsão

O estado gravado está em [forecasts](../forecasts/README.md).

- `forecast list` lê. JSON `{"forecasts":[...]}`.
- `forecast add` cria. JSON `{"id"}`.
- `forecast exclude` tira uma data da série. JSON `{"id"}` da previsão. O texto não imprime nada.
- `forecast pay` paga um dia de uma série `daily` e devolve o id do lançamento. JSON `{"id"}`.
- `forecast edit --date YYYY-MM-DD --amount <cents>` altera o valor de um dia de série `daily`.
- `forecast edit --amount <cents> --all` altera o valor da série inteira.
- Os dois edits devolvem `{"id"}` e não imprimem texto. `--date` junto de `--all` falha.

## Projeção, divisão e dívida

`projection show --days <n>` não grava. Lê saldo, lançamentos, recorrências, cartões, previsões e a margem. O JSON é `{"days":[{"date","balance","events"}],"dailyLimit"}`. No texto, cada dia é `data saldo eventos`, com `-` quando não há evento, e a última linha é `daily-limit N`.

`division show --month <n> --year <n>` não grava. `--month` vai de 1 a 12. O JSON é `{"general","debts","reserve","income","saved"}`.

`debt list --month <n> --year <n>` não grava. O JSON é `{"debts":[{"kind","date","amount","description","reference"}]}`. `kind` é `payable` ou `paid`. Use `--json`: no texto, descrição e referência ficam na mesma linha separadas por espaço.

`debt cost --month <n> --year <n> --horizons <lista>` não grava. A lista é de inteiros positivos separados por vírgula, como `1,3,12`. O JSON é `{"horizons":[{"months","cost","bucket","surplus"}]}`.

## Configuração

`settings show` e `settings set` estão em [settings](../settings/README.md). O JSON dos dois é `{"currency","general","debts","reserve","margin"}`. `settings set` não aceita `--idempotency-key`.
