// frontend/src/lib/correlationInterpretation.ts
//
// Helpers para interpretar resultados de correlación de forma pedagógica.
// Convierte los números en mensajes accionables que el alumno puede entender.

import type { CorrelationResponse } from "@/hooks/useCorrelation";

export type Verdict = "excellent" | "good" | "warning" | "danger";

export interface Diagnosis {
  verdict: Verdict;
  label: string;       // "Excelente" / "Buena" / "Atención" / "Peligro"
  message: string;     // explicación accionable
  color: string;       // tailwind text-color class
  bgColor: string;
}

const VERDICT_STYLES: Record<Verdict, { color: string; bgColor: string; label: string }> = {
  excellent: { color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-300", label: "Excelente" },
  good:      { color: "text-blue-700",    bgColor: "bg-blue-50 border-blue-300",       label: "Buena" },
  warning:   { color: "text-amber-700",   bgColor: "bg-amber-50 border-amber-300",     label: "Atención" },
  danger:    { color: "text-red-700",     bgColor: "bg-red-50 border-red-300",         label: "Peligro" },
};

/**
 * Diagnóstico de la correlación media de la cartera.
 * Umbrales pensados para alumnos: que coincidan con la lección teórica.
 */
export function diagnoseAvgCorrelation(avg: number): Diagnosis {
  if (avg < 0.3) {
    return {
      ...VERDICT_STYLES.excellent,
      message:
        "Tus activos se comportan de forma muy distinta entre sí. Diversificación real.",
    };
  }
  if (avg < 0.55) {
    return {
      ...VERDICT_STYLES.good,
      message:
        "Hay diversificación efectiva, aunque algunos activos comparten factores comunes.",
    };
  }
  if (avg < 0.75) {
    return {
      ...VERDICT_STYLES.warning,
      message:
        "Tu cartera tiene correlación interna alta. Muchos activos se mueven juntos. Revisa si tienes concentración por sector o factor.",
    };
  }
  return {
    ...VERDICT_STYLES.danger,
    message:
      "Diversificación falsa. Tus activos suben y bajan casi a la vez. Tener N tickers distintos NO es diversificar si todos comparten el mismo factor de riesgo.",
  };
}

/**
 * Diagnóstico del diversification ratio.
 *
 * Interpretación:
 * - 1.0 → no hay reducción de riesgo (todo correlación +1)
 * - 1.1-1.3 → reducción modesta
 * - 1.3-1.6 → buena diversificación
 * - >1.6 → muy buena (raro fuera de carteras multi-clase)
 */
export function diagnoseDiversificationRatio(ratio: number): Diagnosis {
  if (ratio >= 1.6) {
    return {
      ...VERDICT_STYLES.excellent,
      message: "La combinación de activos reduce el riesgo de forma significativa.",
    };
  }
  if (ratio >= 1.3) {
    return {
      ...VERDICT_STYLES.good,
      message: "La diversificación está aportando una reducción de riesgo notable.",
    };
  }
  if (ratio >= 1.1) {
    return {
      ...VERDICT_STYLES.warning,
      message:
        "Reducción de riesgo modesta. Es probable que estés concentrado en pocos factores.",
    };
  }
  return {
    ...VERDICT_STYLES.danger,
    message:
      "Casi nula reducción de riesgo. La cartera se comporta como si fuera un único activo.",
  };
}

/**
 * Color de la celda del heatmap según el valor de correlación.
 * −1 (verde fuerte) → 0 (claro) → +1 (rojo fuerte)
 */
export function correlationToColor(rho: number): string {
  // Clamp a [-1, 1]
  const r = Math.max(-1, Math.min(1, rho));
  if (r >= 0) {
    // 0 → blanco/crema, +1 → rojo
    const intensity = Math.round(r * 100);
    if (intensity < 20) return "rgb(254, 243, 199)";   // amber-100
    if (intensity < 40) return "rgb(252, 211, 77)";    // amber-300
    if (intensity < 60) return "rgb(251, 146, 60)";    // orange-400
    if (intensity < 80) return "rgb(239, 68, 68)";     // red-500
    return "rgb(185, 28, 28)";                          // red-700
  } else {
    // 0 → blanco, −1 → verde fuerte
    const intensity = Math.round(-r * 100);
    if (intensity < 20) return "rgb(220, 252, 231)";    // emerald-100
    if (intensity < 40) return "rgb(110, 231, 183)";    // emerald-300
    if (intensity < 60) return "rgb(52, 211, 153)";     // emerald-400
    if (intensity < 80) return "rgb(16, 185, 129)";     // emerald-500
    return "rgb(4, 120, 87)";                            // emerald-700
  }
}

/**
 * Texto blanco vs negro según fondo (legibilidad).
 */
export function correlationTextColor(rho: number): string {
  const r = Math.abs(rho);
  return r > 0.55 ? "white" : "rgb(20, 18, 16)";
}

/**
 * Sugerencias accionables según el diagnóstico.
 */
export function getSuggestions(data: CorrelationResponse): string[] {
  const sugg: string[] = [];

  if (data.avg_correlation > 0.7) {
    sugg.push(
      `El par ${data.max_pair.a}/${data.max_pair.b} tiene correlación ${data.max_pair.correlation.toFixed(2)}. Considera quitar uno de los dos: aportan información casi idéntica.`
    );
  }

  if (data.diversification_ratio < 1.1) {
    sugg.push(
      "Añade activos de clases distintas: oro (GLD), bonos largos (TLT), un sector defensivo (XLP) o un mercado emergente (EEM)."
    );
  }

  if (data.min_pair.correlation < 0.3) {
    sugg.push(
      `Buena pareja diversificadora: ${data.min_pair.a} vs ${data.min_pair.b} (ρ=${data.min_pair.correlation.toFixed(2)}). Mantén ambos.`
    );
  }

  if (data.missing_tickers.length > 0) {
    sugg.push(
      `Yahoo no encontró datos para: ${data.missing_tickers.join(", ")}. Comprueba el símbolo.`
    );
  }

  return sugg;
}

/**
 * Formato de porcentaje robusto para volatilidades.
 */
export function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}
