# settings

Moeda, divisão da renda e margem de segurança. O agente lê com `settings show` antes de `division show` e de `projection show`, porque os dois usam estes números.

## Sumário

- Sem linha gravada, a leitura devolve o padrão.
- `settings set` altera só as flags enviadas.
- `general`, `debts` e `reserve` precisam somar 100.
- `margin` é centavo e entra na projeção.

## Operações

O padrão, quando a tabela ainda não tem a linha `id = 1`, é moeda `BRL`, divisão `70`, `20` e `10`, margem `10000` centavos.

`settings show` não grava. O texto sai em cinco linhas: `currency`, `general`, `debts`, `reserve`, `margin`. O JSON usa os mesmos nomes. No objeto interno do código a margem se chama `safetyMargin`. Na resposta do comando o nome é `margin`.

`settings set` lê o valor atual e substitui o que foi passado. Flag omitida permanece. `--currency` é o código gravado como texto. `--general`, `--debts` e `--reserve` são inteiros. `--margin` é centavo. Depois da troca, a soma de `general`, `debts` e `reserve` tem de ser 100. Soma diferente falha com a mensagem `divisao_invalida` e código `unknown_error`, e o valor anterior continua gravado.

`division show` reparte a renda do mês nesses três percentuais e ainda devolve `income` e `saved`. `projection show` desconta `margin` ao calcular `dailyLimit`.

`settings set` não aceita `--idempotency-key`. Confirme moeda, percentuais e margem com a pessoa antes de gravar.
