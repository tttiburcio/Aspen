# Aspen — Sistema de Gestão Operacional para Locadoras de Veículos

> Desenvolvido do zero para resolver um problema real: a ausência de um sistema integrado que centralizasse **todas** as operações de uma locadora de frota pesada.

---

## Por que esse projeto existe

Antes do Aspen, a operação dependia de um conjunto de planilhas Excel que cresceu de forma orgânica ao longo dos anos. Cada setor vivia no seu próprio arquivo: manutenção em um, faturamento em outro, débitos veiculares em um terceiro. O resultado era previsível — informações desatualizadas, retrabalho manual constante, decisões tomadas com dados de semanas atrás e uma equipe administrativa consumindo horas por dia em tarefas de consolidação que deveriam ser automáticas.

O Aspen nasceu dessa dor. A proposta era simples na intenção, mas ambiciosa na execução: **construir um sistema único que cobrisse do operacional ao financeiro**, com dados em tempo real, regras de negócio embutidas e uma interface pensada para quem usa todos os dias — não para quem desenvolve.

O sistema hoje gerencia uma frota de aproximadamente 500 veículos distribuídos em múltiplas empresas (CNPJ distintos operando sob o mesmo grupo), consolidando numa única tela o que antes exigia horas de cruzamento manual de planilhas.

---

## O que o sistema faz

O Aspen cobre nove módulos distintos, cada um resolvendo uma dor específica da operação:

| Módulo | Problema resolvido |
|---|---|
| **Visão Geral** | KPIs financeiros consolidados em tempo real: receita, custo, margem, saúde da frota |
| **Frota** | Análise financeira por veículo com ordenação, filtros e detalhamento de custos por categoria |
| **Gestão de OS** | Ciclo completo de ordens de serviço: abertura, acompanhamento, finalização e histórico por veículo |
| **Financeiro de Manutenção** | Visão de custo de manutenção por período, fornecedor e tipo de serviço |
| **Reembolsos** | Controle de valores a receber de clientes por danos e infrações |
| **Faturamento** | Faturas emitidas, valores recebidos e impostos por competência |
| **Contratos** | Gestão de contratos ativos com clientes e vencimentos |
| **Débitos Veiculares** | IPVA, Licenciamento e Multas de Trânsito com regras de sequência obrigatória de pagamento, cálculo automático de encargos e timeline de fases das multas |
| **Rastreamento e Seguro** | Contratos de rastreamento e apólices de seguro vinculados à frota |

---

## Tecnologias utilizadas e por que cada uma foi escolhida

### Backend — FastAPI + SQLAlchemy + SQLite

**FastAPI** foi escolhido porque a equipe precisava de um backend que fosse ao mesmo tempo rápido de desenvolver e robusto o suficiente para produção. O sistema de tipagem automática via Pydantic elimina uma classe inteira de bugs de contrato entre frontend e backend, e a geração automática de documentação OpenAPI foi um ganho real durante o desenvolvimento iterativo. Comparado ao Django, o FastAPI entregou menos atrito e código mais legível para uma API sem necessidade de admin panel ou ORM acoplado ao framework.

**SQLAlchemy 2** com o padrão Unit of Work deu controle granular sobre as queries sem sacrificar a legibilidade. O padrão de *bulk maps* — carregar entidades relacionadas com `IN (ids)` ao invés de N queries individuais — foi implementado de forma consistente em todos os routers, resultando em O(1) queries independente do volume de dados da frota.

**SQLite** foi uma decisão deliberada e consciente. O sistema é single-tenant: uma locadora, um banco. SQLite elimina toda a infraestrutura de banco de dados — sem servidor, sem configuração de conexão, sem pool, sem backups complicados (um `cp locadora.db backup.db` resolve). A migração para PostgreSQL, quando necessária, exige mudar apenas uma linha de configuração — o SQLAlchemy abstrai o dialeto completamente.

**Alembic** para migrations versionadas garantiu que nenhuma mudança de schema fosse feita de forma ad-hoc. Todo alteração no banco tem um arquivo de versão com up/down, tornando rollback trivial e o histórico de evolução do schema rastreável no git.

### Frontend — React + Vite + Tailwind CSS

**React 18** com hooks foi a escolha natural para uma interface com múltiplos estados interdependentes: filtros, modais, tabs, dados de múltiplas APIs. O uso extensivo de `useMemo` e `useCallback` garante que re-renders sejam cirúrgicos — filtragem e ordenação de 500 veículos acontece sem perda de fluidez perceptível.

**Vite** substituiu o Create React App porque o tempo de hot reload importa quando você está iterando sobre UI com um usuário final do outro lado testando em tempo real. O build de produção com Vite gera bundles significativamente menores e mais rápidos.

**Tailwind CSS** foi escolhido sobre CSS Modules ou styled-components porque o design system da aplicação precisava ser consistente e rápido de evoluir. A escala de cores customizada `g-*` (verde escuro, identidade visual da empresa) foi definida uma única vez no `tailwind.config.js` e usada em todo o projeto de forma semântica. Nenhuma linha de CSS customizado foi necessária além das definições no `@layer`.

**React Hot Toast** para notificações porque é zero-config, bonito por padrão e não adiciona peso desnecessário ao bundle.

### Infraestrutura — Render + Vercel

O backend roda na **Render.com** com deploy automático a cada push no `main`. O banco SQLite é inicializado via `seed.py` na primeira execução, populando um conjunto realista de dados de demonstração (empresas, veículos, contratos, OS, débitos e multas). O frontend é servido pela **Vercel** com CDN global.

---

## Arquitetura

```
Browser (Vercel CDN)
    │
    ▼
React 18 + Vite
    │  /api/* → proxy para backend
    ▼
FastAPI (Render.com)
    │
    ├── routers/          # Separação por domínio de negócio
    │     ├── analytics.py     # KPIs, veículos, gráficos
    │     ├── orders.py        # Ordens de serviço (CRUD completo)
    │     ├── debitos.py       # IPVA, Licenciamento, Multas
    │     ├── contratos.py     # Contratos e clientes
    │     ├── seguro.py        # Apólices
    │     ├── rastreamento.py  # Dispositivos e contratos
    │     └── reembolsos.py    # Reembolsos de multas e danos
    │
    ├── services/
    │     ├── compute.py       # Agregações financeiras (núcleo do sistema)
    │     ├── os_helpers.py    # Geração atômica de número de OS
    │     └── regras.py        # Regras de negócio centralizadas
    │
    ├── models.py         # ORM (SQLAlchemy 2)
    ├── schemas.py        # Contratos de API (Pydantic v2)
    └── alembic/versions/ # Histórico de schema versionado
```

A separação por domínio no backend segue uma linha clara: cada router é responsável por seu agregado, sem lógica de negócio vazando para os endpoints. As regras que afetam múltiplos domínios (como a sequência obrigatória de pagamento de débitos — não se pode pagar o licenciamento de 2026 se o de 2023 está em aberto) vivem em funções puras testáveis, chamadas pelos routers.

O frontend segue o mesmo princípio: cada página é um módulo independente, os hooks de dados são separados da lógica de apresentação, e o estado global fica restrito ao `App.jsx` e contexts específicos (`CompanyContext`, `EnumsContext`).

---

## Qualidade e testes

O backend tem cobertura de testes com **pytest** usando banco SQLite em memória, fixtures reutilizáveis e testes de integração que cobrem os principais fluxos:

- Criação e finalização de OS com regras de sequência
- Pagamento de débitos com validação de anos anteriores
- Cálculo de encargos oficiais (Lei 9.430/96 + DETRAN-SP + CTB Art. 284)
- CRUD de contratos, rastreamento e apólices

```bash
cd backend && pytest tests/ -v
```

---

## Impacto operacional

A implantação do sistema gerou mudanças mensuráveis na rotina da empresa:

- **Tempo de fechamento mensal reduzido** — o que levava um dia inteiro de cruzamento de planilhas passou a ser visualizado em segundos na tela de Visão Geral
- **Zero débitos vencidos por falta de controle** — o módulo de Débitos Veiculares com alertas de vencimento e cálculo automático de encargos eliminou multas pagas com mora desnecessária
- **Rastreabilidade total de manutenção** — cada OS tem histórico completo com datas, fornecedores, valores e quem aprovou; consultas que antes exigiam abrir múltiplos arquivos acontecem em dois cliques
- **Gestão proativa de multas** — a timeline de fases (Notificação → Indicação → Boleto → Pagamento) guia o time administrativo sem necessidade de processos externos

---

## Rodando localmente

### Pré-requisitos
- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
python scripts/seed.py      # popula dados de demonstração
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env        # ajustar VITE_PRIMARY_COMPANY_SIGLA se necessário
npm install
npm run dev                  # porta 5173
```

### One-shot (Windows)

```bat
start.bat
```

---

## Deploy online (demonstração)

### Backend — Render.com
1. Crie uma conta gratuita em [render.com](https://render.com)
2. Conecte seu fork do repositório — o `render.yaml` na raiz configura tudo automaticamente
3. O build executa migrations e seed automaticamente no startup
4. Copie a URL gerada (ex: `https://aspen-api.onrender.com`)

### Frontend — Vercel
1. Importe o repositório em [vercel.com](https://vercel.com)
2. Defina o Root Directory como `frontend`
3. Adicione a variável `VITE_API_BASE_URL` com a URL do backend
4. Deploy automático a cada push

> **Nota sobre o plano gratuito do Render:** o backend "dorme" após 15 minutos sem uso. O primeiro acesso pode levar 30–50 segundos para o servidor acordar — o sistema exibe um aviso amigável durante esse período.

---

## Estrutura de arquivos

```
backend/
├── alembic/versions/       # Migrations versionadas
├── routers/                # Endpoints por domínio de negócio
├── services/               # Lógica de negócio desacoplada
├── tests/                  # Testes de integração
├── models.py               # ORM completo
├── schemas.py              # Pydantic v2
└── main.py                 # App FastAPI + lifespan

frontend/src/
├── pages/                  # Um arquivo por módulo de negócio
├── components/             # Componentes reutilizáveis e modais
├── contexts/               # Estado global (empresa, enums)
├── hooks/                  # Dados de tracker e outros
└── utils/                  # API calls, formatadores, helpers
```

---

## Licença

MIT — veja [LICENSE](LICENSE).
