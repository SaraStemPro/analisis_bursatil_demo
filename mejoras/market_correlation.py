"""
ADD TO: backend/app/schemas/market.py

Añade estos schemas al final de tu market.py actual.
También recuerda re-exportarlos en schemas/__init__.py:

    from .market import (
        ...
        CorrelationRequest,
        CorrelationResponse,
        CorrelationPair,
    )
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


# Períodos válidos para análisis de correlación.
# Coherentes con yfinance (no incluimos 1mo: muy pocos datos para correlaciones estables).
CorrelationPeriod = Literal["3mo", "6mo", "1y", "2y", "5y"]


class CorrelationRequest(BaseModel):
    """Petición de matriz de correlación entre N tickers.

    - tickers: 2-30 símbolos (límite por rendimiento de yfinance batch)
    - period: ventana temporal de los retornos diarios usados
    - weights: opcional. Si se aportan, calculamos también la volatilidad
      de la cartera, la volatilidad media ponderada y el diversification ratio.
      Si no se aportan, se asume equiponderada.
    """
    tickers: list[str] = Field(..., min_length=2, max_length=30)
    period: CorrelationPeriod = "6mo"
    weights: Optional[list[float]] = None

    @model_validator(mode="after")
    def _validate(self):
        # Tickers únicos (case-insensitive) + uppercase
        seen = set()
        cleaned = []
        for t in self.tickers:
            tu = t.strip().upper()
            if not tu or tu in seen:
                continue
            seen.add(tu)
            cleaned.append(tu)
        if len(cleaned) < 2:
            raise ValueError("Se requieren al menos 2 tickers únicos")
        self.tickers = cleaned

        # Validar pesos
        if self.weights is not None:
            if len(self.weights) != len(self.tickers):
                raise ValueError("weights debe tener la misma longitud que tickers")
            if any(w < 0 for w in self.weights):
                raise ValueError("weights no puede contener valores negativos")
            total = sum(self.weights)
            if total <= 0:
                raise ValueError("La suma de weights debe ser positiva")
            # Normalizamos a 1
            self.weights = [w / total for w in self.weights]
        return self


class CorrelationPair(BaseModel):
    """Par de tickers con su coeficiente de correlación."""
    a: str
    b: str
    correlation: float

    model_config = {"from_attributes": True}


class CorrelationResponse(BaseModel):
    """Respuesta del análisis de correlación.

    matrix[i][j] = correlación entre tickers[i] y tickers[j].
    Diagonal = 1.0. Simétrica.

    Métricas agregadas:
    - avg_correlation: media de las correlaciones off-diagonal (la "correlación interna" de la cartera).
      Es la métrica clave: si es alta, la cartera no está diversificada de verdad.
    - max_pair / min_pair: para señalar al alumno qué pares "no aportan" (max) y cuáles
      sí están aportando diversificación real (min).
    - portfolio_volatility: σ anualizada de la cartera (con pesos aplicados o equiponderada).
    - weighted_avg_volatility: σ media ponderada de los activos (= la σ que tendría la cartera
      si TODAS las correlaciones fueran +1).
    - diversification_ratio: weighted_avg_volatility / portfolio_volatility.
      >1 = la diversificación está reduciendo riesgo. <1.1 = casi nula.
      ~1.4–1.6 = buena. >1.7 = excelente (raro fuera de carteras multi-clase).
    - missing_tickers: símbolos que yfinance no pudo descargar (excluidos del cálculo).
    """
    tickers: list[str]
    period: str
    matrix: list[list[float]]
    avg_correlation: float
    max_pair: CorrelationPair
    min_pair: CorrelationPair
    individual_volatilities: list[float]  # σ anualizada de cada ticker
    portfolio_volatility: float
    weighted_avg_volatility: float
    diversification_ratio: float
    weights: list[float]  # los pesos efectivamente usados (normalizados)
    n_observations: int  # nº de días de retornos efectivos (para que el alumno vea la solidez)
    missing_tickers: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}
