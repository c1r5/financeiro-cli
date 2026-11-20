# recurring

Compromisso que se repete todo mês. O agente distingue a ficha cadastrada do que ainda está pendente num mês.

## Sumário

- `recurring add` grava a ficha.
- `recurring list` sem mês lista as fichas.
- `recurring list --month YYYY-MM` lista o pendente daquele mês.
- `recurring pay` lança o mês. `recurring revert` desfaz esse lançamento.

## Operações

`RecurringRepository` persiste a ficha. O pagamento em si é um lançamento no razão, e o id dele fica em `paymentsByMonth`.

`recurring add` pede tipo `income` ou `expense`, nome, valor esperado em centavos, dia do mês, data de início `YYYY-MM-DD`, conta e categoria. `--until YYYY-MM-DD` encerra a série. `--card` amarra a ficha a um cartão. Sem cartão, o pagamento cai na conta.

A ficha em `recurring list` traz `id`, `name`, `category`, `type`, `expectedAmount`, `dueDay`, `startsOn`, `endsOn`, `accountId`, `cardId`, `active`, `statusByMonth`, `paymentsByMonth` e `createdAt`. `statusByMonth` usa `expected` ou `paid`.

`recurring list --month YYYY-MM` não devolve a ficha inteira. Devolve o que ainda está previsto naquele mês: `id`, `date`, `name` e `amount`. O mês fora de `YYYY-MM` falha com `invalid month`.

`recurring pay --id <id> --month YYYY-MM` lança a ocorrência. `--amount` substitui o valor esperado. `--account` troca a conta. `--card` lança como compra no cartão. Conta e cartão juntos falham com `use either --card or --account`. Sem os dois, vale o cartão da ficha, se houver, senão a conta da ficha. Mês sem ocorrência falha com `no occurrence in <mês>`. O id devolvido é o do lançamento. O status do mês passa a `paid`.

`recurring revert --id <id> --month YYYY-MM` apaga o lançamento guardado em `paymentsByMonth` para aquele mês, se houver, e devolve o status para `expected`. O JSON é o id da recorrência e o mês. Não aceita `--idempotency-key`.

Id desconhecido falha com `unknown recurring: <id>` e código `not_found`.
