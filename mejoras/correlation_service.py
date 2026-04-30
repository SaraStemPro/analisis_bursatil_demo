"""
ADD TO: backend/app/services/market_service.py

Añade esta función al servicio existente. Reutiliza yfinance, numpy y el patrón
de cache (_coalesced_call / TTL) que ya tienes.

Asume que ya tienes importados: yfinance as yf, numpy as np, pandas as pd.
Si no, añade los imports al principio del archivo.
"""

import time
import threading
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

from app.schemas import (  # ajusta el import según tu __init__.py
    CorrelationRequest,
    CorrelationResponse,
    CorrelationPair,
)

# ─────────────────────────────────────────────────────────────────
# Cache específico para correlaciones.
# Clave: (sorted_tickers, period). TTL: 1h (los retornos diarios
# no cambian intradía y la matriz de correlación es estable).
# ─────────────────────────────────────────────────────────────────
_CORRELATION_TTL = 3600  # 1 hora
_correlation_cache: dict[tuple, tuple[float, dict]] = {}
_correlation_lock = threading.Lock()


def _correlation_cache_key(tickers: list[str], period: str) -> tuple:
    return (tuple(sorted(tickers)), period)


def _get_cached_correlation(tickers: list[str], period: str) -> Optional[dict]:
    key = _correlation_cache_key(tickers, period)
    with _correlation_lock:
        entry = _correlation_cache.get(key)
        if entry is None:
            return None
        ts, data = entry
        if time.time() - ts > _CORRELATION_TTL:
            return None
        return data


def _set_cached_correlation(tickers: list[str], period: str, data: dict) -> None:
    key = _correlation_cache_key(tickers, period)
    with _correlation_lock:
        _correlation_cache[key] = (time.time(), data)


# ─────────────────────────────────────────────────────────────────
# Cálculo principal
# ─────────────────────────────────────────────────────────────────
def calculate_correlation_matrix(req: CorrelationRequest) -> CorrelationResponse:
    """
    Descarga precios diarios ajustados de los tickers, calcula retornos
    porcentuales diarios, la matriz de correlación, volatilidades anualizadas
    y el diversification ratio de la cartera.

    Usa yf.download() en modo batch (más eficiente que iterar yf.Ticker).
    """
    tickers = req.tickers  # ya validados y uppercased
    period = req.period

    # Cache: solo cacheamos la matriz "base" sin pesos (la parte cara).
    # El cálculo dependiente de pesos (vol cartera, div ratio) es trivial
    # y se hace siempre fresco.
    cached = _get_cached_correlation(tickers, period)
    if cached is not None:
        base = cached
    else:
        base = _download_and_compute_base(tickers, period)
        if base is None:
            raise ValueError(
                "No se pudieron descargar datos para los tickers indicados"
            )
        _set_cached_correlation(tickers, period, base)

    # base contiene: matrix, valid_tickers, missing, individual_vols, n_observations
    valid_tickers: list[str] = base["valid_tickers"]
    missing: list[str] = base["missing"]
    matrix: np.ndarray = base["matrix"]  # NxN numpy array
    individual_vols: np.ndarray = base["individual_vols"]  # vector de N
    n_obs: int = base["n_observations"]

    n = len(valid_tickers)
    if n < 2:
        raise ValueError(
            f"Tras descartar tickers sin datos solo queda {n}; se necesitan al menos 2"
        )

    # ── Pesos ────────────────────────────────────────────────────
    # Filtrar pesos para los tickers válidos (excluyendo missing).
    if req.weights is None:
        weights = np.full(n, 1.0 / n)
    else:
        # Mapear pesos por ticker
        all_weights = dict(zip(req.tickers, req.weights))
        w_list = [all_weights[t] for t in valid_tickers]
        w_total = sum(w_list)
        if w_total <= 0:
            weights = np.full(n, 1.0 / n)
        else:
            weights = np.array([w / w_total for w in w_list])

    # ── Métricas agregadas ──────────────────────────────────────
    # Off-diagonal: extraemos triángulo superior sin la diagonal
    iu = np.triu_indices(n, k=1)
    off_diag = matrix[iu]
    avg_corr = float(np.mean(off_diag)) if off_diag.size > 0 else 0.0

    # Par max y min de correlación
    max_idx_flat = int(np.argmax(off_diag))
    min_idx_flat = int(np.argmin(off_diag))
    max_i, max_j = iu[0][max_idx_flat], iu[1][max_idx_flat]
    min_i, min_j = iu[0][min_idx_flat], iu[1][min_idx_flat]
    max_pair = CorrelationPair(
        a=valid_tickers[max_i],
        b=valid_tickers[max_j],
        correlation=float(matrix[max_i, max_j]),
    )
    min_pair = CorrelationPair(
        a=valid_tickers[min_i],
        b=valid_tickers[min_j],
        correlation=float(matrix[min_i, min_j]),
    )

    # ── Volatilidad de la cartera ────────────────────────────────
    # Σ = D · C · D, donde D = diag(σ_i)
    # σ²_p = w' Σ w
    cov = matrix * np.outer(individual_vols, individual_vols)
    portfolio_var = float(weights @ cov @ weights.T)
    portfolio_vol = float(np.sqrt(max(portfolio_var, 0.0)))

    # σ media ponderada (sería la vol si todas las correlaciones fueran +1)
    weighted_avg_vol = float(np.sum(weights * individual_vols))

    # Diversification ratio
    if portfolio_vol > 1e-9:
        div_ratio = weighted_avg_vol / portfolio_vol
    else:
        div_ratio = 1.0

    return CorrelationResponse(
        tickers=valid_tickers,
        period=period,
        matrix=[[float(round(matrix[i, j], 4)) for j in range(n)] for i in range(n)],
        avg_correlation=round(avg_corr, 4),
        max_pair=max_pair,
        min_pair=min_pair,
        individual_volatilities=[float(round(v, 4)) for v in individual_vols],
        portfolio_volatility=round(portfolio_vol, 4),
        weighted_avg_volatility=round(weighted_avg_vol, 4),
        diversification_ratio=round(div_ratio, 4),
        weights=[float(round(w, 4)) for w in weights],
        n_observations=n_obs,
        missing_tickers=missing,
    )


def _download_and_compute_base(tickers: list[str], period: str) -> Optional[dict]:
    """
    Descarga precios desde Yahoo Finance y calcula la matriz de correlación
    + volatilidades individuales. NO depende de los pesos.

    Returns dict con: matrix (np.ndarray), valid_tickers, missing,
    individual_vols (np.ndarray), n_observations (int).
    """
    try:
        # auto_adjust=True usa precios ajustados por dividendos/splits.
        # progress=False evita la barra de progreso en logs.
        # threads=True paraleliza (y yfinance ya lo gestiona internamente).
        df = yf.download(
            tickers=tickers,
            period=period,
            interval="1d",
            auto_adjust=True,
            progress=False,
            group_by="ticker",
            threads=True,
        )
    except Exception as e:
        # Logueamos pero no rompemos: dejamos que el endpoint devuelva 503
        print(f"[correlation] yf.download falló: {e}")
        return None

    if df is None or df.empty:
        return None

    # yfinance devuelve estructura distinta según número de tickers.
    # Si es 1 ticker, no agrupa por ticker. Aquí siempre tenemos >=2 (validado en schema).
    closes = pd.DataFrame()
    missing: list[str] = []
    for t in tickers:
        try:
            if isinstance(df.columns, pd.MultiIndex):
                serie = df[t]["Close"]
            else:
                serie = df["Close"]
            if serie is None or serie.dropna().empty:
                missing.append(t)
                continue
            closes[t] = serie
        except (KeyError, AttributeError):
            missing.append(t)

    if closes.shape[1] < 2:
        return None

    # Retornos diarios
    returns = closes.pct_change().dropna(how="all")
    # Eliminar columnas con muy pocos datos (<10 observaciones)
    valid_cols = [c for c in returns.columns if returns[c].dropna().shape[0] >= 10]
    extra_missing = [c for c in returns.columns if c not in valid_cols]
    missing.extend(extra_missing)
    returns = returns[valid_cols].dropna()

    if returns.shape[1] < 2 or returns.shape[0] < 10:
        return None

    valid_tickers = list(returns.columns)

    # Matriz de correlación
    corr_df = returns.corr()
    matrix = corr_df.to_numpy()
    # Forzar diagonal a 1 y simetría exacta (numérica)
    np.fill_diagonal(matrix, 1.0)
    matrix = (matrix + matrix.T) / 2

    # Volatilidad anualizada (252 días)
    individual_vols = (returns.std() * np.sqrt(252)).to_numpy()

    return {
        "matrix": matrix,
        "valid_tickers": valid_tickers,
        "missing": missing,
        "individual_vols": individual_vols,
        "n_observations": int(returns.shape[0]),
    }
