export function parseLocalDate(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

export function diasParados(dataEntrada, dataExecucao = null) {
  const d1 = new Date(dataEntrada)
  if (isNaN(d1)) return null
  const d2 = dataExecucao ? new Date(dataExecucao) : new Date()
  if (isNaN(d2)) return null
  return Math.max(0, Math.round((d2 - d1) / 86400000))
}

export function applyFilterSort(list, filter, sortState, fields) {
  let r = list
  if (filter.trim()) {
    const q = filter.toLowerCase()
    r = r.filter(m => fields.some(f => (m[f] || '').toLowerCase().includes(q)))
  }
  if (sortState.col) {
    const { col, dir } = sortState
    r = [...r].sort((a, b) => {
      const av = a[col] ?? '', bv = b[col] ?? ''
      let diff = 0
      const ad = Date.parse(av), bd = Date.parse(bv)
      if (!isNaN(ad) && !isNaN(bd)) {
        diff = dir === 'asc' ? ad - bd : bd - ad
      } else {
        const an = parseFloat(av), bn = parseFloat(bv)
        if (!isNaN(an) && !isNaN(bn)) {
          diff = dir === 'asc' ? an - bn : bn - an
        } else {
          const as = av.toString().toLowerCase(), bs = bv.toString().toLowerCase()
          diff = dir === 'asc' ? (as < bs ? -1 : as > bs ? 1 : 0) : (as > bs ? -1 : as < bs ? 1 : 0)
        }
      }
      if (diff === 0) {
        const aos = a.numero_os ?? '', bos = b.numero_os ?? ''
        diff = dir === 'asc' ? (aos < bos ? -1 : aos > bos ? 1 : 0) : (aos > bos ? -1 : aos < bos ? 1 : 0)
      }
      return diff
    })
  }
  return r
}

export function nextOsNumber(finalizadas) {
  const pattern = /^OS-\d{4}-(\d+)$/
  const nums = finalizadas
    .map(f => f.id_ord_serv?.match(pattern)?.[1])
    .filter(Boolean)
    .map(Number)
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `OS-${new Date().getFullYear()}-${String(max + 1).padStart(4, '0')}`
}
