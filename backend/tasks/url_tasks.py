"""
URL 处理 Celery 任务模块。
定义抓取、摘要、标签、embedding 及链式任务。
每个任务在独立的 asyncio 事件循环中执行异步数据库操作。
"""

import asyncio
import logging
import os
import traceback
from pathlib import Path

from celery import chain
from dotenv import load_dotenv

from tasks.celery_app import celery_app

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=2, default_retry_delay=3)
def scrape_task(self, record_id: int, url_str: str):
    """
    抓取网页内容并更新 URL 记录。

    参数：
        record_id: URL 记录的数据库 ID
        url_str: 要抓取的 URL 字符串

    返回：
        {"record_id": int, "scraped": bool, "error": str|None}
    """
    from services.scraper import scrape_url
    from models import UrlRecord
    from sqlalchemy import select
    from database import _get_sessionmaker

    async def _run():
        async with _get_sessionmaker()() as db:
            try:
                result = await db.execute(select(UrlRecord).where(UrlRecord.id == record_id))
                record = result.scalar_one_or_none()
                if record is None:
                    return {"record_id": record_id, "scraped": False, "error": "记录不存在"}

                try:
                    scrape_result = await scrape_url(url_str)
                    record.title = scrape_result["title"]
                    record.content = scrape_result["content"]
                    await db.commit()
                    logger.info("任务 scrape_task: 记录 %d 抓取成功", record_id)
                    return {"record_id": record_id, "scraped": True, "error": None}
                except Exception as e:
                    record.error_msg = str(e)[:1024]
                    await db.commit()
                    logger.error("任务 scrape_task: 记录 %d 抓取失败: %s", record_id, str(e))
                    return {"record_id": record_id, "scraped": False, "error": str(e)}
            except Exception as e:
                logger.error("任务 scrape_task: 记录 %d 异常: %s", record_id, str(e))
                raise

    return _run_async(_run())


@celery_app.task(bind=True, max_retries=2, default_retry_delay=5)
def summarize_task(self, record_id: int):
    """
    为已抓取的 URL 记录生成 AI 摘要。

    参数：
        record_id: URL 记录的数据库 ID

    返回：
        {"record_id": int, "summary": str|None}
    """
    from models import UrlRecord
    from sqlalchemy import select
    from database import _get_sessionmaker
    from services.ai import AIService

    async def _run():
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "")
        model = os.getenv("OPENAI_MODEL", "deepseek-chat")

        async with _get_sessionmaker()() as db:
            result = await db.execute(select(UrlRecord).where(UrlRecord.id == record_id))
            record = result.scalar_one_or_none()
            if record is None or not record.content:
                return {"record_id": record_id, "summary": None}

            ai = AIService(api_key=api_key, base_url=base_url, model=model)
            summary = await ai.summarize(record.content)
            record.summary = summary
            await db.commit()
            logger.info("任务 summarize_task: 记录 %d 摘要完成", record_id)
            return {"record_id": record_id, "summary": summary}

    return _run_async(_run())


@celery_app.task(bind=True, max_retries=2, default_retry_delay=5)
def generate_tags_task(self, record_id: int):
    """
    为已抓取的 URL 记录生成 AI 标签。

    参数：
        record_id: URL 记录的数据库 ID

    返回：
        {"record_id": int, "tags": list[str]}
    """
    from models import Tag, UrlRecord
    from sqlalchemy import select
    from database import _get_sessionmaker
    from services.ai import AIService

    async def _run():
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "")
        model = os.getenv("OPENAI_MODEL", "deepseek-chat")

        async with _get_sessionmaker()() as db:
            result = await db.execute(select(UrlRecord).where(UrlRecord.id == record_id))
            record = result.scalar_one_or_none()
            if record is None or not record.content:
                return {"record_id": record_id, "tags": []}

            ai = AIService(api_key=api_key, base_url=base_url, model=model)
            tag_names = await ai.generate_tags(record.content)

            for name in tag_names:
                tag_result = await db.execute(select(Tag).where(Tag.name == name))
                tag = tag_result.scalar_one_or_none()
                if tag is None:
                    tag = Tag(name=name)
                    db.add(tag)
                    await db.flush()
                if tag not in record.tags:
                    record.tags.append(tag)

            await db.commit()
            logger.info("任务 generate_tags_task: 记录 %d 标签完成: %s", record_id, tag_names)
            return {"record_id": record_id, "tags": tag_names}

    return _run_async(_run())


@celery_app.task(bind=True, max_retries=2, default_retry_delay=5)
def embedding_task(self, record_id: int):
    """
    为 URL 记录的内容分块生成 embedding 向量。
    同时更新 UrlRecord.embedding（兼容旧逻辑）并为每个 chunk 存向量。

    参数：
        record_id: URL 记录的数据库 ID

    返回：
        {"record_id": int, "chunk_count": int}
    """
    from models import ContentChunk, UrlRecord
    from sqlalchemy import select, delete
    from database import _get_sessionmaker
    from services.ai import AIService
    from services.scraper import chunk_content

    async def _run():
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "")
        embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002")

        async with _get_sessionmaker()() as db:
            result = await db.execute(select(UrlRecord).where(UrlRecord.id == record_id))
            record = result.scalar_one_or_none()
            if record is None or not record.content:
                return {"record_id": record_id, "chunk_count": 0}

            ai = AIService(api_key=api_key, base_url=base_url, embedding_model=embedding_model)

            chunks = chunk_content(record.content)
            embed_text = f"{record.title or ''}\n{record.content[:8000]}"
            record.embedding = await ai.create_embedding(embed_text)

            await db.execute(delete(ContentChunk).where(ContentChunk.url_id == record_id))

            for i, chunk_text in enumerate(chunks):
                if not chunk_text.strip():
                    continue
                emb = await ai.create_embedding(chunk_text)
                chunk = ContentChunk(
                    url_id=record_id,
                    chunk_index=i,
                    content=chunk_text,
                    embedding=emb,
                )
                db.add(chunk)

            await db.commit()
            logger.info("任务 embedding_task: 记录 %d 完成，分 %d 块", record_id, len(chunks))
            return {"record_id": record_id, "chunk_count": len(chunks)}

    return _run_async(_run())


@celery_app.task(bind=True, max_retries=2, default_retry_delay=3)
def scrape_and_process_task(self, record_id: int, url_str: str):
    """
    链式任务入口：先抓取，成功后依次执行摘要、标签、embedding。

    参数：
        record_id: URL 记录的数据库 ID
        url_str: 要抓取的 URL 字符串

    返回：
        Celery AsyncResult
    """
    workflow = chain(
        scrape_task.s(record_id, url_str),
        summarize_task.s(record_id),
        generate_tags_task.s(record_id),
        embedding_task.s(record_id),
    )
    return workflow.apply_async()


@celery_app.task(bind=True)
def batch_scrape_and_process(self, record_ids: list[int], url_map: dict[int, str]):
    """
    批量抓取并处理多个 URL。

    参数：
        record_ids: URL 记录的数据库 ID 列表
        url_map: {record_id: url_str} 映射

    返回：
        {"total": int, "task_ids": list[str]}
    """
    task_ids = []
    for rid in record_ids:
        url_str = url_map.get(str(rid), url_map.get(rid, ""))
        result = scrape_and_process_task.delay(rid, url_str)
        task_ids.append(result.id)
    return {"total": len(task_ids), "task_ids": task_ids}
