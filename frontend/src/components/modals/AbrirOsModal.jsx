import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import {
  X, Loader2, Wrench, Plus, Trash2, RefreshCw, ChevronRight,
  Truck, Settings, Zap, Droplets, Thermometer, Navigation2,
  Anchor, Package, RotateCcw, Circle, GitBranch, ArrowUpDown,
  MoreHorizontal, ClipboardList, CheckCircle2, ChevronDown, Search,
  ShoppingCart, Hammer,
} from 'lucide-react'
import { dbListFrotaAll, dbAbrirOs, dbAtualizarOs, dbPneuSpecs } from '../../utils/api'

// ─── Configuração de Sistemas ──────────────────────────────────────────────
const SISTEMAS_CFG = [
  { key: 'Revisão',      Icon: RefreshCw,      label: 'Revisão',      desc: 'Preventiva programada' },
  { key: 'Motor',        Icon: Wrench,          label: 'Motor',        desc: 'Mecânica geral'        },
  { key: 'Freio',        Icon: RotateCcw,       label: 'Freio',        desc: 'Disco / tambor'        },
  { key: 'Pneu',         Icon: Circle,          label: 'Pneu',         desc: 'Troca / recapagem'     },
  { key: 'Elétrico',     Icon: Zap,             label: 'Elétrico',     desc: 'Sistema elétrico'      },
  { key: 'Câmbio',       Icon: Settings,        label: 'Câmbio',       desc: 'Transmissão'           },
  { key: 'Suspensão',    Icon: ArrowUpDown,     label: 'Suspensão',    desc: 'Amortecedor / mola'    },
  { key: 'Hidráulico',   Icon: Droplets,        label: 'Hidráulico',   desc: 'Sistema hidráulico'    },
  { key: 'Arrefecimento',Icon: Thermometer,     label: 'Resfriamento', desc: 'Radiador / fluidos'    },
  { key: 'Direção',      Icon: Navigation2,     label: 'Direção',      desc: 'Direção assistida'     },
  { key: 'Guincho',      Icon: Anchor,          label: 'Guincho',      desc: 'Guindaste / içamento'  },
  { key: 'Implemento',   Icon: Package,         label: 'Implemento',   desc: 'Carroceria / baú'      },
  { key: 'Diferencial',  Icon: GitBranch,       label: 'Diferencial',  desc: 'Eixo / diferencial'    },
  { key: 'Outro',        Icon: MoreHorizontal,  label: 'Outro',        desc: 'Não listado acima'     },
]

const POSICOES_PNEU = [
  { value: 'DIANTEIRO', label: 'Dianteiro' },
  { value: 'TRASEIRO',  label: 'Traseiro'  },
  { value: 'ESTEPE',    label: 'Estepe'    },
  { value: 'AMBOS',     label: 'Ambos'     },
]
const CONDICOES_PNEU = ['Novo', 'Usado', 'Recapado']

const STATUS_OPTS = [
  { value: 'em_andamento',    label: 'Em andamento'    },
  { value: 'aguardando_peca', label: 'Aguardando peça' },
]

// Filtros disponíveis em revisão de caminhões / frotas pesadas
const REVISAO_FILTROS_CFG = [
  { key: 'filtro_oleo',    label: 'Filtro de Óleo'         },
  { key: 'filtro_comb',    label: 'Filtro de Combustível'  },
  { key: 'filtro_racor',   label: 'Filtro Racor/Diesel'    },
  { key: 'filtro_ar',      label: 'Filtro de Ar'           },
  { key: 'filtro_ar_pri',  label: 'Filtro de Ar Primário'  },
  { key: 'filtro_ac',      label: 'Filtro Ar-Cond.'        },
  { key: 'filtro_sep',     label: 'Filtro Separador'       },
]

const VISCOSIDADES = ['5w30', '5w40', '10w40', '15w40', '20w50']

const REVISAO_INIT = {
  oleo:           false,
  oleo_spec:      '15w40',
  oleo_marca:     '',
  oleo_qtd:       '1',
  filtros:        Object.fromEntries(REVISAO_FILTROS_CFG.map(f => [f.key, false])),
  mao_obra:       true,
  mao_obra_desc:  'Revisão preventiva',
}

const RASCUNHO_ZERO = {
  sistema: '', categoria: 'Serviço',
  servico: '', descricao: '', qtd_itens: '1',
  posicao_pneu: '', qtd_pneu: '2', espec_pneu: '',
  marca_pneu: '', modelo_pneu: '', condicao_pneu: 'Novo',
}

// ─── PlacaPicker ────────────────────────────────────────────────────────────
// Dropdown com portal (evita clipping do overflow-y-auto do modal)
function PlacaPicker({ frota, value, onChange, disabled }) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 300 })
  const triggerRef = useRef(null)
  const inputRef   = useRef(null)

  const selected = useMemo(() => frota.find(v => v.placa === value), [frota, value])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return frota
    return frota.filter(v =>
      v.placa.toLowerCase().includes(q) ||
      (v.modelo || '').toLowerCase().includes(q)
    )
  }, [frota, search])

  const openDropdown = () => {
    if (disabled) return
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  useEffect(() => {
    if (!open) return
    const close = e => {
      const drop = document.getElementById('_placa-drop')
      if (!triggerRef.current?.contains(e.target) && !drop?.contains(e.target)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const handleSelect = v => { onChange(v); setOpen(false); setSearch('') }

  const dropdown = open ? createPortal(
    <div
      id="_placa-drop"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 999999 }}
      className="bg-g-950 border border-g-700 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Busca */}
      <div className="p-2 border-b border-g-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar placa ou modelo…"
            className="w-full pl-9 pr-3 py-2 bg-g-900 border border-g-700 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-500 transition-colors"
          />
        </div>
      </div>
      {/* Lista */}
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-4 text-g-600 text-sm text-center">Nenhum veículo encontrado</p>
        ) : filtered.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => handleSelect(v)}
            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors border-l-2 ${
              value === v.placa
                ? 'bg-g-800 border-l-g-300'
                : 'hover:bg-g-900 border-transparent'
            }`}
            style={value === v.placa ? { borderLeftColor: '#9ca3af' } : undefined}
          >
            <span className="font-mono font-bold text-g-50 text-sm tracking-tight w-[5.5rem] shrink-0">
              {v.placa}
            </span>
            <span className="text-g-500 text-xs truncate flex-1">{v.modelo || '—'}</span>
            {v.empresa && (
              <span className="text-[10px] text-g-600 bg-g-800 px-1.5 py-0.5 rounded shrink-0">
                {v.empresa}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={`w-full px-3 py-2.5 bg-g-900 border rounded-lg text-left text-sm transition-colors flex items-center justify-between gap-2 ${
          disabled
            ? 'border-g-800 opacity-50 cursor-default'
            : open
              ? 'border-g-500 outline-none'
              : 'border-g-800 hover:border-g-600 cursor-pointer'
        }`}
      >
        {selected ? (
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono font-bold text-g-50 tracking-tight shrink-0">{selected.placa}</span>
            {selected.modelo && <span className="text-g-500 text-xs truncate">— {selected.modelo}</span>}
            {selected.empresa && (
              <span className="text-[10px] text-g-600 bg-g-850 px-1.5 py-0.5 rounded shrink-0">
                {selected.empresa}
              </span>
            )}
          </span>
        ) : (
          <span className="text-g-700">Selecione a placa do veículo…</span>
        )}
        <ChevronDown className={`w-4 h-4 text-g-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {dropdown}
    </>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function StepLabel({ n, label, active, done, onClick }) {
  return (
    <button
      type="button"
      onClick={done ? onClick : undefined}
      className={`flex items-center gap-2 ${
        active ? 'opacity-100' : done ? 'opacity-70 cursor-pointer hover:opacity-100' : 'opacity-25 cursor-default'
      } transition-opacity`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-g-100 text-g-900' : 'bg-g-800 text-g-500'
      }`}>{done ? '✓' : n}</div>
      <span className={`text-xs font-semibold ${active ? 'text-g-100' : done ? 'text-g-400' : 'text-g-600'}`}>
        {label}
      </span>
      {n < 3 && <ChevronRight className="w-3.5 h-3.5 text-g-700 ml-1" />}
    </button>
  )
}

function SectionHeader({ icon: Icon, label, sub }) {
  return (
    <div className="flex items-center gap-2 mb-5 pb-2 border-b border-g-800">
      <Icon className="w-4 h-4 text-g-500" />
      <div>
        <p className="text-g-400 text-xs font-bold uppercase tracking-widest">{label}</p>
        {sub && <p className="text-g-700 text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px] mt-0.5 leading-tight">{hint}</p>}
    </div>
  )
}

const inputCls  = 'w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors'
const selectCls = inputCls

function ToggleGroup({ options, value, onChange, small }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(opt => {
        const v = opt.value ?? opt
        const l = opt.label ?? opt
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`${small ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} rounded-lg font-medium transition-all border ${
              v === value
                ? 'bg-g-100 border-g-100 text-white shadow-sm'
                : 'bg-g-900 border-g-800 text-g-500 hover:border-g-600 hover:text-g-200'
            }`}
          >{l}</button>
        )
      })}
    </div>
  )
}

// ─── Modal principal ────────────────────────────────────────────────────────
export default function AbrirOsModal({ onClose, onSaved, os = null }) {
  const isEdit = os !== null
  const [step, setStep] = useState(1)

  const [frota,        setFrota]        = useState([])
  const [loadingFrota, setLoadingFrota] = useState(true)
  const [pneuSpecs,    setPneuSpecs]    = useState({ por_posicao: {}, specs_unicas: [] })
  const [saving,       setSaving]       = useState(false)

  const [form, setForm] = useState(() => ({
    id_veiculo:      os?.id_veiculo      ?? '',
    placa:           os?.placa           ?? '',
    modelo:          os?.modelo          ?? '',
    tipo_manutencao: os?.tipo_manutencao ?? 'Corretiva',
    responsavel_tec: os?.responsavel_tec ?? '',
    indisponivel:    os?.indisponivel    ?? true,
    data_entrada:    os?.data_entrada    ?? new Date().toISOString().slice(0, 10),
    km:              os?.km              ?? '',
    prox_km:         os?.prox_km         ?? '',
    prox_data:       os?.prox_data       ?? '',
    status_os:       os?.status_os       ?? 'em_andamento',
    observacoes:     os?.observacoes     ?? '',
  }))

  const [itens, setItens] = useState(() =>
    os?.itens?.length
      ? os.itens.map(it => ({
          id:            it.id,
          categoria:     it.categoria     ?? 'Serviço',
          sistema:       it.sistema       ?? '',
          servico:       it.servico       ?? '',
          descricao:     it.descricao     ?? '',
          qtd_itens:     it.qtd_itens     ?? null,
          posicao_pneu:  it.posicao_pneu  ?? '',
          qtd_pneu:      it.qtd_pneu      ?? null,
          espec_pneu:    it.espec_pneu    ?? '',
          marca_pneu:    it.marca_pneu    ?? '',
          modelo_pneu:   it.modelo_pneu   ?? '',
          condicao_pneu: it.condicao_pneu ?? '',
          manejo_pneu:   it.manejo_pneu   ?? '',
        }))
      : []
  )

  // Rascunho para itens gerais / pneu
  const [rascunho, setRascunho] = useState({ ...RASCUNHO_ZERO })
  // Formulário estruturado de revisão
  const [revisao,  setRevisao]  = useState({ ...REVISAO_INIT })

  // ── Effects ──
  useEffect(() => {
    dbListFrotaAll()
      .then(setFrota)
      .catch(() => toast.error('Não foi possível carregar a frota'))
      .finally(() => setLoadingFrota(false))
  }, [])

  useEffect(() => {
    if (!form.placa) { setPneuSpecs({ por_posicao: {}, specs_unicas: [] }); return }
    dbPneuSpecs(form.placa).then(setPneuSpecs).catch(() => setPneuSpecs({ por_posicao: {}, specs_unicas: [] }))
  }, [form.placa])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setR = (k, v) => setRascunho(r => ({ ...r, [k]: v }))
  const setRev = patch => setRevisao(r => ({ ...r, ...patch }))
  const setRevFiltro = (key, val) => setRevisao(r => ({ ...r, filtros: { ...r.filtros, [key]: val } }))

  const handlePlaca = v => {
    setForm(f => ({ ...f, placa: v.placa, id_veiculo: v.id ?? '', modelo: v.modelo ?? f.modelo }))
  }

  const isRevisaoOs = useMemo(
    () => itens.some(it => it.sistema?.toLowerCase() === 'revisão'),
    [itens]
  )

  useEffect(() => {
    if (isRevisaoOs) setF('tipo_manutencao', 'Preventiva')
  }, [isRevisaoOs]) // eslint-disable-line

  // ── Rascunho helpers ──
  const rsistema = rascunho.sistema
  const isPneuR    = rsistema === 'Pneu'
  const isRevisaoR = rsistema === 'Revisão'

  const handleSelectSistema = key => {
    setRascunho({ ...RASCUNHO_ZERO, sistema: key,
      categoria: key === 'Pneu' ? 'Compra' : 'Serviço',
      servico: key === 'Revisão' ? 'Revisão preventiva' : '',
    })
    if (key === 'Revisão') setRevisao({ ...REVISAO_INIT })
  }

  const handlePosicaoPneu = pos => {
    const byPos = pneuSpecs.por_posicao
    const unicas = pneuSpecs.specs_unicas
    let spec = byPos[pos.toUpperCase()] ?? null
    if (!spec && unicas.length === 1) spec = unicas[0]
    setRascunho(r => ({
      ...r, posicao_pneu: pos,
      espec_pneu:    spec?.espec_pneu    || r.espec_pneu,
      marca_pneu:    spec?.marca_pneu    || r.marca_pneu,
      modelo_pneu:   spec?.modelo_pneu   || r.modelo_pneu,
      condicao_pneu: spec?.condicao_pneu || r.condicao_pneu || 'Novo',
    }))
  }

  // ── Adicionar item genérico / pneu ──
  const handleAdicionarItem = () => {
    if (!rsistema) return toast.error('Selecione o sistema')
    if (!isPneuR && !rascunho.servico.trim()) return toast.error('Descreva o serviço ou item')
    if (isPneuR && !rascunho.posicao_pneu) return toast.error('Selecione a posição do pneu')
    if (isPneuR && rascunho.posicao_pneu === 'AMBOS' && parseInt(rascunho.qtd_pneu) <= 2)
      return toast.error('Posição "Ambos" requer quantidade maior que 2')

    const novoItem = {
      categoria:     isPneuR ? 'Compra' : rascunho.categoria,
      sistema:       rsistema,
      servico:       rascunho.servico   || null,
      descricao:     rascunho.descricao || null,
      qtd_itens:     rascunho.qtd_itens ? parseInt(rascunho.qtd_itens) : null,
      posicao_pneu:  isPneuR ? rascunho.posicao_pneu  : null,
      qtd_pneu:      isPneuR ? (parseInt(rascunho.qtd_pneu) || null) : null,
      espec_pneu:    isPneuR ? rascunho.espec_pneu    : null,
      marca_pneu:    isPneuR ? rascunho.marca_pneu    : null,
      modelo_pneu:   isPneuR ? rascunho.modelo_pneu   : null,
      condicao_pneu: isPneuR ? rascunho.condicao_pneu : null,
      manejo_pneu:   isPneuR ? 'Compra'               : null,
    }
    setItens(its => [...its, novoItem])
    setRascunho({ ...RASCUNHO_ZERO })
  }

  // ── Adicionar itens de revisão (cria múltiplos items) ──
  const handleAdicionarRevisao = () => {
    const nenhum = !revisao.oleo &&
      !Object.values(revisao.filtros).some(Boolean) &&
      !revisao.mao_obra
    if (nenhum) return toast.error('Selecione pelo menos um componente da revisão')

    const novos = []

    if (revisao.oleo) {
      novos.push({
        categoria: 'Compra', sistema: 'Revisão', servico: 'Óleo de Motor',
        descricao: [revisao.oleo_spec, revisao.oleo_marca].filter(Boolean).join(' · ') || null,
        qtd_itens: parseInt(revisao.oleo_qtd) || 1,
        posicao_pneu: null, qtd_pneu: null, espec_pneu: null,
        marca_pneu: null, modelo_pneu: null, condicao_pneu: null, manejo_pneu: null,
      })
    }
    REVISAO_FILTROS_CFG.forEach(f => {
      if (revisao.filtros[f.key]) {
        novos.push({
          categoria: 'Compra', sistema: 'Revisão', servico: f.label,
          descricao: null, qtd_itens: 1,
          posicao_pneu: null, qtd_pneu: null, espec_pneu: null,
          marca_pneu: null, modelo_pneu: null, condicao_pneu: null, manejo_pneu: null,
        })
      }
    })
    if (revisao.mao_obra) {
      novos.push({
        categoria: 'Serviço', sistema: 'Revisão',
        servico: revisao.mao_obra_desc || 'Revisão preventiva',
        descricao: null, qtd_itens: 1,
        posicao_pneu: null, qtd_pneu: null, espec_pneu: null,
        marca_pneu: null, modelo_pneu: null, condicao_pneu: null, manejo_pneu: null,
      })
    }

    setItens(its => [...its, ...novos])
    setRascunho({ ...RASCUNHO_ZERO })
    setRevisao({ ...REVISAO_INIT })
    toast.success(`${novos.length} ${novos.length === 1 ? 'item adicionado' : 'itens adicionados'} à OS`)
  }

  const removeItem = i => setItens(its => its.filter((_, idx) => idx !== i))

  // ── Navegação ──
  const canAdvance = () => {
    if (step === 1) return !!form.placa && !!form.id_veiculo
    if (step === 2) return !!form.data_entrada
    return true
  }

  const validate = () => {
    if (!form.placa || !form.id_veiculo) return 'Selecione a placa do veículo'
    if (!form.data_entrada) return 'Informe a data de entrada'
    if (itens.length === 0) return 'Adicione pelo menos um serviço ou item'
    if (isRevisaoOs && !form.km) return 'KM atual é obrigatório para Revisão Preventiva'
    return null
  }

  const handleSubmit = async () => {
    const err = validate()
    if (err) { toast.error(err); return }

    setSaving(true)
    try {
      const payload = {
        ...form,
        id_veiculo: parseInt(form.id_veiculo),
        km:        form.km       ? parseFloat(form.km)       : null,
        prox_km:   form.prox_km  ? parseFloat(form.prox_km)  : null,
        prox_data: form.prox_data || null,
        itens: itens.map(it => ({
          id:            it.id            || null,
          categoria:     it.categoria     || null,
          sistema:       it.sistema       || null,
          servico:       it.servico       || null,
          descricao:     it.descricao     || null,
          qtd_itens:     it.qtd_itens     || null,
          posicao_pneu:  it.posicao_pneu  || null,
          qtd_pneu:      it.qtd_pneu      || null,
          espec_pneu:    it.espec_pneu    || null,
          marca_pneu:    it.marca_pneu    || null,
          modelo_pneu:   it.modelo_pneu   || null,
          condicao_pneu: it.condicao_pneu || null,
          manejo_pneu:   it.manejo_pneu   || null,
        })),
      }
      isEdit ? await dbAtualizarOs(os.id, payload) : await dbAbrirOs(payload)
      toast.success(isEdit ? 'OS atualizada com sucesso!' : 'OS aberta com sucesso!')
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao salvar OS')
    } finally {
      setSaving(false)
    }
  }

  const veiculoSelecionado = frota.find(v => v.placa === form.placa)
  const dlId = 'dl-espec-pneu'

  // ─── Blocos de conteúdo ───────────────────────────────────────────────────

  // ── Etapa 1: Veículo ──
  const step1 = (
    <div className="flex flex-col gap-5">
      <SectionHeader icon={Truck} label="Seleção do Veículo"
        sub="Escolha o veículo que entrará em manutenção" />

      {loadingFrota ? (
        <div className="flex items-center gap-2 text-g-600 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando frota…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <PlacaPicker frota={frota} value={form.placa} onChange={handlePlaca} disabled={isEdit} />
            </Field>
            <Field label="Status inicial">
              <select value={form.status_os} onChange={e => setF('status_os', e.target.value)} className={selectCls}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          {veiculoSelecionado && (
            <div className="p-5 bg-g-900 border border-g-800 rounded-xl flex items-start gap-4">
              <div className="p-2.5 bg-g-850 border border-g-800 rounded-lg shrink-0">
                <Truck className="w-5 h-5 text-g-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-mono font-extrabold text-g-50 text-xl tracking-tight">
                    {veiculoSelecionado.placa}
                  </span>
                  {veiculoSelecionado.empresa && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-g-800 text-g-300">
                      {veiculoSelecionado.empresa}
                    </span>
                  )}
                  {veiculoSelecionado.status && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                      veiculoSelecionado.status === 'Ativo'
                        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-700/40'
                        : 'bg-g-850 text-g-600 border-g-800'
                    }`}>{veiculoSelecionado.status}</span>
                  )}
                </div>
                <p className="text-g-400 text-sm font-medium">{veiculoSelecionado.modelo || '—'}</p>
                {veiculoSelecionado.implemento && (
                  <p className="text-g-600 text-xs mt-0.5">Implemento: {veiculoSelecionado.implemento}</p>
                )}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2.5 cursor-pointer group select-none">
            <input type="checkbox" checked={form.indisponivel}
              onChange={e => setF('indisponivel', e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded" />
            <span className="text-g-400 text-sm group-hover:text-g-200 transition-colors">
              Veículo <strong className="text-g-300">indisponível</strong> — parado para manutenção até a conclusão
            </span>
          </label>
        </div>
      )}
    </div>
  )

  // ── Etapa 2: Detalhes ──
  const step2 = (
    <div className="flex flex-col gap-6">
      <SectionHeader icon={ClipboardList} label="Informações do Atendimento"
        sub="Tipo, data, KM e responsável técnico pela OS" />

      <div>
        <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider block mb-2">
          Tipo de Manutenção <span className="text-red-400">*</span>
        </label>
        <ToggleGroup
          options={['Corretiva', 'Preventiva']}
          value={isRevisaoOs ? 'Preventiva' : form.tipo_manutencao}
          onChange={v => !isRevisaoOs && setF('tipo_manutencao', v)}
        />
        {isRevisaoOs && (
          <p className="text-emerald-600 text-[10px] mt-1.5 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Forçado para Preventiva — Revisão nos itens
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Data de Entrada" required>
          <input type="date" value={form.data_entrada}
            onChange={e => setF('data_entrada', e.target.value)} className={inputCls} />
        </Field>
        <Field label="KM Atual" required={isRevisaoOs}
          hint={isRevisaoOs ? 'Obrigatório para registrar revisão' : undefined}>
          <input type="number" value={form.km}
            onChange={e => setF('km', e.target.value)}
            placeholder="Ex: 125000" className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Responsável Técnico">
          <input value={form.responsavel_tec}
            onChange={e => setF('responsavel_tec', e.target.value)}
            placeholder="Nome do mecânico…" className={inputCls} />
        </Field>
      </div>

      {isRevisaoOs && (
        <div className="p-4 bg-g-900 border border-g-800 rounded-xl flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-g-800">
            <RefreshCw className="w-3.5 h-3.5 text-g-500" />
            <p className="text-g-400 text-xs font-bold uppercase tracking-widest">Próxima Revisão</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="KM para próxima revisão">
              <input type="number" value={form.prox_km}
                onChange={e => setF('prox_km', e.target.value)}
                placeholder="Ex: 155000" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Data estimada">
              <input type="date" value={form.prox_data}
                onChange={e => setF('prox_data', e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
      )}

      <Field label="Observações">
        <textarea rows={2} value={form.observacoes}
          onChange={e => setF('observacoes', e.target.value)}
          placeholder="Anotações internas, condição do veículo, histórico…"
          className={`${inputCls} resize-none`} />
      </Field>
    </div>
  )

  // ── Etapa 3: Serviços ──
  const step3 = (
    <div className="flex flex-col gap-6">
      <SectionHeader icon={Wrench} label="O que será realizado?"
        sub="Selecione o sistema, preencha os detalhes e adicione à OS" />

      {/* Grade de sistemas */}
      <div>
        <p className="text-g-500 text-[11px] font-semibold uppercase tracking-wider mb-3">Selecione o sistema</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {SISTEMAS_CFG.map(({ key, Icon, label, desc }) => {
            const sel = rsistema === key
            return (
              <button key={key} type="button" onClick={() => handleSelectSistema(key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                  sel
                    ? 'bg-g-800 border-g-500 text-g-100 shadow-sm'
                    : 'bg-g-900 border-g-800 text-g-500 hover:border-g-600 hover:text-g-300 hover:bg-g-850'
                }`}
                title={desc}
              >
                <Icon className={`w-4 h-4 shrink-0 ${sel ? 'text-g-200' : 'text-g-600'}`} />
                <span className="text-[10px] font-semibold leading-tight">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Formulário contextual ── */}
      {rsistema && (
        <div className="bg-g-900 border border-g-700 rounded-xl overflow-hidden">
          {/* Cabeçalho do formulário */}
          <div className="flex items-center justify-between px-4 py-3 bg-g-850 border-b border-g-800">
            <div className="flex items-center gap-2">
              {(() => { const cfg = SISTEMAS_CFG.find(s => s.key === rsistema); if (!cfg) return null; const { Icon } = cfg
                return <><Icon className="w-3.5 h-3.5 text-g-400" /><span className="text-g-200 text-sm font-bold">{rsistema}</span></>
              })()}
            </div>
            <button type="button" onClick={() => setRascunho({ ...RASCUNHO_ZERO })}
              className="text-g-600 hover:text-g-300 text-xs flex items-center gap-1 transition-colors">
              <X className="w-3 h-3" /> Trocar sistema
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">

            {/* ══ REVISÃO — Formulário estruturado ══ */}
            {isRevisaoR && (
              <>
                {/* Óleo de Motor */}
                <div className="flex flex-col gap-3 p-3 bg-g-850 rounded-lg border border-g-800">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={revisao.oleo}
                      onChange={e => setRev({ oleo: e.target.checked })}
                      className="w-4 h-4 accent-g-100 rounded" />
                    <span className="text-g-200 text-sm font-semibold">Óleo de Motor</span>
                    <span className="text-[10px] text-g-600 bg-g-800 px-1.5 py-0.5 rounded">Compra</span>
                  </label>

                  {revisao.oleo && (
                    <div className="pl-6 grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                          Qtd (litros)
                        </label>
                        <input type="number" min="1" value={revisao.oleo_qtd}
                          onChange={e => setRev({ oleo_qtd: e.target.value })}
                          className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm font-mono focus:outline-none focus:border-g-600" />
                      </div>
                      <div>
                        <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                          Viscosidade
                        </label>
                        <select value={revisao.oleo_spec}
                          onChange={e => setRev({ oleo_spec: e.target.value })}
                          className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm focus:outline-none focus:border-g-600">
                          {VISCOSIDADES.map(v => <option key={v}>{v}</option>)}
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                          Marca
                        </label>
                        <input value={revisao.oleo_marca}
                          onChange={e => setRev({ oleo_marca: e.target.value })}
                          placeholder="Shell, Castrol, Mobil…"
                          className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Filtros */}
                <div className="flex flex-col gap-2 p-3 bg-g-850 rounded-lg border border-g-800">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-g-300 text-sm font-semibold">Filtros</p>
                    <span className="text-[10px] text-g-600 bg-g-800 px-1.5 py-0.5 rounded">Compra</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {REVISAO_FILTROS_CFG.map(f => (
                      <label key={f.key}
                        className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg hover:bg-g-800 transition-colors">
                        <input type="checkbox" checked={revisao.filtros[f.key]}
                          onChange={e => setRevFiltro(f.key, e.target.checked)}
                          className="w-3.5 h-3.5 accent-g-100 rounded shrink-0" />
                        <span className="text-g-400 text-xs font-medium">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Mão de Obra */}
                <div className="flex flex-col gap-3 p-3 bg-g-850 rounded-lg border border-g-800">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={revisao.mao_obra}
                      onChange={e => setRev({ mao_obra: e.target.checked })}
                      className="w-4 h-4 accent-g-100 rounded" />
                    <span className="text-g-200 text-sm font-semibold">Mão de Obra</span>
                    <span className="text-[10px] text-g-600 bg-g-800 px-1.5 py-0.5 rounded">Serviço</span>
                  </label>
                  {revisao.mao_obra && (
                    <div className="pl-6">
                      <input value={revisao.mao_obra_desc}
                        onChange={e => setRev({ mao_obra_desc: e.target.value })}
                        placeholder="Revisão preventiva dos X.000 km…"
                        className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600" />
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={handleAdicionarRevisao}
                    className="flex items-center gap-2 px-5 py-2.5 bg-g-100 hover:bg-g-50 text-white rounded-lg text-sm font-bold transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Adicionar revisão à OS
                  </button>
                </div>
              </>
            )}

            {/* ══ PNEU ══ */}
            {isPneuR && (
              <>
                {/* Linha 1: Qtd + Condição */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Quantidade <span className="text-red-400">*</span>
                    </label>
                    <input type="number" min="1" value={rascunho.qtd_pneu}
                      onChange={e => setR('qtd_pneu', e.target.value)}
                      className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm font-mono focus:outline-none focus:border-g-600" />
                  </div>
                  <div>
                    <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Condição
                    </label>
                    <ToggleGroup small options={CONDICOES_PNEU} value={rascunho.condicao_pneu}
                      onChange={v => setR('condicao_pneu', v)} />
                  </div>
                </div>

                {/* Posição */}
                <div>
                  <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                    Posição no veículo <span className="text-red-400">*</span>
                  </label>
                  <ToggleGroup options={POSICOES_PNEU} value={rascunho.posicao_pneu}
                    onChange={handlePosicaoPneu} />
                </div>

                {/* Especificações */}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Medida" hint="Auto-preenchida do histórico">
                    <datalist id={dlId}>
                      {pneuSpecs.specs_unicas.map(s => <option key={s.espec_pneu} value={s.espec_pneu} />)}
                    </datalist>
                    <input list={dlId} value={rascunho.espec_pneu}
                      onChange={e => setR('espec_pneu', e.target.value)}
                      placeholder={pneuSpecs.specs_unicas.length === 1 ? pneuSpecs.specs_unicas[0].espec_pneu : '12.5/80-18'}
                      className={inputCls} />
                  </Field>
                  <Field label="Marca">
                    <input value={rascunho.marca_pneu} onChange={e => setR('marca_pneu', e.target.value)}
                      placeholder="Bridgestone, Pirelli…" className={inputCls} />
                  </Field>
                  <Field label="Modelo">
                    <input value={rascunho.modelo_pneu} onChange={e => setR('modelo_pneu', e.target.value)}
                      placeholder="L2, G2, All Season…" className={inputCls} />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={handleAdicionarItem}
                    className="flex items-center gap-2 px-5 py-2.5 bg-g-100 hover:bg-g-50 text-white rounded-lg text-sm font-bold transition-colors shadow-sm">
                    <Plus className="w-4 h-4" /> Adicionar pneu à OS
                  </button>
                </div>
              </>
            )}

            {/* ══ ITENS GERAIS (todos exceto Revisão e Pneu) ══ */}
            {!isRevisaoR && !isPneuR && (
              <>
                {/* Linha 1: Qtd + Tipo (Serviço / Compra) */}
                <div className="flex items-end gap-4">
                  <div style={{ width: 90 }} className="shrink-0">
                    <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Quantidade
                    </label>
                    <input type="number" min="1" value={rascunho.qtd_itens}
                      onChange={e => setR('qtd_itens', e.target.value)}
                      className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm font-mono text-center focus:outline-none focus:border-g-600" />
                  </div>
                  <div className="flex-1">
                    <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider block mb-1.5">
                      Tipo do item <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-2">
                      {[
                        { v: 'Serviço',       Icon: Hammer,       desc: 'Mão de obra / trabalho realizado'  },
                        { v: 'Compra',        Icon: ShoppingCart, desc: 'Peça ou material adquirido'         },
                      ].map(({ v, Icon, desc }) => (
                        <button key={v} type="button" onClick={() => setR('categoria', v)}
                          title={desc}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border flex-1 justify-center ${
                            rascunho.categoria === v
                              ? 'bg-g-100 border-g-100 text-white shadow-sm'
                              : 'bg-g-900 border-g-800 text-g-500 hover:border-g-600 hover:text-g-200'
                          }`}>
                          <Icon className="w-3.5 h-3.5" />
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Linha 2: Serviço/Item */}
                <Field
                  label={rascunho.categoria === 'Compra' ? 'Peça / Material' : 'O que foi / será feito?'}
                  required
                  hint={rascunho.categoria === 'Compra'
                    ? 'Ex: Correia dentada Gates 107T · Pastilha de freio traseiro'
                    : 'Ex: Troca de correia dentada · Sangria do sistema de freios'}
                >
                  <input value={rascunho.servico} onChange={e => setR('servico', e.target.value)}
                    placeholder={rascunho.categoria === 'Compra' ? 'Descreva a peça ou material…' : 'Descreva o serviço…'}
                    className={inputCls} />
                </Field>

                {/* Linha 3: Detalhes */}
                <Field label="Observações (opcional)"
                  hint="Marca, referência, causa do defeito, fornecedor…">
                  <input value={rascunho.descricao} onChange={e => setR('descricao', e.target.value)}
                    placeholder="Ex: Peça original, defeito por desgaste, fornecedor X…"
                    className={inputCls} />
                </Field>

                <div className="flex justify-end">
                  <button type="button" onClick={handleAdicionarItem}
                    className="flex items-center gap-2 px-5 py-2.5 bg-g-100 hover:bg-g-50 text-white rounded-lg text-sm font-bold transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Adicionar {rascunho.categoria === 'Compra' ? 'peça' : 'serviço'} à OS
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lista de itens adicionados */}
      {itens.length > 0 && (
        <div>
          <p className="text-g-500 text-[11px] font-semibold uppercase tracking-wider mb-3">
            Itens na OS <span className="ml-1 text-g-600 font-mono normal-case">({itens.length})</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {itens.map((it, i) => {
              const cfg  = SISTEMAS_CFG.find(s => s.key === it.sistema)
              const Icon = cfg?.Icon ?? Wrench
              const isP  = it.sistema?.toLowerCase() === 'pneu'
              const isCompra = it.categoria === 'Compra'

              return (
                <div key={i}
                  className="flex items-center gap-3 px-4 py-3 bg-g-900 border border-g-800 rounded-xl">
                  <div className="p-1.5 rounded-lg bg-g-850 border border-g-800 shrink-0">
                    <Icon className="w-3.5 h-3.5 text-g-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-g-300">{it.sistema}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        isCompra
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {isCompra ? 'Compra' : 'Serviço'}
                      </span>
                      {isP && it.posicao_pneu && (
                        <span className="text-[9px] text-g-500 bg-g-800 px-1.5 py-0.5 rounded font-mono">
                          {it.posicao_pneu}
                        </span>
                      )}
                    </div>
                    <p className="text-g-500 text-xs mt-0.5 truncate">
                      {isP
                        ? [it.qtd_pneu && `${it.qtd_pneu}x`, it.espec_pneu, it.marca_pneu, it.condicao_pneu].filter(Boolean).join(' · ') || 'Pneu'
                        : it.servico
                      }
                      {it.descricao && <span className="text-g-700"> — {it.descricao}</span>}
                    </p>
                  </div>
                  {it.qtd_itens != null && (
                    <span className="text-g-600 font-mono text-xs shrink-0 bg-g-850 border border-g-800 px-1.5 py-0.5 rounded">×{it.qtd_itens}</span>
                  )}
                  <button type="button" onClick={() => removeItem(i)}
                    className="p-1.5 text-g-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-1" title="Remover">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {itens.length === 0 && !rsistema && (
        <div className="flex flex-col items-center gap-2 py-8 text-center border border-dashed border-g-800 rounded-xl">
          <ClipboardList className="w-8 h-8 text-g-700" />
          <p className="text-g-600 text-sm font-medium">Nenhum serviço adicionado</p>
          <p className="text-g-700 text-xs">Selecione um sistema acima para começar</p>
        </div>
      )}
    </div>
  )

  const editContent = (
    <div className="flex flex-col gap-8">
      {step1}
      <div className="border-t border-g-800" />
      {step2}
      <div className="border-t border-g-800" />
      {step3}
    </div>
  )

  const wizardContent = step === 1 ? step1 : step === 2 ? step2 : step3

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col"
        style={{ maxHeight: '94vh' }}>

        {/* Header */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-g-800/60 border border-g-700">
                <Wrench className="w-6 h-6 text-g-200" />
              </div>
              <div>
                <h2 className="text-g-50 font-bold text-lg tracking-tight">
                  {isEdit ? 'Editar Ordem de Serviço' : 'Abrir Nova OS'}
                </h2>
                <p className="text-g-500 text-xs mt-0.5">
                  {isEdit ? `${os.placa} · ${os.numero_os || 'sem nº'}` : 'Registrar veículo em manutenção'}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {!isEdit && (
            <div className="flex items-center gap-2">
              <StepLabel n={1} label="Veículo"  active={step === 1} done={step > 1} onClick={() => setStep(1)} />
              <StepLabel n={2} label="Detalhes" active={step === 2} done={step > 2} onClick={() => setStep(2)} />
              <StepLabel n={3} label="Serviços" active={step === 3} done={false} />
            </div>
          )}
        </div>

        {/* Corpo */}
        <div className="overflow-y-auto flex-1 px-8 py-6">
          {isEdit ? editContent : wizardContent}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-g-800 shrink-0 flex items-center justify-between gap-4 bg-g-950/80">
          <div className="text-xs text-g-700 hidden sm:block">
            {isEdit
              ? 'Salve para aplicar as alterações imediatamente'
              : step === 3 && itens.length > 0
                ? <span className="text-g-500">
                    <span className="font-bold text-g-300">{itens.length}</span>
                    {itens.length === 1 ? ' item' : ' itens'} na OS
                  </span>
                : 'Campos com * são obrigatórios'
            }
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button type="button"
              onClick={() => { if (!isEdit && step > 1) setStep(s => s - 1); else onClose() }}
              className="px-5 py-2.5 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 hover:text-g-200 transition-colors">
              {!isEdit && step > 1 ? '← Voltar' : 'Cancelar'}
            </button>

            {!isEdit && step < 3 ? (
              <button type="button"
                onClick={() => {
                  if (!canAdvance()) {
                    toast.error(step === 1 ? 'Selecione a placa do veículo' : 'Preencha os campos obrigatórios')
                    return
                  }
                  setStep(s => s + 1)
                }}
                disabled={!canAdvance()}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-g-700 hover:bg-g-600 border border-g-600">
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit}
                disabled={saving || (!isEdit && itens.length === 0)}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-g-100 hover:bg-g-50 border border-g-100">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                  : isEdit
                    ? <><CheckCircle2 className="w-4 h-4" /> Salvar Alterações</>
                    : <><Wrench className="w-4 h-4" /> Abrir OS</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
