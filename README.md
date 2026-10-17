# Wagering Backend API

<p align="center">
  **API para processamento de apostas com consistência financeira, idempotência e mensageria assíncrona.**
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
</p>

## Sobre o projeto

O **Wagering Backend API** é um backend desenvolvido como parte de um desafio técnico de engenharia de software. O projeto tem como objetivo processar transações de apostas com foco em integridade financeira, confiabilidade, concorrência e consistência dos dados.

A solução utiliza NestJS e TypeScript para estruturar a aplicação, PostgreSQL para persistência transacional e SQS para processamento assíncrono de mensagens. O ambiente local utiliza Docker e LocalStack para facilitar o desenvolvimento e a validação dos fluxos de mensageria.

O projeto aborda problemas comuns em sistemas financeiros distribuídos, como requisições duplicadas, disputas concorrentes pelo saldo, rastreabilidade de movimentações e recuperação de falhas.

## Principais funcionalidades

- **Processamento de apostas:** endpoint REST para receber e processar transações.
- **Idempotência:** proteção contra o processamento financeiro repetido de uma mesma operação.
- **Controle de concorrência:** proteção do saldo durante operações simultâneas.
- **Validação de saldo:** rejeição de apostas quando não há saldo suficiente.
- **Precisão monetária:** armazenamento dos valores em centavos inteiros.
- **Ledger financeiro:** registro persistente das movimentações das carteiras.
- **Inbox e Outbox:** mecanismos para controlar mensagens recebidas e eventos a publicar.
- **Mensageria assíncrona:** integração com filas SQS e tratamento de falhas.
- **Dead Letter Queue (DLQ):** suporte ao encaminhamento de mensagens que excedem as tentativas de processamento configuradas.
- **Migrations:** versionamento explícito da estrutura do banco de dados.
- **Testes automatizados:** testes unitários e de integração para regras de negócio e cenários concorrentes.

## Tecnologias

| Tecnologia | Finalidade |
|---|---|
| TypeScript | Linguagem principal |
| NestJS | Framework backend |
| Bun | Runtime e gerenciamento de dependências |
| PostgreSQL | Banco de dados relacional |
| TypeORM | Mapeamento objeto-relacional e migrations |
| Amazon SQS | Mensageria assíncrona |
| LocalStack | Simulação local de serviços AWS |
| Docker Compose | Gerenciamento do ambiente local |
| Jest | Testes automatizados |

## Arquitetura

A aplicação organiza suas responsabilidades em camadas, separando as regras de negócio dos detalhes de infraestrutura.

```text
Cliente / Sistema externo
          |
          v
    REST Controller
          |
          v
   Application Service
          |
          v
      Domain Layer
          |
          v
 Repositories / PostgreSQL
          |
          +------> Inbox / Outbox
          |
          v
     SQS / Workers
```

### Camadas da aplicação

- **Domain:** contém conceitos e regras centrais do negócio, como dinheiro, carteiras, transações e políticas de reversão.
- **Application:** coordena o processamento das apostas e a aplicação das regras de negócio.
- **Infrastructure:** implementa persistência, integração com PostgreSQL, mensageria e componentes externos.
- **API:** expõe os endpoints HTTP e valida os dados recebidos.

Essa separação facilita a manutenção, os testes e a evolução dos componentes.

## Consistência financeira

### Valores monetários

Os saldos são armazenados em centavos, evitando depender de operações monetárias com números de ponto flutuante.

Exemplo:

| Valor | Armazenamento |
|---|---:|
| R$ 10,00 | 1000 |
| R$ 80,00 | 8000 |
| R$ 100,00 | 10000 |

### Concorrência

O processamento utiliza mecanismos de controle transacional e bloqueio da carteira para proteger operações concorrentes.

Por exemplo, se uma carteira possui R$ 100,00 e recebe simultaneamente duas apostas de R$ 80,00, somente uma delas pode ser aprovada. A outra deve ser rejeitada por insuficiência de saldo.

### Idempotência

Uma requisição repetida não deve causar um segundo débito financeiro. O sistema utiliza identificadores e chaves de idempotência para reconhecer operações já processadas.

### Ledger financeiro

O ledger registra as movimentações financeiras, permitindo rastrear os efeitos das transações. A estrutura do banco também inclui mecanismos de proteção para impedir alterações indevidas nos registros.

### Inbox e Outbox

Esses padrões auxiliam na confiabilidade da comunicação entre componentes:

- **Inbox:** controla mensagens recebidas e ajuda a evitar processamento repetido.
- **Outbox:** registra eventos que precisam ser publicados, permitindo separar a persistência da transação da entrega do evento.

## Estrutura do banco de dados

Entre as principais tabelas utilizadas estão:

| Tabela | Responsabilidade |
|---|---|
| `wallets` | Carteiras, identificação do jogador e saldo |
| `wager_transactions` | Registro e estado das transações |
| `wallet_ledger_entries` | Histórico de movimentações financeiras |
| `inbox_messages` | Controle de mensagens recebidas |
| `outbox_events` | Registro de eventos a publicar |

A estrutura é mantida por migrations do TypeORM, com sincronização automática de entidades desabilitada para evitar alterações implícitas no esquema.

## Pré-requisitos

Antes de executar o projeto, instale:

- [Git](https://git-scm.com/)
- [Bun](https://bun.sh/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Visual Studio Code](https://code.visualstudio.com/) (opcional)

O PostgreSQL e o LocalStack são executados no ambiente local por meio de containers, conforme a configuração do projeto.

## Instalação e configuração

### 1. Clone o repositório

```bash
git clone https://github.com/DanloxBR/ChallengeTS.git
cd ChallengeTS
```

### 2. Instale as dependências

```bash
bun install
```

### 3. Configure as variáveis de ambiente

Crie seu arquivo `.env` local utilizando `.env.example` como referência.

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Revise o arquivo `.env` e configure as credenciais, o banco de dados e as filas conforme o ambiente local.

**Nunca publique arquivos `.env` com senhas, tokens ou credenciais reais.**

### 4. Inicie a infraestrutura local

Com o Docker Desktop em execução:

```bash
docker compose up -d
```

Esse comando utiliza a configuração do `compose.yaml` do projeto. Confira se os containers iniciaram corretamente:

```bash
docker compose ps
```

### 5. Execute as migrations

Após confirmar a configuração do banco de dados, aplique as migrations utilizando o script de migration definido no `package.json`.

Consulte os scripts disponíveis com:

```bash
bun run
```

Execute o comando de migration apropriado para o ambiente desejado. Não execute migrations de desenvolvimento contra um banco compartilhado ou de produção.

## Executando a aplicação

Para iniciar o servidor em modo de desenvolvimento:

```bash
bun run start:dev
```

Com a configuração local utilizada durante o desenvolvimento, a aplicação foi executada na porta `3001`.

Endpoint de verificação:

```http
GET /
```

Resposta esperada:

```text
Hello World!
```

## Endpoint de apostas

### `POST /wagers`

Recebe uma requisição para processar uma transação de aposta.

Os dados validados incluem:

| Campo | Descrição |
|---|---|
| `providerId` | Identificador do provedor |
| `externalTransactionId` | Identificador externo da transação |
| `idempotencyKey` | Chave de idempotência |
| `payloadHash` | Hash SHA-256 do conteúdo canônico |
| `walletId` | Identificador da carteira |
| `playerId` | Identificador do jogador |
| `roundId` | Identificador da rodada |
| `gameId` | Identificador do jogo |
| `kind` | Tipo da transação |
| `amount` | Valor monetário em formato decimal textual |
| `currency` | Código da moeda, como `BRL` |
| `referenceExternalTransactionId` | Referência opcional a outra transação |

O campo `amount` aceita até duas casas decimais. O campo `payloadHash` deve respeitar o formato hexadecimal de 64 caracteres definido pelo DTO.

A operação depende de uma carteira previamente cadastrada e das regras de negócio aplicáveis. Para realizar testes reais do endpoint, utilize uma base isolada e dados de teste.

## Testes automatizados

Execute a suíte de testes com:

```bash
bun run test --runInBand
```

Para executar o build:

```bash
bun run build
```

Os testes cobrem regras de domínio e cenários de integração, incluindo:

- Cálculos e validações monetárias.
- Regras de carteira e transação.
- Política de reversão.
- Controle de concorrência entre apostas.
- Proteção contra débitos duplicados.
- Idempotência em requisições simultâneas.

O resultado registrado durante o desenvolvimento foi de **44 testes aprovados em 7 suítes**, quando o PostgreSQL estava disponível. Uma execução posterior apresentou falha de conexão na porta `5433`; portanto, a suíte completa deve ser executada novamente com a infraestrutura ativa antes de declarar a validação final concluída.

## Boas práticas adotadas

- Separação de responsabilidades por camadas.
- Validação de entrada por DTOs.
- Uso de migrations para evolução do banco.
- Controle transacional de operações financeiras.
- Idempotência e tratamento de concorrência.
- Testes automatizados de regras críticas.
- Configuração de ambiente separada do código-fonte.
- Proteção de dados sensíveis por meio do `.gitignore`.

## Melhorias futuras

Possíveis evoluções incluem:

- Pipeline de CI para build e testes automatizados.
- Métricas e monitoramento do processamento das filas.
- Documentação interativa da API com OpenAPI/Swagger, se adicionada ao projeto.
- Testes adicionais de recuperação de falhas e reprocessamento.
- Melhoria da observabilidade com logs estruturados e correlação de transações.

## Autor

**Daniel Santos Oliveira — DanloxBR**

- GitHub: [@DanloxBR](https://github.com/DanloxBR)
- Repositório: [ChallengeTS](https://github.com/DanloxBR/ChallengeTS)

---

Projeto desenvolvido para fins de avaliação técnica e demonstração de práticas de engenharia backend com TypeScript, NestJS, PostgreSQL e mensageria assíncrona.
