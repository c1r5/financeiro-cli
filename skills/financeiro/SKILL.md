---
name: financeiro
description: >
  Opera o razão local com o binário financeiro. Use quando a pessoa pedir saldo,
  lançamento, conta, cartão, recorrência, previsão, projeção, divisão ou dívida.
---

# financeiro

O binário é `financeiro` e fica no `PATH`. A instalação e a ordem de leitura estão em `README.md`. Cada pasta em `src/` tem o README das operações daquele módulo. Defina `FINANCEIRO_FILE` com o caminho do SQLite. Cada chamada leva `--json` e `--file`, ou herda `FINANCEIRO_FILE`. Sem os dois, o CLI grava `./financeiro.sqlite` no diretório em que o processo abriu.

Valor é centavo inteiro. R$ 10,50 entra como `1050`. A categoria vem de `financeiro category list --json`. Um nome que não está nessa lista falha na escrita.

Antes de criar ou alterar um registro, busque o id com `account list`, `card list`, `forecast list` ou `recurring list`. `recurring list --month YYYY-MM` mostra só o pendente daquele mês.

Leitura segue sem pedir confirmação: `balance`, `list`, as listas acima, `category list`, `projection show`, `division show`, `debt list`, `debt cost`, `card invoice`, `card summary`, `settings show`.

`post`, `remove`, `card pay`, `recurring pay`, `forecast pay` e `settings set` rodam depois que a pessoa confirma o valor em centavos e a conta. Num comando que cria registro, mande `--idempotency-key`. A mesma chave no mesmo comando e no mesmo arquivo devolve o primeiro resultado e não grava de novo.

A assinatura de cada comando é a resposta de `financeiro --help --json`.
