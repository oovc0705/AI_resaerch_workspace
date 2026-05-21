"""
URL 记录 CRUD 路由模块。
提供 RESTful API 端点，支持创建、查询、删除 URL 记录，
以及 AI 处理（摘要、标签、embedding）和语义搜索功能。
路由前缀：/api/urls，标签：urls。
创建记录时自动抓取网页标题和正文内容，并异步触发 AI 处理。
"""

import logging
import math

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_ai_service
from models import Tag, UrlRecord
from schemas import URLBatchCreate, URLCreate, URLListResponse, URLResponse
from services.scraper import scrape_url

logger = logging.getLogger(__name__)

# 创建路由实例，设置前缀和标签
router = APIRouter(prefix="/api/urls", tags=["urls"])


def _format_scrape_error(e: Exception) -> str:
    """将抓取异常转换为用户友好的错误信息。"""
    name = type(e).__name__
    msg = str(e).strip()

    code_hints = {
        "403": "该网站拒绝访问（可能有反爬/WAF 保护，无法抓取）",
        "404": "页面不存在",
        "408": "请求超时",
        "429": "请求过于频繁，被暂时限制",
        "500": "目标服务器内部错误",
        "502": "目标服务器网关错误",
        "503": "目标服务器暂不可用",
    }

    for code, hint in code_hints.items():
        if code in msg:
            return f"{name}: {hint}"

    if msg:
        return f"{name}: {msg}"

    type_hints = {
        "ConnectTimeout": "连接超时（目标服务器无响应）",
        "ConnectError": "无法建立连接（DNS 解析失败或网络不通）",
        "ReadTimeout": "读取超时（服务器响应过慢）",
        "RemoteProtocolError": "服务器协议异常（可能是反爬拦截）",
        "SSLError": "SSL/TLS 证书验证失败",
        "PoolTimeout": "连接池已满，请求被拒绝",
        "UnsupportedProtocol": "不支持的协议（如纯 HTTP/2 站点）",
    }
    if name in type_hints:
        return f"{name}: {type_hints[name]}"

    return f"{name}（无详细信息）"


def _record_to_response(r: UrlRecord) -> dict:
    """将 ORM 记录转换为 API 响应字典，计算抓取状态并提取标签名。"""
    tag_names = [t.name for t in r.tags] if r.tags else []
    return {
        "id": r.id,
        "url": r.url,
        "title": r.title,
        "content": r.content,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "scraped": r.title is not None or r.content is not None,
        "error": r.error_msg,
        "summary": r.summary,
        "tags": tag_names,
    }




@router.post("", status_code=201)
async def create_url(body: URLCreate, db: AsyncSession = Depends(get_db), request: Request = None):
    """
    创建一条新的 URL 记录并自动抓取网页内容。
    - 接收 POST /api/urls，请求体为 {"url": "https://..."}
    - 自动校验 URL 格式（由 Pydantic HttpUrl 处理）
    - 如果 URL 已存在，返回 409 Conflict
    - 创建记录后，异步抓取网页标题和正文，更新到记录中
    - 抓取成功后，异步触发 AI 处理（摘要、标签、embedding），不阻塞响应
    - 抓取失败不影响记录的保存，API 仍返回 201 成功
    """
    # 将 Pydantic HttpUrl 转换为字符串存储
    url_str = str(body.url)

    # 检查 URL 是否已存在
    existing = await db.execute(select(UrlRecord).where(UrlRecord.url == url_str))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="该 URL 已存在")

    # 创建新记录，title 和 content 初始留空
    record = UrlRecord(url=url_str)
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # 初始化抓取状态：默认未抓取、无错误
    scraped = False
    error_msg: str | None = None

    try:
        result = await scrape_url(url_str)
        record.title = result["title"]
        record.content = result["content"]
        scraped = True
    except Exception as e:
        error_msg = _format_scrape_error(e)
        record.error_msg = error_msg
        import traceback
        print(f"\n[抓取失败] url={url_str}")
        traceback.print_exc()
        print(f"[格式化错误] {error_msg}\n")

    await db.commit()
    await db.refresh(record)

    # 抓取成功后，通过 Celery 异步触发 AI 处理（不阻塞响应）
    if scraped and record.content:
        from tasks.url_tasks import summarize_task, generate_tags_task, embedding_task
        from celery import chain
        chain(
            summarize_task.s(record.id),
            generate_tags_task.s(record.id),
            embedding_task.s(record.id),
        ).apply_async()

    return {
        "id": record.id,
        "url": record.url,
        "title": record.title,
        "content": record.content,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "scraped": scraped,
        "error": error_msg,
        "summary": record.summary,
        "tags": [t.name for t in record.tags] if record.tags else [],
    }


@router.get("", response_model=URLListResponse)
async def get_urls(
    q: str | None = Query(None, description="关键词搜索（匹配 url、title、content）"),
    page: int = Query(1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量，最大 100"),
    db: AsyncSession = Depends(get_db),
):
    """
    获取 URL 记录列表，支持关键词搜索和分页。
    - 如果提供 q 参数，在 url、title、content 三个字段中模糊匹配（ILIKE）
    - 搜索结果按匹配度排序（title 匹配优先于 content 匹配）
    - 如果未提供 q，按 created_at 倒序
    - 分页返回 {items, total, page, page_size, total_pages}
    """
    # 构建基础查询
    base_query = select(UrlRecord)

    # 关键词模糊搜索
    if q:
        pattern = f"%{q}%"
        base_query = base_query.where(
            UrlRecord.url.ilike(pattern)
            | UrlRecord.title.ilike(pattern)
            | UrlRecord.content.ilike(pattern)
        )

    # 统计总数
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 排序逻辑
    if q:
        pattern = f"%{q}%"
        # 按匹配度排序：title 匹配优先，其次是 url 匹配，最后是 content 匹配
        order_clause = case(
            (UrlRecord.title.ilike(pattern), 0),
            (UrlRecord.url.ilike(pattern), 1),
            else_=2,
        )
        base_query = base_query.order_by(order_clause, UrlRecord.created_at.desc())
    else:
        base_query = base_query.order_by(UrlRecord.created_at.desc())

    # 分页：offset/limit
    offset = (page - 1) * page_size
    base_query = base_query.offset(offset).limit(page_size)

    result = await db.execute(base_query)
    records = result.scalars().all()

    # 计算总页数
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

    return URLListResponse(
        items=[_record_to_response(r) for r in records],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.delete("/{url_id}", status_code=204)
async def delete_url(url_id: int, db: AsyncSession = Depends(get_db)):
    """
    删除指定 id 的 URL 记录。
    - 接收 DELETE /api/urls/{url_id}
    - 记录不存在时返回 404 Not Found
    - 成功删除后返回 204 No Content
    """
    result = await db.execute(select(UrlRecord).where(UrlRecord.id == url_id))
    record = result.scalar_one_or_none()

    if record is None:
        raise HTTPException(status_code=404, detail="URL 记录不存在")

    await db.delete(record)
    await db.commit()


@router.post("/{url_id}/process-ai")
async def process_ai(url_id: int, db: AsyncSession = Depends(get_db), request: Request = None):
    """
    手动触发某条 URL 记录的 AI 处理（摘要、标签、embedding）。

    用于对之前添加但未自动处理的记录进行 AI 处理。
    - 接收 POST /api/urls/{url_id}/process-ai
    - 记录不存在时返回 404
    - 记录没有内容时返回 400
    - AI 处理完成后返回更新后的 URLResponse

    返回：
        处理后的 URLResponse，包含 summary、tags 等字段
    """
    result = await db.execute(select(UrlRecord).where(UrlRecord.id == url_id))
    record = result.scalar_one_or_none()

    if record is None:
        raise HTTPException(status_code=404, detail="URL 记录不存在")

    if not record.content:
        raise HTTPException(status_code=400, detail="该记录没有内容，无法进行 AI 处理")

    ai_service = get_ai_service(request) if request else None
    if ai_service is None:
        raise HTTPException(status_code=500, detail="AI 服务未初始化")

    try:
        # 第一步：生成摘要
        summary = await ai_service.summarize(record.content)
        record.summary = summary
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"摘要生成失败: {str(e)}")

    try:
        # 第二步：生成标签
        tag_names = await ai_service.generate_tags(record.content)
        for name in tag_names:
            tag_result = await db.execute(select(Tag).where(Tag.name == name))
            tag = tag_result.scalar_one_or_none()
            if tag is None:
                tag = Tag(name=name)
                db.add(tag)
                await db.flush()
            if tag not in record.tags:
                record.tags.append(tag)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"标签生成失败: {str(e)}")

    try:
        embed_text = f"{record.title or ''}\n{record.content[:8000]}"
        embedding = await ai_service.create_embedding(embed_text)
        record.embedding = embedding
    except Exception as e:
        logger.warning("记录 %d embedding 生成失败（非致命）: %s", url_id, str(e))

    await db.commit()
    await db.refresh(record)
    return _record_to_response(record)


@router.get("/search/semantic")
async def semantic_search_endpoint(
    q: str = Query(..., description="语义搜索查询文本"),
    top_k: int = Query(5, ge=1, le=20, description="返回结果数量，默认 5"),
    db: AsyncSession = Depends(get_db),
):
    """
    语义搜索端点。

    使用 embedding 向量进行相似内容检索，返回最相关的 URL 记录。
    - 接收 GET /api/urls/search/semantic?q=查询文本&top_k=5
    - 将查询文本转为 embedding 向量
    - 使用 pgvector 余弦相似度检索最相关的记录
    - 返回 List[URLResponse]

    参数：
        q: 查询文本（必填）
        top_k: 返回结果数量（可选，默认 5，最大 20）
    """
    from services.rag import semantic_search

    docs = await semantic_search(q, db, top_k=top_k)

    # 将搜索结果转为 URLResponse 格式
    items = []
    for doc in docs:
        items.append({
            "id": doc["id"],
            "url": doc["url"],
            "title": doc["title"],
            "content": doc["content"],
            "created_at": None,
            "updated_at": None,
            "scraped": doc["content"] is not None,
            "error": None,
            "summary": doc.get("summary"),
            "tags": [],
        })

    return items


@router.post("/batch", status_code=202)
async def create_urls_batch(body: URLBatchCreate, db: AsyncSession = Depends(get_db)):
    """
    批量创建 URL 记录，并通过 Celery 异步抓取和 AI 处理。

    - 接收 POST /api/urls/batch，请求体为 {"urls": ["https://...", ...]}
    - 每个 URL 创建记录后，通过 Celery 链式任务异步执行：抓取 → 摘要 → 标签 → embedding
    - 重复 URL 跳过并记录
    - 返回 202 Accepted，包含 task_ids 供后续查询

    返回：
        {"total": int, "task_ids": list[str], "records": list[dict]}
    """
    url_list = body.urls
    records_created = []
    task_ids = []

    for item in url_list:
        url_str = str(item) if not isinstance(item, str) else item
        existing = await db.execute(select(UrlRecord).where(UrlRecord.url == url_str))
        if existing.scalar_one_or_none() is not None:
            records_created.append({"url": url_str, "status": "skipped", "reason": "已存在"})
            continue

        record = UrlRecord(url=url_str)
        db.add(record)
        await db.commit()
        await db.refresh(record)

        from tasks.url_tasks import scrape_and_process_task
        result = scrape_and_process_task.delay(record.id, url_str)
        task_ids.append(result.id)
        records_created.append({"id": record.id, "url": url_str, "status": "enqueued"})

    return {"total": len(records_created), "task_ids": task_ids, "records": records_created}
