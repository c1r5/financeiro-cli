# forecasts

Previsão avulsa, mensal ou diária. O agente lista a ficha antes de excluir, editar ou pagar.

## Sumário

- `forecast add` grava a série.
- `forecast list` lê as fichas.
- `forecast exclude` tira uma data.
- `forecast edit` muda um dia ou a série inteira.
- `forecast pay` só paga série `daily`, e gera um lançamento.

## Operações

`ForecastRepository` guarda a ficha. O pagamento vira lançamento no razão, e o id fica em `paymentsByDay`.

`forecast add` pede tipo `income` ou `expense`, frequência `once`, `monthly` ou `daily`, nome, valor em centavos, data `YYYY-MM-DD`, categoria e conta. `--until` limita o fim. `--weekdays` é obrigatório quando a frequência é `daily`: inteiros de 0 a 6 separados por vírgula. Sem dias, a série diária falha com `missing --weekdays`.

`forecast list` devolve `id`, `name`, `amount`, `type`, `frequency`, `weekdays`, `endsOn`, `statusByDay`, `paymentsByDay`, `amountsByDay`, `excluded`, `date`, `category` e `accountId`. `excluded` são as datas tiradas da série. `amountsByDay` guarda o valor de um dia que foi editado à parte.

`forecast exclude --id <id> --date YYYY-MM-DD` acrescenta a data a `excluded`. Não apaga a ficha.

`forecast edit --id <id> --date YYYY-MM-DD --amount <cents>` grava o valor daquele dia. Só vale para frequência `daily`. `forecast edit --id <id> --amount <cents> --all` troca o valor base da série, em qualquer frequência. `--date` e `--all` juntos falham com `use either --date or --all`.

`forecast pay --id <id> --date YYYY-MM-DD` lança o valor daquele dia, o da série ou o de `amountsByDay`, e marca o dia como pago. Só frequência `daily`. Outra frequência falha com `forecast pay is only for a daily series`. `--account` troca a conta do lançamento. O id devolvido é o do lançamento.

Id desconhecido falha com `unknown forecast: <id>` e código `not_found`.
