// frontend/src/components/screener/CorrelationPanel.tsx
//
// Panel principal a integrar en pages/Screener.tsx, dentro del simulador de cartera.
// Permite al alumno calcular la correlación de su selección actual.

import { useState } from "react";
import { useCorrelation, type CorrelationPeriod } from "@/hooks/useCorrelation";
import { CorrelationHeatmap } from "./CorrelationHeatmap";
import {
  diagnoseAvgCorrelation,
  diagnoseDiversificationRatio,
  getSuggestions,
  fmtPct,
} from "@/lib/correlationInterpretation";

interface Props {
  /** Tickers seleccionados en el simulador del screener */
  tickers: string[];
  /**
   * Pesos opcionales (importes, cantidades o porcentajes).
   * Se normalizan en backend.
   */
  weights?: number[];
}

const PERIOD_OPTIONS: { value: CorrelationPeriod; label: string }[] = [
  { value: "3mo", label: "3 meses" },
  { value: "6mo", label: "6 meses" },
  { value: "1y",  label: "1 año" },
  { value: "2y",  label: "2 años" },
  { value: "5y",  label: "5 años" },
];

export function CorrelationPanel({ tickers, weights }: Props) {
  const [period, setPeriod] = useState<CorrelationPeriod>("6mo");
  const correlation = useCorrelation();

  const canCalc = tickers.length >= 2 && tickers.length <= 30;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Análisis de correlación
          </h2>
          <p className="mt-1 text-sm text-slate-500 max-w-prose">
            ¿Tu cartera está diversificada de verdad o tienes 10 acciones
            que se mueven a la vez? Calcula la correlación entre los activos
            seleccionados y descubre si estás cubierto o solo aparentemente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-mono uppercase tracking-wider text-slate-500">
            Período
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as CorrelationPeriod)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              correlation.mutate({ tickers, period, weights })
            }
            disabled={!canCalc || correlation.isPending}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {correlation.isPending ? "Calculando…" : "Calcular correlación"}
          </button>
        </div>
      </div>

      {!canCalc && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Selecciona entre 2 y 30 activos para calcular la correlación.
        </div>
      )}

      {correlation.isError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          No se pudo calcular: {correlation.error.message}
        </div>
      )}

      {correlation.data && (
        <CorrelationResults data={correlation.data} />
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// RESULTADOS
// ────────────────────────────────────────────────────────────────

interface ResultsProps {
  data: import("@/hooks/useCorrelation").CorrelationResponse;
}

function CorrelationResults({ data }: ResultsProps) {
  const avgDiagnosis = diagnoseAvgCorrelation(data.avg_correlation);
  const drDiagnosis = diagnoseDiversificationRatio(data.diversification_ratio);
  const suggestions = getSuggestions(data);

  // Riesgo evitado por la diversificación
  const riskAvoided = data.weighted_avg_volatility - data.portfolio_volatility;
  const riskAvoidedPct =
    data.weighted_avg_volatility > 0
      ? (riskAvoided / data.weighted_avg_volatility) * 100
      : 0;

  return (
    <div className="space-y-5">
      {/* KPIs principales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          label="Correlación media"
          value={data.avg_correlation.toFixed(2)}
          sub="entre todos los pares"
          diagnosis={avgDiagnosis}
        />
        <KPI
          label="Diversification ratio"
          value={data.diversification_ratio.toFixed(2)}
          sub="σ media ponderada / σ cartera"
          diagnosis={drDiagnosis}
        />
        <KPI
          label="Vol. cartera anualizada"
          value={fmtPct(data.portfolio_volatility)}
          sub={`vs ${fmtPct(data.weighted_avg_volatility)} si ρ=+1`}
        />
        <KPI
          label="Riesgo evitado"
          value={`${riskAvoidedPct.toFixed(1)}%`}
          sub="reducción por diversificar"
        />
      </div>

      {/* Diagnóstico textual */}
      <div className="grid gap-3 md:grid-cols-2">
        <DiagnosisBox
          title="Tu correlación media"
          value={data.avg_correlation.toFixed(2)}
          diagnosis={avgDiagnosis}
        />
        <DiagnosisBox
          title="Tu diversification ratio"
          value={data.diversification_ratio.toFixed(2)}
          diagnosis={drDiagnosis}
        />
      </div>

      {/* Pares destacados */}
      <div className="grid gap-3 md:grid-cols-2">
        <PairCard
          tone="warning"
          title="Par más correlacionado"
          tickerA={data.max_pair.a}
          tickerB={data.max_pair.b}
          rho={data.max_pair.correlation}
          note="Estos dos aportan información casi idéntica a tu cartera."
        />
        <PairCard
          tone="success"
          title="Par menos correlacionado"
          tickerA={data.min_pair.a}
          tickerB={data.min_pair.b}
          rho={data.min_pair.correlation}
          note="Esta pareja sí está diversificando de verdad."
        />
      </div>

      {/* Heatmap */}
      <CorrelationHeatmap data={data} />

      {/* Sugerencias */}
      {suggestions.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Sugerencias
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metainformación */}
      <div className="text-xs text-slate-500 font-mono">
        Calculado sobre {data.n_observations} días de retornos · período{" "}
        {data.period} · datos de Yahoo Finance
        {data.missing_tickers.length > 0 && (
          <span className="ml-2 text-amber-600">
            · sin datos para: {data.missing_tickers.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SUBCOMPONENTES
// ────────────────────────────────────────────────────────────────

interface KPIProps {
  label: string;
  value: string;
  sub: string;
  diagnosis?: { color: string };
}

function KPI({ label, value, sub, diagnosis }: KPIProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${
          diagnosis?.color ?? "text-slate-900"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

interface DiagnosisBoxProps {
  title: string;
  value: string;
  diagnosis: ReturnType<typeof diagnoseAvgCorrelation>;
}

function DiagnosisBox({ title, value, diagnosis }: DiagnosisBoxProps) {
  return (
    <div className={`rounded-md border-2 p-4 ${diagnosis.bgColor}`}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className={`text-xs font-mono uppercase ${diagnosis.color}`}>
          {diagnosis.label}
        </span>
      </div>
      <div className={`mt-1 text-xl font-bold ${diagnosis.color}`}>{value}</div>
      <p className="mt-2 text-sm text-slate-700 leading-relaxed">
        {diagnosis.message}
      </p>
    </div>
  );
}

interface PairCardProps {
  tone: "warning" | "success";
  title: string;
  tickerA: string;
  tickerB: string;
  rho: number;
  note: string;
}

function PairCard({ tone, title, tickerA, tickerB, rho, note }: PairCardProps) {
  const styles =
    tone === "warning"
      ? "border-amber-300 bg-amber-50"
      : "border-emerald-300 bg-emerald-50";
  return (
    <div className={`rounded-md border-2 p-4 ${styles}`}>
      <div className="text-xs font-mono uppercase tracking-wider text-slate-600">
        {title}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono font-semibold text-slate-900">
          {tickerA}
        </span>
        <span className="text-slate-400">↔</span>
        <span className="font-mono font-semibold text-slate-900">
          {tickerB}
        </span>
        <span className="ml-auto text-2xl font-bold tabular-nums text-slate-900">
          {rho.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600 leading-relaxed">{note}</p>
    </div>
  );
}
