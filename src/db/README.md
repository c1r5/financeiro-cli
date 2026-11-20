# db

Abre o SQLite e cria as tabelas que ainda não existem. O agente não chama este módulo. Ele escolhe o arquivo com `--file` ou `FINANCEIRO_FILE`, e o CLI abre o banco por aqui.

## Sumário

- `open.ts` cria a conexão e aplica `PRAGMA busy_timeout = 5000`.
- `schema.ts` cria as tabelas com `CREATE TABLE IF NOT EXISTS`.
- A primeira operação que abre o arquivo já deixa o esquema pronto.

## Operações

`openDatabase(file)` devolve a conexão. Conta, cartão, recorrência, previsão e configuração usam a mesma função, então qualquer uma delas espera o lock pelo mesmo prazo. O tempo vale por conexão. Não fica gravado no arquivo.

`ensureSchema` cria, se faltarem:

| Tabela | Conteúdo |
| --- | --- |
| `accounts` | Conta, saldo de abertura, vínculo e categoria `reserve` ou `goal` |
| `transactions` | Lançamento, categoria, contas, cartão, fatura e parcela |
| `cards` | Nome, limite, dias de fechamento e vencimento, cor |
| `recurrings` | Recorrência, status por mês e id do pagamento por mês |
| `forecasts` | Previsão, dias pagos, valores por dia e datas excluídas |
| `idempotency_keys` | Chave, comando e o JSON de `data` da primeira execução |
| `settings` | Uma linha, `id = 1`, com moeda, divisão e margem |

Valor monetário nas colunas é inteiro, em centavos. Mapas como `status_by_month` ficam em texto JSON. Apagar o arquivo apaga o razão inteiro. Não há comando de migração: coluna nova entra no `CREATE TABLE` só para arquivo novo.
