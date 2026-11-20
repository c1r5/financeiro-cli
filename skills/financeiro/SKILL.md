---
name: financeiro
description: >
  Opera o razão local com o binário financeiro. Use quando a pessoa pedir saldo,
  lançamento, conta, cartão, recorrência, previsão, projeção, divisão, dívida
  ou importação de um JSON.
---

# financeiro

O binário é `financeiro` e fica no `PATH`. A instalação e a ordem de leitura estão em `README.md`. Cada pasta em `src/` tem o README das operações daquele módulo. Defina `FINANCEIRO_FILE` com o caminho do SQLite. Cada chamada leva `--json` e `--file`, ou herda `FINANCEIRO_FILE`. Sem os dois, o CLI grava `./financeiro.sqlite` no diretório em que o processo abriu.

Valor é centavo inteiro. R$ 10,50 entra como `1050`. A categoria vem de `financeiro category list --json`. Um nome que não está nessa lista falha na escrita.

Antes de criar ou alterar um registro, busque o id com `account list`, `card list`, `forecast list` ou `recurring list`. `recurring list --month YYYY-MM` mostra só o pendente daquele mês.

Leitura segue sem pedir confirmação: `balance`, `list`, as listas acima, `category list`, `projection show`, `division show`, `debt list`, `debt cost`, `card invoice`, `card summary`, `settings show`, `import inspect` e `import plan`.

`import inspect --from <json>` lista o arquivo exportado e não abre o SQLite. Sem `--entity`, devolve a versão, as contagens, a configuração e os grupos de fatura. Com `--entity`, devolve as linhas e os ids. `import plan` compara o mesmo recorte com o destino. `--with-deps` acrescenta a conta, o cartão e o pagamento que a linha exige.

Dívidas recorrentes:

```text
financeiro import plan --from <json> --entity recurring --type expense --category divida --with-deps --json
```

Uma fatura:

```text
financeiro import plan --from <json> --entity invoice --card <id> --reference YYYY-MM --with-deps --json
```

`post`, `remove`, `card pay`, `recurring pay`, `forecast pay`, `settings set` e `import apply` rodam depois que a pessoa confirma o valor em centavos e a conta. Para o import, a confirmação é o plano: a pessoa vê as linhas `insert` e `dep` antes de `import apply`. A gravação copia os ids de origem. A mesma seleção, com o mesmo conteúdo, não duplica. `import` não usa `--idempotency-key`. Num outro comando que cria registro, mande `--idempotency-key`. A mesma chave no mesmo comando e no mesmo arquivo devolve o primeiro resultado e não grava de novo.

A assinatura de cada comando é a resposta de `financeiro --help --json`.
