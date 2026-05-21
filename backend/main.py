"""
FastAPI 应用入口模块。
创建 FastAPI 实例，配置 CORS、注册路由、处理应用生命周期。
启动时自动初始化数据库表结构和 AI 服务。
"""

import asyncio
import os

import uvicorn
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers.config import router as config_router
from routers.tasks import router as tasks_router
from routers.urls import router as urls_router
from routers.qa import router as qa_router

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

app = FastAPI(title="AI Research Workspace")

# 配置 CORS 中间件，允许前端开发服务器跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 URL 记录路由
app.include_router(urls_router)
# 注册问答路由
app.include_router(qa_router)
app.include_router(tasks_router)
app.include_router(config_router)


@app.on_event("startup")
async def startup():
    asyncio.create_task(_init_db())

    from services.ai import AIService

    api_key = os.getenv("OPENAI_API_KEY", "sk-d6fbf8811eb1465ba3218330bf72ad01")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com")
    model = os.getenv("OPENAI_MODEL", "deepseek-chat")
    embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "deepseek-chat")

    app.state.ai_service = AIService(
        api_key=api_key,
        base_url=base_url,
        model=model,
        embedding_model=embedding_model,
    )
    print(f"[启动] AI 服务已初始化，对话模型: {model}, embedding模型: {embedding_model}")


async def _init_db():
    try:
        await init_db()
        print("[启动] 数据库表初始化完成")
    except Exception as e:
        print(f"[启动] 数据库初始化失败（服务仍可启动）: {e}")


@app.get("/")
async def root():
    """根路径健康检查接口，返回服务状态。"""
    return {"status": "ok"}


if __name__ == "__main__":
    # 开发环境直接运行此文件时，使用 uvicorn 启动服务器
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
