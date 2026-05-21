"""
问答路由模块。
提供基于 RAG 的知识库智能问答 API。
路由前缀：/api/qa，标签：qa。
流程：混合搜索（带重排序） → 构建上下文 → LLM 回答。
AI 配置优先使用用户通过 /api/config 设置的，无则回退 .env。
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_ai_service
from schemas import QARequest, QAFilesRequest, QAResponse

router = APIRouter(prefix="/api/qa", tags=["qa"])


@router.post("/ask", response_model=QAResponse)
async def ask_question(
    body: QARequest,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    from services.rag import search_with_rerank

    ai_service = get_ai_service(request) if request else None
    if ai_service is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI 服务未初始化")

    docs = await search_with_rerank(body.question, db, top_k=body.top_k, ai_service=ai_service)

    context_docs = [
        {"title": doc["title"], "content": doc["content"]}
        for doc in docs
    ]

    answer = await ai_service.answer_question(body.question, context_docs)

    sources = [
        {"id": doc["id"], "title": doc["title"], "url": doc["url"]}
        for doc in docs
    ]

    return QAResponse(answer=answer, sources=sources)


@router.post("/ask-with-files", response_model=QAResponse)
async def ask_with_files(
    body: QAFilesRequest,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    from services.rag import search_with_rerank

    ai_service = get_ai_service(request) if request else None
    if ai_service is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="AI 服务未初始化")

    docs = await search_with_rerank(body.question, db, top_k=body.top_k, ai_service=ai_service)

    context_docs = [
        {"title": doc["title"], "content": doc["content"]}
        for doc in docs
    ]

    for f in body.files:
        context_docs.append({
            "title": f"[上传文件] {f.filename}",
            "content": f.content[:4000],
        })

    answer = await ai_service.answer_question(body.question, context_docs)

    sources = [
        {"id": doc["id"], "title": doc["title"], "url": doc["url"]}
        for doc in docs
    ]

    return QAResponse(answer=answer, sources=sources)
