"""
API 配置路由模块。
提供用户自定义 LLM 配置的读取与存储端点。
路由前缀：/api/config，标签：config。
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/config", tags=["config"])


class ApiConfigBody(BaseModel):
    api_key: str
    base_url: str
    model: str
    embedding_model: str


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "*" * 4
    return key[:4] + "****" + key[-4:]


@router.get("")
async def get_config(request: Request):
    cfg = getattr(request.app.state, "ai_config", None)
    if cfg is None:
        return {"configured": False, "api_key": None, "base_url": None, "model": None, "embedding_model": None}
    return {
        "configured": True,
        "api_key": _mask_key(cfg["api_key"]),
        "base_url": cfg["base_url"],
        "model": cfg["model"],
        "embedding_model": cfg["embedding_model"],
    }


@router.post("")
async def set_config(body: ApiConfigBody, request: Request):
    request.app.state.ai_config = {
        "api_key": body.api_key,
        "base_url": body.base_url,
        "model": body.model,
        "embedding_model": body.embedding_model,
    }
    return {"status": "ok", "model": body.model, "embedding_model": body.embedding_model}


@router.post("/test")
async def test_config(body: ApiConfigBody):
    from services.ai import AIService

    try:
        ai = AIService(
            api_key=body.api_key,
            base_url=body.base_url,
            model=body.model,
            embedding_model=body.embedding_model,
        )
        result = await ai.summarize("Hello, this is a connection test.")
        return {"status": "ok", "message": "连接成功" if result else "连接成功（返回为空）"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
