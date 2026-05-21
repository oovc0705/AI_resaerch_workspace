"""
异步数据库引擎配置模块。
使用 SQLAlchemy async engine 连接 PostgreSQL 数据库，
提供异步会话生成器、自动建表功能和自动迁移。
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://用户:密码@localhost:5432/数据库")

_engine = None
_async_sessionmaker = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            DATABASE_URL,
            echo=True,
            connect_args={
                "timeout": 10,
                "command_timeout": 10,
            },
            pool_pre_ping=True,
            pool_timeout=10,
        )
    return _engine


def _get_sessionmaker():
    global _async_sessionmaker
    if _async_sessionmaker is None:
        _async_sessionmaker = async_sessionmaker(
            _get_engine(), class_=AsyncSession, expire_on_commit=False
        )
    return _async_sessionmaker


async def get_db() -> AsyncSession:
    """
    异步生成器函数，用于 FastAPI 依赖注入。
    每次请求创建一个新的数据库会话，请求结束后自动关闭。
    """
    async with _get_sessionmaker()() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """
    异步初始化数据库，自动创建表和字段。
    1. 注册 pgvector 扩展
    2. 创建不存在的表
    3. 对已存在的表，添加模型中定义但表中尚不存在的列
    在应用启动时调用，确保表结构与模型定义一致。
    """
    from models import Base, ContentChunk, Tag, UrlRecord

    async with _get_engine().begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

        for table_name, model in [("url_records", UrlRecord), ("content_chunks", ContentChunk)]:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = :table_name"
                ),
                {"table_name": table_name},
            )
            existing_columns = {row[0] for row in result.fetchall()}

            for col in model.__table__.columns:
                if col.name not in existing_columns:
                    col_type = col.type.compile(_get_engine().dialect)
                    nullable = "" if col.nullable else " NOT NULL"
                    default_clause = ""
                    if col.default:
                        default_clause = f" DEFAULT {col.default.arg}"
                    sql = (
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN IF NOT EXISTS {col.name} {col_type}{nullable}{default_clause}"
                    )
                    await conn.execute(text(sql))
                    print(f"[迁移] {table_name} 表已添加 {col.name} 列")
