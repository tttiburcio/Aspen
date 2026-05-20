from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date, DateTime, Text,
    ForeignKey, Index, CheckConstraint, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship
from database import Base


# ─────────────────────────────────────────────
# EMPRESA
# ─────────────────────────────────────────────
class Empresa(Base):
    __tablename__ = "empresas"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    nome      = Column(String(200), nullable=False)
    sigla     = Column(String(20))
    cnpj_cpf  = Column(String(30))
    municipio = Column(String(100))
    estado    = Column(String(10))
    criado_em = Column(DateTime, server_default=func.now())



# ─────────────────────────────────────────────
# FROTA
# ─────────────────────────────────────────────
class Frota(Base):
    __tablename__ = "frota"

    id               = Column(Integer, primary_key=True)   # IDVeiculo original
    placa            = Column(String(20), unique=True, nullable=False)
    id_empresa       = Column(Integer, ForeignKey("empresas.id"))
    marca            = Column(String(80))
    modelo           = Column(String(100))
    ano_modelo       = Column(String(10))
    status           = Column(String(50))
    tipagem          = Column(String(80))
    implemento       = Column(String(80))
    tabela_fipe      = Column(Numeric(14, 2))
    valor_implemento = Column(Numeric(14, 2))
    valor_total      = Column(Numeric(14, 2))
    restricoes       = Column(Text)          # restrições administrativas/judiciais
    renavam          = Column(String(20))

    manutencoes = relationship("Manutencao", back_populates="veiculo")


# ─────────────────────────────────────────────
# MANUTENÇÃO — uma linha por OS
# ─────────────────────────────────────────────
class Manutencao(Base):
    __tablename__ = "manutencoes"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── Workflow ──────────────────────────────
    # aberta | em_andamento | aguardando_peca | finalizada
    status_manutencao = Column(String(30), nullable=False, default="aberta")

    # ── Identificação do veículo (desnormalizado para agilidade) ──
    id_veiculo  = Column(Integer, ForeignKey("frota.id"), nullable=False)
    placa       = Column(String(20))
    modelo      = Column(String(100))
    id_empresa  = Column(Integer, ForeignKey("empresas.id"))
    id_contrato = Column(String(50))
    implemento  = Column(String(80))

    # ── Dados da OS ──────────────────────────
    id_ord_serv = Column(String(50))          # gerado na finalização
    total_os       = Column(Numeric(14, 2))      # preenchido na finalização
    categoria      = Column(String(30))          # Serviço | Compra
    fornecedor     = Column(String(120))
    tipo_manutencao = Column(String(30))         # Preventiva | Corretiva
    sistema        = Column(String(80))
    servico        = Column(String(200))
    descricao      = Column(Text)
    qtd_itens      = Column(Integer)

    # ── KM e pneus ────────────────────────────
    km             = Column(Numeric(10, 0))
    posicao_pneu   = Column(String(50))
    qtd_pneu       = Column(Integer)
    espec_pneu     = Column(String(100))
    marca_pneu     = Column(String(80))
    manejo_pneu    = Column(String(80))

    # ── Controle operacional ──────────────────
    responsavel_tec = Column(String(80))
    indisponivel    = Column(Boolean, default=False)
    data_entrada    = Column(Date)               # NOVO: entrada p/ manutenção
    data_execucao   = Column(Date)               # data de execução / conclusão

    # ── Próxima manutenção ────────────────────
    prox_km   = Column(Numeric(10, 0))
    prox_data = Column(Date)

    observacoes = Column(Text)

    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    veiculo  = relationship("Frota", back_populates="manutencoes")
    parcelas = relationship(
        "ManutencaoParcela",
        back_populates="manutencao",
        cascade="all, delete-orphan",
    )


# ─────────────────────────────────────────────
# PARCELAS DE PAGAMENTO — uma linha por parcela
# ─────────────────────────────────────────────
class ManutencaoParcela(Base):
    __tablename__ = "manutencao_parcelas"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    manutencao_id = Column(Integer, ForeignKey("manutencoes.id"), nullable=True)

    nota             = Column(String(50))
    fornecedor       = Column(String(120))
    valor_item_total = Column(Numeric(14, 2))
    tipo_custo       = Column(String(30))
    data_vencimento  = Column(Date)
    parcela_atual    = Column(Integer)
    parcela_total    = Column(Integer)
    valor_parcela    = Column(Numeric(14, 2))
    forma_pgto       = Column(String(50))
    status_pagamento = Column(String(20), default="Pendente")  # Pago | Pendente

    # Prorrogação
    data_vencimento_original = Column(Date)
    prorrogada               = Column(Boolean, default=False)
    isento_encargos          = Column(Boolean)
    tipo_pgto_prorrogacao    = Column(String(20))   # boleto | pix
    chave_pix                = Column(String(100))
    multa_pct                = Column(Numeric(6, 2))
    juros_diario_pct         = Column(Numeric(6, 4))
    data_prevista_pagamento  = Column(Date)
    dias_cartorio            = Column(Integer)
    valor_atualizado         = Column(Numeric(14, 2))

    # Reembolso (preparação para aba futura)
    sera_reembolsado    = Column(Boolean, default=False)
    valor_reembolso     = Column(Numeric(14, 2))
    qtd_itens_reembolso = Column(Integer)
    motivo_reembolso    = Column(Text)

    # ── Vínculo novo modelo (nf_id autoritativo; manutencao_id legado) ──
    nf_id       = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=True)
    deletado_em = Column(DateTime, nullable=True)   # soft delete

    manutencao  = relationship("Manutencao", back_populates="parcelas")
    nota_fiscal = relationship("NotaFiscal", back_populates="parcelas")

    __table_args__ = (
        Index("idx_parcela_nf", "nf_id"),
        Index("idx_parcela_venc", "data_vencimento"),
    )


# ─────────────────────────────────────────────
# CLIENTE
# ─────────────────────────────────────────────
class Cliente(Base):
    __tablename__ = "clientes"

    id             = Column(Integer, primary_key=True)
    nome           = Column(String(200), nullable=False)
    cnpj_cpf       = Column(String(30))
    municipio      = Column(String(100))
    estado         = Column(String(10))
    status_cliente = Column(String(30))
    criado_em      = Column(DateTime, server_default=func.now())


# ─────────────────────────────────────────────
# CONTRATO
# ─────────────────────────────────────────────
class Contrato(Base):
    __tablename__ = "contratos"

    id                 = Column(Integer, primary_key=True)
    empresa_id         = Column(Integer)
    cliente_id         = Column(Integer, ForeignKey("clientes.id"))
    nome_cliente       = Column(String(200))
    cidade_operacao    = Column(String(100))
    estado_operacao    = Column(String(10))
    data_inicio        = Column(Date)
    data_fim           = Column(Date)
    data_encerramento  = Column(Date)
    status_contrato    = Column(String(30))
    # ── Forma de pagamento ──────────────────────
    forma_pagamento    = Column(String(20))          # PIX | Boleto
    multa_pct          = Column(Numeric(6, 2))       # % multa boleto
    juros_pct          = Column(Numeric(6, 4))       # % juros ao mês boleto
    dias_protesto      = Column(Integer)             # dias para protesto
    # ── Controle ────────────────────────────────
    medicoes_total     = Column(Integer)             # qtde de meses entre data_inicio e data_fim
    assinado           = Column(Boolean, default=False)
    criado_em          = Column(DateTime, server_default=func.now())

    cliente   = relationship("Cliente")
    veiculos  = relationship("ContratoVeiculo", back_populates="contrato")


# ─────────────────────────────────────────────
# CONTRATO_VEICULO (vínculo N:N)
# ─────────────────────────────────────────────
class ContratoVeiculo(Base):
    __tablename__ = "contrato_veiculo"

    id           = Column(Integer, primary_key=True)
    contrato_id  = Column(Integer, ForeignKey("contratos.id"), nullable=False)
    id_veiculo   = Column(Integer, ForeignKey("frota.id"),     nullable=False)
    sequencia    = Column(Integer)
    valor_mensal = Column(Numeric(14, 2))
    criado_em    = Column(DateTime, server_default=func.now())

    contrato = relationship("Contrato", back_populates="veiculos")
    veiculo  = relationship("Frota")


# ─────────────────────────────────────────────
# FATURAMENTO UNITÁRIO (receita por veículo/mês)
# ─────────────────────────────────────────────
class FatUnitario(Base):
    __tablename__ = "fat_unitario"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    mes         = Column(Date)
    id_veiculo  = Column(Integer, ForeignKey("frota.id"))
    id_empresa  = Column(Integer, ForeignKey("empresas.id"))
    contrato    = Column(String(100))
    medicao     = Column(Numeric(14, 2))
    trabalhado  = Column(Integer)
    parado      = Column(Integer)


# ─────────────────────────────────────────────
# FATURAMENTO MENSAL (faturas de locação — uma por contrato por mês)
# ─────────────────────────────────────────────
class FaturamentoMensal(Base):
    __tablename__ = "faturamento_mensal"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    numero_fatura      = Column(Integer)                               # numeração sequencial por empresa
    id_empresa         = Column(Integer, ForeignKey("empresas.id"))    # locadora emissora
    id_contrato        = Column(Integer, ForeignKey("contratos.id"))   # contrato de referência
    id_cliente         = Column(Integer, ForeignKey("clientes.id"))    # tomador / locatário
    emissao            = Column(Date)
    vencimento         = Column(Date)
    valor_locacoes     = Column(Numeric(14, 2))
    valor_recebido     = Column(Numeric(14, 2))
    status_recebimento = Column(String(30))
    empresa            = Column(String(200))   # nome do tomador (desnormalizado para exibição)

    forma_pagamento    = Column(String(50))    # Boleto | Pix | TED | Depósito | Dinheiro

    # ── Imposto sobre faturamento ─────────────────────────────────────────
    aliquota_imposto   = Column(Numeric(5, 2),  default=Decimal("11.33"))  # % configurável por fatura
    valor_imposto      = Column(Numeric(14, 2))   # valor_locacoes × aliquota / 100
    valor_liquido      = Column(Numeric(14, 2))   # valor_locacoes − valor_imposto
    status_imposto     = Column(String(20),  default="Pendente")  # Pendente | Pago | Isento
    data_pgto_imposto  = Column(Date)
    encargo_imposto    = Column(Numeric(14, 2))   # mora/juros quando pago em atraso

    locadora  = relationship("Empresa")
    contrato  = relationship("Contrato")
    cliente   = relationship("Cliente")

    __table_args__ = (
        Index("idx_fatm_contrato", "id_contrato"),
        Index("idx_fatm_emissao",  "emissao"),
    )


# ─────────────────────────────────────────────
# REEMBOLSOS
# ─────────────────────────────────────────────
class Reembolso(Base):
    __tablename__ = "reembolsos"

    id               = Column(Integer, primary_key=True, autoincrement=True)

    # Tipo: Transporte | Manutenção | Multa de Trânsito | Franquia de Seguro | Encargo | Outro
    tipo             = Column(String(80))

    id_empresa       = Column(Integer, ForeignKey("empresas.id"))
    id_contrato      = Column(Integer, ForeignKey("contratos.id"))
    id_cliente       = Column(Integer, ForeignKey("clientes.id"))
    id_veiculo       = Column(Integer, ForeignKey("frota.id"))
    id_ord_serv      = Column(String(50))
    id_multa         = Column(Integer, ForeignKey("multas.id"))

    recibo           = Column(String(50))
    emissao          = Column(Date)
    vencimento       = Column(Date)
    empresa          = Column(String(200))   # nome resolvido da empresa
    valor_reembolso  = Column(Numeric(14, 2))
    data_entrada     = Column(Date)          # data de recebimento efetivo
    valor_recebido   = Column(Numeric(14, 2))
    encargos         = Column(Numeric(14, 2))  # Encargos de Faturamento
    forma_recebimento = Column(String(50))
    status_recebimento = Column(String(30))   # Recebido | Vencido | Cancelado | Pendente

    # Campo manual (novo cadastro via UI)
    descricao        = Column(Text)
    documento_rede   = Column(String(100))

    # Campos de vínculo (novos)
    placas_json      = Column(Text)        # JSON list de placas selecionadas (múltiplos veículos)
    ids_multa_json   = Column(Text)        # JSON list de IDs de multas vinculadas (múltiplas)
    fatura_mes       = Column(String(7))   # "YYYY-MM" — referência de fatura para tipo Encargo
    numero_os        = Column(String(50))  # OS de referência para tipo Manutenção/Franquia

    categoria        = Column(String(50))   # categoria financeira do reembolso
    criado_em        = Column(DateTime, server_default=func.now())

    empresa_rel  = relationship("Empresa")
    contrato_rel = relationship("Contrato")
    cliente_rel  = relationship("Cliente")
    veiculo      = relationship("Frota")
    multa        = relationship("Multa")

    __table_args__ = (
        Index("idx_reimb_emissao",   "emissao"),
        Index("idx_reimb_veiculo",   "id_veiculo"),
        Index("idx_reimb_contrato",  "id_contrato"),
        Index("idx_reimb_empresa",   "id_empresa"),
    )


# ─────────────────────────────────────────────
# CORRETOR DE SEGUROS
# ─────────────────────────────────────────────
class Corretor(Base):
    __tablename__ = "corretores"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    nome      = Column(String(200), nullable=False)
    cnpj      = Column(String(30))
    susep     = Column(String(20))   # registro SUSEP — habilitação obrigatória no Brasil
    telefone  = Column(String(30))
    email     = Column(String(100))
    criado_em = Column(DateTime, server_default=func.now())


# ─────────────────────────────────────────────
# APÓLICE DE SEGURO (cabeçalho)
# ─────────────────────────────────────────────
class Seguro(Base):
    __tablename__ = "seguro"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    numero_apolice      = Column(String(50), nullable=False, unique=True)
    seguradora          = Column(String(150), nullable=False)
    corretor_id         = Column(Integer, ForeignKey("corretores.id"))
    modelo_cobertura    = Column(String(80))
    # Compreensivo com RCF-DC | RCF-DC Básico | Terceiros + Roubo e Furto | Compreensivo Total
    id_empresa          = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    data_inicio         = Column(Date, nullable=False)
    data_fim            = Column(Date, nullable=False)
    num_parcelas        = Column(Integer, default=12)
    dia_vencimento      = Column(Integer)        # dia fixo de vencimento (1-28)
    valor_total_apolice = Column(Numeric(14, 2)) # soma dos prêmios de todos os veículos
    status_apolice      = Column(String(30), default="Ativa")
    # Ativa | Vencida | Cancelada | Renovada
    criado_em           = Column(DateTime, server_default=func.now())

    corretor = relationship("Corretor")
    empresa  = relationship("Empresa")
    veiculos = relationship("SeguroVeiculo", back_populates="apolice", cascade="all, delete-orphan")
    mensais  = relationship("SeguroMensal",  back_populates="apolice")

    __table_args__ = (Index("idx_seguro_empresa_data", "id_empresa", "data_inicio"),)


# ─────────────────────────────────────────────
# SEGURO × VEÍCULO  (veículos da apólice + prêmio individual)
# ─────────────────────────────────────────────
class SeguroVeiculo(Base):
    __tablename__ = "seguro_veiculo"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    apolice_id    = Column(Integer, ForeignKey("seguro.id"),  nullable=False)
    id_veiculo    = Column(Integer, ForeignKey("frota.id"),   nullable=False)
    valor_veiculo = Column(Numeric(14, 2), nullable=False)   # prêmio anual deste veículo

    apolice = relationship("Seguro",  back_populates="veiculos")
    veiculo = relationship("Frota")

    __table_args__ = (
        Index("idx_sv_apolice",  "apolice_id"),
        Index("idx_sv_veiculo",  "id_veiculo"),
    )


# ─────────────────────────────────────────────
# SEGURO MENSAL  (parcela mensal por veículo)
# ─────────────────────────────────────────────
class SeguroMensal(Base):
    __tablename__ = "seguro_mensal"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    apolice_id = Column(Integer, ForeignKey("seguro.id"), nullable=False)
    vencimento = Column(Date)
    id_veiculo = Column(Integer, ForeignKey("frota.id"))
    valor      = Column(Numeric(14, 2))
    id_empresa = Column(Integer, ForeignKey("empresas.id"))

    apolice = relationship("Seguro", back_populates="mensais")

    __table_args__ = (Index("idx_sm_apolice", "apolice_id"),)


# ─────────────────────────────────────────────
# DÉBITOS DOCUMENTAIS  (IPVA + Licenciamento + Multas por veículo/exercício)
# ─────────────────────────────────────────────
class DebitoDocumental(Base):
    __tablename__ = "debitos_documentais"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    id_veiculo   = Column(Integer, ForeignKey("frota.id"),     nullable=False)
    id_empresa   = Column(Integer, ForeignKey("empresas.id"),  nullable=False)
    exercicio    = Column(Integer, nullable=False)   # ano-calendário do documento
    ano_ref_ipva = Column(Integer)                   # ano de referência do IPVA (= exercicio na maioria dos casos)

    # ── IPVA ─────────────────────────────────────────────────────────────
    valor_ipva          = Column(Numeric(14, 2))
    vencimento_ipva     = Column(Date)
    status_ipva         = Column(String(20), default="Pendente")  # Pendente | Pago | Vencido
    valor_ipva_pago     = Column(Numeric(14, 2))
    data_pgto_ipva      = Column(Date)
    encargo_ipva        = Column(Numeric(14, 2))    # mora/juros quando pago após vencimento

    # ── Licenciamento ─────────────────────────────────────────────────────
    valor_licenciamento          = Column(Numeric(14, 2))
    vencimento_licenciamento     = Column(Date)
    status_licenciamento         = Column(String(20), default="Pendente")
    valor_licenciamento_pago     = Column(Numeric(14, 2))
    data_pgto_licenciamento      = Column(Date)
    encargo_licenciamento        = Column(Numeric(14, 2))

    # ── Multas (agregado cacheado das multas vinculadas) ───────────────────
    valor_multas   = Column(Numeric(14, 2), default=0)
    encargo_multas = Column(Numeric(14, 2), default=0)

    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    veiculo = relationship("Frota")
    multas  = relationship("Multa", back_populates="debito_documental")

    __table_args__ = (
        UniqueConstraint("id_veiculo", "exercicio", name="uq_dd_veiculo_exercicio"),
        Index("idx_dd_veiculo",   "id_veiculo"),
        Index("idx_dd_exercicio", "exercicio"),
    )


# ─────────────────────────────────────────────
# MULTAS DE TRÂNSITO
# Fluxo: Notificação → Indicação de Condutor → Multa Emitida → Pagamento
#
# Regra de negócio (CNPJ/frota locada):
#   • condutor_indicado=True  → 1 multa (Infração); responsabilidade transferida ao condutor
#   • condutor_indicado=False → 2 multas:
#       1. Multa de Infração (valor original)
#       2. Multa de NIC — multa_origem_id aponta para a original (valor = 2× original)
# ─────────────────────────────────────────────
class Multa(Base):
    __tablename__ = "multas"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # ── Veículo / Responsabilidade ───────────────────────────────────────
    id_veiculo           = Column(Integer, ForeignKey("frota.id"),       nullable=False)
    id_empresa           = Column(Integer, ForeignKey("empresas.id"))    # proprietária locadora
    id_contrato          = Column(Integer, ForeignKey("contratos.id"))   # contrato vigente na infração
    id_cliente           = Column(Integer, ForeignKey("clientes.id"))    # locatário responsável pela indicação
    debito_documental_id = Column(Integer, ForeignKey("debitos_documentais.id"), nullable=True)

    # ── Fase 1 — Notificação ─────────────────────────────────────────────
    ait                      = Column(String(50))          # número do Auto de Infração de Trânsito
    orgao_emissor            = Column(String(80))          # DETRAN-SP | PRF | SEMOB | CET-SP | ANTT
    data_infracao            = Column(Date, nullable=False)
    data_emissao_notificacao = Column(Date)                # notificação chega ao proprietário
    motivo_infracao          = Column(String(200))         # descrição da infração (CTB)
    data_limite_indicacao    = Column(Date)                # prazo para indicar o condutor

    # ── Fase 2 — Indicação do Condutor ───────────────────────────────────
    condutor_indicado = Column(Boolean, nullable=False, default=False)
    nome_condutor     = Column(String(150))   # preenchido quando indicado
    cpf_condutor      = Column(String(20))
    data_indicacao    = Column(Date)          # quando a indicação foi enviada ao órgão

    # ── Fase 3 — Multa Emitida ───────────────────────────────────────────
    tipo_multa         = Column(String(40), nullable=False, default="Infração")
    # Infração | Não Indicação de Condutor
    data_emissao_multa = Column(Date)
    data_vencimento    = Column(Date)
    valor_multa        = Column(Numeric(14, 2), nullable=False)
    exercicio          = Column(Integer)      # ano-calendário para agrupamento em debitos_documentais

    # Self-reference: multa de NIC aponta para a infração original
    multa_origem_id = Column(Integer, ForeignKey("multas.id"), nullable=True)

    # ── Fase 4 — Desconto por antecipação ────────────────────────────────
    # Regra: pagamento até data_vencimento → desconto de desconto_pct % sobre valor_multa
    #        pagamento após data_vencimento → valor_multa + encargo (mora + juros diário)
    desconto_pct       = Column(Numeric(5, 2), default=20.00)  # % de desconto (padrão 20%)
    valor_com_desconto = Column(Numeric(14, 2))                # valor_multa × (1 - desconto_pct/100)
    aplicou_desconto   = Column(Boolean)                       # True = pago antes do vencimento

    # ── Fase 5 — Status / Recurso / Pagamento ────────────────────────────
    status_multa   = Column(String(20), nullable=False, default="Pendente")
    # Pendente | Pago | Recorrido | Cancelado | Vencido
    data_pagamento = Column(Date)
    valor_pago     = Column(Numeric(14, 2))
    encargo        = Column(Numeric(14, 2))   # mora/juros — só quando pago após vencimento

    # ── Comunicação ao cliente ────────────────────────────────────────────
    comunicado_enviado = Column(Boolean, default=False)
    data_comunicado    = Column(Date, nullable=True)

    criado_em     = Column(DateTime, server_default=func.now())
    atualizado_em = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # ── Relacionamentos ──────────────────────────────────────────────────
    debito_documental = relationship("DebitoDocumental", back_populates="multas")
    veiculo           = relationship("Frota")
    contrato          = relationship("Contrato")
    cliente           = relationship("Cliente")

    __table_args__ = (
        Index("idx_multa_veiculo",   "id_veiculo"),
        Index("idx_multa_exercicio", "exercicio"),
        Index("idx_multa_dd",        "debito_documental_id"),
        Index("idx_multa_contrato",  "id_contrato"),
        Index("idx_multa_origem",    "multa_origem_id"),
    )


# ─────────────────────────────────────────────
# RASTREAMENTO
# ─────────────────────────────────────────────
class Rastreamento(Base):
    __tablename__ = "rastreamento"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    vencimento = Column(Date)
    id_veiculo = Column(Integer, ForeignKey("frota.id"))
    valor      = Column(Numeric(14, 2))
    id_empresa = Column(Integer, ForeignKey("empresas.id"))


# ─────────────────────────────────────────────
# NOVO MODELO HIERÁRQUICO: OS → Itens → NFs → Itens da NF → Parcelas
# ─────────────────────────────────────────────
class OrdemServico(Base):
    __tablename__ = "ordens_servico"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    numero_os   = Column(String(50), nullable=True, unique=True)  # gerado na 1ª NF
    status_os   = Column(String(40), nullable=False, default="em_andamento")
    # aberta | em_andamento | aguardando_peca | executado_aguardando_nf | finalizada

    id_veiculo  = Column(Integer, ForeignKey("frota.id"), nullable=False)
    placa       = Column(String(20))
    modelo      = Column(String(100))
    id_empresa  = Column(Integer, ForeignKey("empresas.id"))
    id_contrato = Column(String(50))
    implemento  = Column(String(80))

    fornecedor      = Column(String(120))
    tipo_manutencao = Column(String(30))
    categoria       = Column(String(30))
    total_os        = Column(Numeric(14, 2))
    responsavel_tec = Column(String(80))
    indisponivel    = Column(Boolean, default=False)

    km                 = Column(Numeric(10, 0))
    data_entrada       = Column(Date)
    data_execucao      = Column(Date)
    prox_km            = Column(Numeric(10, 0))
    prox_data          = Column(Date)
    status_execucao    = Column(String(40))
    descricao_pendente = Column(Text)
    observacoes        = Column(Text)

    deletado_em     = Column(DateTime, nullable=True)
    criado_em       = Column(DateTime, server_default=func.now())
    atualizado_em   = Column(DateTime, server_default=func.now(), onupdate=func.now())
    migrado_de_ids  = Column(Text)  # JSON list[int]

    veiculo       = relationship("Frota")
    itens         = relationship("OsItem", back_populates="os", cascade="all, delete-orphan")
    notas_fiscais = relationship("NotaFiscal", back_populates="os")  # sem cascade (financeiro)

    @property
    def sistema(self):
        for item in (self.itens or []):
            if item.sistema:
                return item.sistema
        return None

    __table_args__ = (
        Index("idx_os_veiculo_data", "id_veiculo", "data_execucao"),
        Index("idx_os_status", "status_os"),
        Index("idx_os_numero", "numero_os"),
    )


class OsItem(Base):
    __tablename__ = "os_itens"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    os_id     = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)

    categoria = Column(String(30))
    sistema   = Column(String(80))
    servico   = Column(String(200))
    descricao = Column(Text)
    qtd_itens = Column(Integer)

    posicao_pneu = Column(String(50))
    qtd_pneu     = Column(Integer)
    espec_pneu   = Column(String(100))
    marca_pneu   = Column(String(80))
    modelo_pneu   = Column(String(100))
    condicao_pneu = Column(String(20))   # Novo | Usado
    manejo_pneu   = Column(String(80))

    criado_em = Column(DateTime, server_default=func.now())

    os       = relationship("OrdemServico", back_populates="itens")
    nf_itens = relationship("NfItem", back_populates="os_item")

    __table_args__ = (Index("idx_osi_os", "os_id"),)


class NotaFiscal(Base):
    __tablename__ = "notas_fiscais"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    os_id          = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)

    numero_nf        = Column(String(50))
    tipo_nf          = Column(String(20), nullable=False)  # Produto | Servico
    id_empresa       = Column(Integer, ForeignKey("empresas.id"))
    fornecedor       = Column(String(120))
    valor_total_nf   = Column(Numeric(14, 2))
    data_emissao     = Column(Date)
    observacoes      = Column(Text)

    tipo_nf_needs_review = Column(Boolean, default=False)
    deletado_em          = Column(DateTime, nullable=True)
    criado_em            = Column(DateTime, server_default=func.now())

    os       = relationship("OrdemServico", back_populates="notas_fiscais")
    itens    = relationship("NfItem", back_populates="nota_fiscal", cascade="all, delete-orphan")
    parcelas = relationship("ManutencaoParcela", back_populates="nota_fiscal", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("tipo_nf IN ('Produto','Servico')", name="ck_tipo_nf"),
        Index("idx_nf_os", "os_id"),
        Index("idx_nf_emissao", "data_emissao"),
    )


class NfItem(Base):
    __tablename__ = "nf_itens"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    nf_id       = Column(Integer, ForeignKey("notas_fiscais.id"), nullable=False)
    os_item_id  = Column(Integer, ForeignKey("os_itens.id"), nullable=False)

    quantidade         = Column(Numeric(14, 4), default=1)
    valor_unitario     = Column(Numeric(14, 2))
    valor_total_item   = Column(Numeric(14, 2))
    descricao_override = Column(Text)

    criado_em = Column(DateTime, server_default=func.now())

    nota_fiscal = relationship("NotaFiscal", back_populates="itens")
    os_item     = relationship("OsItem", back_populates="nf_itens")

    __table_args__ = (
        Index("idx_nfitem_nf", "nf_id"),
        Index("idx_nfitem_osi", "os_item_id"),
    )


class OsCounter(Base):
    """Gerador atômico de numero_os por ano. UPSERT garante concorrência segura."""
    __tablename__ = "os_counters"

    ano    = Column(Integer, primary_key=True)
    ultimo = Column(Integer, nullable=False, default=0)


# ─────────────────────────────────────────────
# RODÍZIO / MOVIMENTAÇÃO DE PNEUS
# ─────────────────────────────────────────────
class PneuRodizio(Base):
    """Registra a movimentação de um pneu entre posições do mesmo veículo."""
    __tablename__ = "pneu_rodizios"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    placa            = Column(String(20), nullable=False)
    data             = Column(Date, nullable=False)
    km               = Column(Integer)
    posicao_anterior = Column(String(50), nullable=False)
    posicao_nova     = Column(String(50), nullable=False)
    espec_pneu       = Column(String(100))
    marca_pneu       = Column(String(80))
    qtd              = Column(Integer, default=2)
    os_ref           = Column(String(50))   # numero_os da compra original
    observacao       = Column(Text)
    criado_em        = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("idx_rodizio_placa", "placa"),)
