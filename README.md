# financeiro-cli

Razão e planejamento num arquivo SQLite, chamados pelo binário `financeiro`. O agente instala o binário, fixa o arquivo, lê com `--json` e só grava depois de obter o id e de a pessoa confirmar o valor.

## Sumário

- [Instalação](#instalação) coloca o binário no `PATH`.
- [Arquivo](#arquivo) escolhe o SQLite e o tempo de espera do lock.
- [Chamada](#chamada) cobre `--json`, ajuda, centavos, categoria e idempotência.
- [Ordem para o agente](#ordem-para-o-agente) vai da leitura até a escrita.
- [Módulos](#módulos) aponta o README de cada pasta em `src/`.
- [Verificação](#verificação) roda teste e typecheck.

A skill do bot está em `skills/financeiro/SKILL.md`. A assinatura viva dos comandos é `financeiro --help --json`.

## Instalação

A release `v0.0.3` publica o binário Linux x64 e o checksum. O binário não precisa de Bun nem do SDK.

```bash
curl -L -o financeiro-linux-x64 \
  https://github.com/c1r5/financeiro-cli/releases/download/v0.0.3/financeiro-linux-x64
curl -L -o financeiro-linux-x64.sha256 \
  https://github.com/c1r5/financeiro-cli/releases/download/v0.0.3/financeiro-linux-x64.sha256
sha256sum -c financeiro-linux-x64.sha256
install -m 755 financeiro-linux-x64 "$HOME/.local/bin/financeiro"
```

`$HOME/.local/bin` precisa estar no `PATH`. Confira com `financeiro --help`. A ajuda sai 0 e não cria arquivo.

Para desenvolver a partir do código, use Bun `1.4.4`. `bun install` clona `financeiro-sdk` no commit pinado em `package.json`, por SSH. `bun link` publica o comando `financeiro`, que executa `src/main.ts`.

## Arquivo

A resolução é `--file`, depois `FINANCEIRO_FILE`, depois `./financeiro.sqlite`. Variável vazia cai no padrão. O caminho padrão segue o diretório em que o processo abriu, então o agente exporta `FINANCEIRO_FILE` com caminho absoluto ou passa `--file` em toda chamada.

O mesmo arquivo guarda contas, lançamentos, cartões, recorrências, previsões, configuração e chaves de idempotência. A primeira abertura cria as tabelas. Cada conexão espera o lock por 5000 ms (`PRAGMA busy_timeout`).

## Chamada

```text
financeiro [--file <path>] [--json] <command>
```

`--json` escreve um único objeto no stdout e deixa o stderr vazio. Sucesso sai 0. Falha sai 1.

```json
{"ok":true,"data":{}}
{"ok":false,"error":{"code":"missing_flag","message":"missing --amount"}}
```

Os códigos são `missing_flag`, `missing_value`, `unknown_command`, `invalid_value`, `not_found`, `idempotency_conflict` e `unknown_error`. A frase original fica em `message`. `divisao_invalida`, vinda da configuração, cai em `unknown_error`.

Sem `--json`, os comandos que já existiam imprimem o texto de sempre. Listas novas saem em bloco, um campo por linha (`id ...`, `name ...`), com uma linha em branco entre registros. Descrição com espaço quebra o texto de `list` e de `debt list`. O agente usa `--json`.

`--help` e `-h` mostram o uso do comando em que aparecem e saem 0, sem abrir o banco. `financeiro post --help` mostra a linha de `post`. `financeiro --help` mostra o manual. Com `--json`, o texto vai em `data.usage`.

Valor é centavo inteiro. R$ 10,50 é `1050`. Decimal é rejeitado.

A categoria de lançamento, recorrência, previsão e compra no cartão sai de `category list`. Os valores são `salario`, `freelance`, `rendimentos`, `alimentacao`, `mercado`, `farmacia`, `saude`, `transporte`, `moradia`, `contas`, `assinaturas`, `lazer`, `educacao`, `investimento`, `poupanca`, `divida`, `impostos`, `outros`, `transferencia` e `cartao-credito`. Fora dessa lista a escrita falha com `invalid category`. O padrão de `post`, quando `--category` falta, é `outros`. `--category` em `account open` é outra lista: `reserve` ou `goal`.

Estes comandos aceitam `--idempotency-key`: `account open`, `post`, `card open`, `card base`, `card purchase`, `card installment`, `card pay`, `recurring add`, `recurring pay`, `forecast add`, `forecast pay`. A mesma chave, o mesmo comando e o mesmo arquivo devolvem o primeiro `data` e não gravam de novo. A mesma chave em outro comando responde `idempotency_conflict`. Sem a flag, cada chamada gera um id novo. Chave vazia é `missing_value`.

## Ordem para o agente

1. Instale o binário e exporte `FINANCEIRO_FILE`.
2. Leia `settings show`, `category list`, `account list`, `card list`, `forecast list` e `recurring list`.
3. Use o id devolvido. Não invente id.
4. Leitura segue direto: `balance`, `list`, as listas, `projection show`, `division show`, `debt list`, `debt cost`, `card invoice`, `card summary`.
5. `post`, `remove`, `card pay`, `recurring pay`, `forecast pay` e `settings set` esperam a pessoa confirmar valor em centavos e conta.
6. Na criação, mande `--idempotency-key` estável para a tentativa. Se a resposta se perder, repita a mesma linha.

## Módulos

| Pasta | O que o agente opera |
| --- | --- |
| [src](src/README.md) | Processo, modelo, relógio, ids e a tradução para o SDK |
| [src/cli](src/cli/README.md) | Comandos, saída e vocabulário |
| [src/db](src/db/README.md) | Abertura do SQLite e tabelas |
| [src/ledger](src/ledger/README.md) | Contas e lançamentos |
| [src/cards](src/cards/README.md) | Cartão, fatura e parcela |
| [src/recurring](src/recurring/README.md) | Recorrência |
| [src/forecasts](src/forecasts/README.md) | Previsão |
| [src/settings](src/settings/README.md) | Moeda, divisão e margem |

Projeção, divisão e dívida não têm pasta. Os comandos estão em [src/cli/README.md](src/cli/README.md). O cálculo fica em `src/sdk.ts`.

## Verificação

```bash
bun test
bun run check
```
