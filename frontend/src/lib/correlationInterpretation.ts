import type { CorrelationResponse } from '../hooks/useCorrelation'

export type Verdict = 'excellent' | 'good' | 'warning' | 'danger'

export interface Diagnosis {
  verdict: Verdict
  label: string
  message: string
  color: string
  bgColor: string
}

const VERDICT_STYLES: Record<Verdict, { color: string; bgColor: string; label: string }> = {
  excellent: { color: 'text-emerald-400', bgColor: 'bg-emerald-900/30 border-emerald-700', label: 'Excelente' },
  good:      { color: 'text-blue-400',    bgColor: 'bg-blue-900/30 border-blue-700',       label: 'Buena' },
  warning:   { color: 'text-amber-400',   bgColor: 'bg-amber-900/30 border-amber-700',     label: 'Atención' },
  danger:    { color: 'text-red-400',     bgColor: 'bg-red-900/30 border-red-700',         label: 'Peligro' },
}

export function diagnoseAvgCorrelation(avg: number): Diagnosis {
  if (avg < 0.3) {
    return { ...VERDICT_STYLES.excellent, message: 'Tus activos se comportan de forma muy distinta entre sí. Diversificación real.' }
  }
  if (avg < 0.55) {
    return { ...VERDICT_STYLES.good, message: 'Hay diversificación efectiva, aunque algunos activos comparten factores comunes.' }
  }
  if (avg < 0.75) {
    return { ...VERDICT_STYLES.warning, message: 'Tu cartera tiene correlación interna alta. Muchos activos se mueven juntos. Revisa si tienes concentración por sector o factor.' }
  }
  return { ...VERDICT_STYLES.danger, message: 'Diversificación falsa. Tus activos suben y bajan casi a la vez. Tener N tickers distintos NO es diversificar si todos comparten el mismo factor de riesgo.' }
}

export function diagnoseDiversificationRatio(ratio: number): Diagnosis {
  if (ratio >= 1.6) {
    return { ...VERDICT_STYLES.excellent, message: 'La combinación de activos reduce el riesgo de forma significativa.' }
  }
  if (ratio >= 1.3) {
    return { ...VERDICT_STYLES.good, message: 'La diversificación está aportando una reducción de riesgo notable.' }
  }
  if (ratio >= 1.1) {
    return { ...VERDICT_STYLES.warning, message: 'Reducción de riesgo modesta. Es probable que estés concentrado en pocos factores.' }
  }
  return { ...VERDICT_STYLES.danger, message: 'Casi nula reducción de riesgo. La cartera se comporta como si fuera un único activo.' }
}

export function correlationToColor(rho: number): string {
  const r = Math.max(-1, Math.min(1, rho))
  if (r >= 0) {
    const i = Math.round(r * 100)
    if (i < 20) return 'rgb(254, 243, 199)'
    if (i < 40) return 'rgb(252, 211, 77)'
    if (i < 60) return 'rgb(251, 146, 60)'
    if (i < 80) return 'rgb(239, 68, 68)'
    return 'rgb(185, 28, 28)'
  } else {
    const i = Math.round(-r * 100)
    if (i < 20) return 'rgb(220, 252, 231)'
    if (i < 40) return 'rgb(110, 231, 183)'
    if (i < 60) return 'rgb(52, 211, 153)'
    if (i < 80) return 'rgb(16, 185, 129)'
    return 'rgb(4, 120, 87)'
  }
}

export function correlationTextColor(rho: number): string {
  return Math.abs(rho) > 0.55 ? 'white' : 'rgb(200, 200, 200)'
}

export function getSuggestions(data: CorrelationResponse): string[] {
  const sugg: string[] = []
  if (data.avg_correlation > 0.7) {
    sugg.push(`El par ${data.max_pair.a}/${data.max_pair.b} tiene correlación ${data.max_pair.correlation.toFixed(2)}. Considera quitar uno de los dos: aportan información casi idéntica.`)
  }
  if (data.diversification_ratio < 1.1) {
    sugg.push('Añade activos de clases distintas: oro (GLD), bonos largos (TLT), un sector defensivo (XLP) o un mercado emergente (EEM).')
  }
  if (data.min_pair.correlation < 0.3) {
    sugg.push(`Buena pareja diversificadora: ${data.min_pair.a} vs ${data.min_pair.b} (ρ=${data.min_pair.correlation.toFixed(2)}). Mantén ambos.`)
  }
  if (data.missing_tickers.length > 0) {
    sugg.push(`Yahoo no encontró datos para: ${data.missing_tickers.join(', ')}. Comprueba el símbolo.`)
  }
  return sugg
}

export function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`
}
