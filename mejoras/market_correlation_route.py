"""
ADD TO: backend/app/routers/market.py

Añade este endpoint a tu router de market existente (o donde tengas los endpoints
del screener). Sigue el patrón de POST /screener.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas import CorrelationRequest, CorrelationResponse
from app.services import market_service  # ajusta según tu estructura
from app.dependencies import get_current_user  # tu dep de auth JWT existente


# router = APIRouter(prefix="/api/market", tags=["market"])  ← ya lo tienes


@router.post(
    "/correlation",
    response_model=CorrelationResponse,
    summary="Matriz de correlación y diversification ratio de una cesta de tickers",
    description=(
        "Calcula la matriz de correlación de retornos diarios entre los tickers "
        "indicados, junto con la volatilidad de cartera y el diversification ratio. "
        "Si se aportan pesos se usan; si no, equiponderada."
    ),
)
async def get_correlation(
    request: CorrelationRequest,
    current_user=Depends(get_current_user),
) -> CorrelationResponse:
    try:
        return market_service.calculate_correlation_matrix(request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        # yfinance puede fallar por rate limiting. Devolvemos 503 para que el
        # frontend pueda retry o mostrar mensaje claro.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo calcular la correlación: {e}",
        )
