# Aspen Fleet Dashboard & Analytics

> **Um sistema inteligente de gestão logística desenvolvido para solucionar a descentralização de dados operacionais em frotas de maquinário pesado e veículos leves.**

---

## 💼 Contexto de Negócio & Problema Resolvido

Historicamente, a gestão de frotas sofre com a **pulverização de dados**. Informações cruciais sobre telemetria (rastreamento GPS em tempo real), manutenções programadas, fluxo de caixa operacional (notas fiscais e parcelas) e produtividade mensal residiam em silos separados: planilhas esparsas manipuladas por diferentes departamentos e sistemas de rastreamento desconectados do financeiro.

O **Aspen Dashboard** foi arquitetado como a camada unificadora desse ecossistema. O sistema consolida dados operacionais, financeiros e logísticos de múltiplas empresas, transformando planilhas legadas e _streams_ de dados em tempo real em **inteligência preditiva e visibilidade financeira unificada**.

### Principais Impactos no Negócio:
- **Fim do "Vazamento" de Custo de Manutenção**: Rastreabilidade fim a fim de ordens de serviço vinculadas ao contas a pagar direto, detectando divergências entre o orçado e o faturado.
- **Saúde Financeira por Ativo**: Cálculo preciso de margem líquida unitária (Receita vs. Custos de Manutenção, Seguro, Imposto e Rastreamento) indicando quais veículos estão de fato gerando lucro ou prejuízo.
- **Manutenção Inteligente e Preditiva**: Alertas baseados no cruzamento automático entre km acumulado do rastreador e o histórico de trocas de peças, reduzindo o tempo de inatividade não programado.

---

## 🏛️ Arquitetura & Escolhas Tecnológicas

A arquitetura foi desenhada visando **acoplamento fraco**, alto desempenho em processamento de dados e uma interface rica e reativa.

### **Backend: Python + FastAPI + SQLAlchemy (SQLite)**
- **Por que Python?** Pela maturidade inigualável do ecossistema de dados (com bibliotecas como **Pandas**), o que viabilizou a construção de motores eficientes para ingestão, transformação e consolidação rápida de volumes pesados de planilhas operacionais e geração de métricas complexas em milissegundos.
- **FastAPI**: Escolhido por ser assíncrono de alta performance, fornecer documentação automática (Swagger/OpenAPI) e tipagem estrita via Pydantic, garantindo contratos robustos entre as APIs e o frontend.
- **Estrutura Relacional (SQLAlchemy ORM)**: Mapeamento robusto das entidades vitais de negócio:
  - `Frota`: Cadastro de ativos com metadados operacionais.
  - `Manutencoes`: Entidade pivot que gerencia o workflow operacional da OS (aberta, em andamento, pendente, finalizada) e suas dependências sistêmicas.
  - `NotasFiscais` & `ManutencaoParcelas`: Estrutura altamente normalizada para tratar o fracionamento financeiro de cada OS, controlando prazos, amortizações e aditamentos de pagamento.

### **Frontend: React (Vite) + Tailwind CSS**
- **Interface Premium e Focada na Experiência**: Desenvolvido com uma paleta de cores escura customizada de alto contraste, micro-animações, *Loading Skeletons* e validações reativas para maximizar a produtividade do operador sem sobrecarga visual.
- **Modularidade**: Dividido em módulos funcionais claros (Visão Geral, Gestão de Frota, Gestão de OS/Oficina e Controle Financeiro).
- **Contexto de Multi-Empresa**: Utilização de React Context (`CompanyContext`) propagando filtros de forma unificada. Com um único clique, toda a malha de gráficos, KPICards, listas financeiras e dados de telemetria re-renderizam instantaneamente de acordo com a empresa selecionada.

---

## 💡 Os Desafios de Engenharia & Soluções Inteligentes

O desenvolvimento do sistema envolveu desafios complexos de lógica de negócios e sincronia de estados. Abaixo estão alguns dos principais gargalos superados:

### 1. O Motor Lógico de Sincronização Financeira
**Desafio:** Na finalização de uma Manutenção, a somatória das notas fiscais vinculadas e de suas respectivas parcelas devia bater centavo por centavo com o custo real operacional registrado pela oficina, contornando ao mesmo tempo problemas legados de entradas parciais de faturas nas planilhas.
**Solução:** Desenvolvemos uma camada de validação transacional local e no backend que verifica a consistência dos valores antes de permitir a transição do status da OS para "Finalizada". Implementamos ainda cálculos dinâmicos de encargos financeiros (cálculo de juros diários proporcionais e multas) para prorrogações automáticas ou trâmites de envio a cartório diretamente na interface de pagamento.

### 2. Fusão de Telemetria Offline vs Online
**Desafio:** Unir e processar em tempo real os dados brutos extraídos do rastreador GPS (Telemetria Web) com os dados agregados de custos do banco operacional para gerar índices como "Receita por KM Rodado" e avisos de ociosidade sem comprometer a performance do carregamento inicial.
**Solução:** Arquitetamos uma camada de *Enrichment* no frontend via Custom Hooks (`useTrackerData`) que consome endpoints de telemetria de forma assíncrona em segundo plano e enriquece a grade de dados financeiros da frota à medida que as informações chegam, mantendo a interface viva e fluida enquanto processa os disparadores visuais (como alertas de alto uso e inatividade).

### 3. Motor de Agregação Dinâmico Multi-Chave
**Desafio:** Gerar KPIs financeiros agregados dinamicamente filtrados por Ano e por Empresa em tempo recorde a partir de múltiplas tabelas fatos desconexas.
**Solução:** No backend, otimizamos o serviço central `compute.py` utilizando um mecanismo inteligente de cache em memória indexado por uma tupla contendo `(Ano, Empresa, Hash_do_Banco)`. Se os dados subjacentes não mudaram, as computações analíticas pesadas de margem e taxas de utilização são entregues de forma imediata diretamente da memória RAM.

---

## 🔧 Instalação & Setup Rápido

### Backend (FastAPI)
1. Acesse a pasta `/backend`
2. Instale as dependências: `pip install -r requirements.txt`
3. Execute o servidor de desenvolvimento: `python -m uvicorn main:app --reload --port 8000`

### Frontend (React)
1. Acesse a pasta `/frontend`
2. Instale as dependências: `npm install`
3. Suba o servidor Vite: `npm run dev`

---

*Desenvolvido com foco em excelência operacional, demonstrando como a tecnologia resolve gaps reais de fluxo de informação em grandes frotas logísticas.*
