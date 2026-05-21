"""
FastAPI 依赖注入模块。
提供 get_ai_service 等可复用的依赖项，避免循环导入问题。
"""


def get_ai_service(request):
    """
    获取 AIService 实例。
    优先使用用户通过 POST /api/config 设置的配置，
    无配置时回退到 .env 默认配置。
    """
    from services.ai import AIService

    cfg = getattr(request.app.state, "ai_config", None)
    if cfg:
        return AIService(
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            model=cfg["model"],
            embedding_model=cfg["embedding_model"],
        )
    return request.app.state.ai_service
