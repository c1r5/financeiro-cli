# ledger

Contas e lançamentos. O agente opera por `account`, `balance`, `post`, `list` e `remove`, descritos em [cli](../cli/README.md#conta-saldo-e-lançamento).

## Sumário

- A conta nasce com saldo de abertura e um lançamento de renda.
- O saldo de `balance` é calculado. Não há coluna de saldo atual.
- `remove` apaga um lançamento pelo id e não confere se ele existia.
- A chave de idempotência mora neste mesmo arquivo, na tabela `idempotency_keys`.

## Operações

`SqliteLedgerRepository` abre o arquivo, garante o esquema e fecha no fim do comando.

`saveAccount` insere a conta. `account open` também insere o lançamento `Saldo inicial de <nome>`, do tipo `income`, na data de hoje, com o valor de `--balance`.

`listAccounts` devolve as contas na ordem de criação e id. É o que `account list` imprime.

`insertTransaction` grava um lançamento. Entra por `post`, pela abertura da conta, pela compra e pela parcela do cartão, pelo pagamento de fatura, pelo pagamento de recorrência e pelo pagamento de previsão diária.

`listTransactions` lê tudo, na ordem de criação. `list` aplica mês, ano, tipo e texto por cima disso, no SDK.

`deleteTransaction` executa `DELETE` pelo id. `remove` e `recurring revert` usam esse método. Um id ausente não gera erro.

`findIdempotency` e `saveIdempotency` leem e gravam a chave. O comando guardado é o caminho, como `post` ou `card purchase`. `result` é o objeto `data`, sem o envelope `ok`. A repetição não chama o repositório de novo para criar registro.

Campos do lançamento no JSON de `list`: `id`, `date`, `description`, `type`, `amount`, `category`, `accountId`, `destinationAccountId`, `cardId`, `invoiceReference`, `installment` (`current` e `total`), `installmentGroupId`, `createdAt`. Ausente vira `null`.

`type` no CLI é `income`, `expense`, `transfer`, `invoice-payment` ou `card-expense`. O pagamento de fatura e a compra no cartão usam os dois últimos.
