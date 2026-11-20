# cards

Cartão e o que a fatura soma. O agente chama os comandos `card`. A lista de campos e o efeito de cada um estão abaixo.

## Sumário

- `card list` e `card open` tratam do cadastro.
- `card base`, `card purchase` e `card installment` gravam lançamentos na fatura.
- `card invoice` e `card summary` só leem.
- `card pay` tira o valor da conta informada.

## Operações

`CardRepository` guarda o cadastro na tabela `cards`. Compra, base, parcela e pagamento são lançamentos no razão, com `cardId`.

`card open` pede `--name`, `--limit` em centavos, `--closes` e `--due` como dia do mês, e `--color`. A cor é a string recebida. O JSON devolve `id`, `name`, `limit`, `closingDay`, `dueDay`, `color`, `active` e `createdAt` quando a lista é pedida. `card list` não exige `--card`.

`card base --reference YYYY-MM --amount <cents>` grava o valor base daquela fatura.

`card purchase` grava uma compra à vista. Data, descrição, valor e categoria são obrigatórios. A categoria segue o catálogo de `category list`.

`card installment` reparte o valor em `--count` parcelas. Cada parcela é um lançamento. O resto dos centavos fica na última. Um valor 100 em 3 vezes gera 33, 33 e 34. O JSON lista `id` e `amount` de cada parcela. As parcelas compartilham um grupo.

`card invoice --reference YYYY-MM` lê a fatura. `balance` é o que falta. `closed` indica se o dia de fechamento dessa referência já passou em relação a hoje. `due` é o vencimento. `expected` aparece quando o cálculo tem um valor previsto além do lançado.

`card summary` lê o uso aberto: `used`, `available` (limite menos o uso) e `reference` da fatura corrente.

`card pay` grava um lançamento `invoice-payment` na conta `--account`, no valor e na data informados, amarrado à referência. A conta precisa existir. O id devolvido é o do lançamento, não o do cartão.

Id desconhecido em `--card` falha com `unknown card: <id>` e código `not_found`.
