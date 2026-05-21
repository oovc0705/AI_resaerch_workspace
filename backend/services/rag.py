"""
RAG 检索服务模块。
提供基于 pgvector 的语义搜索（支持 chunk 级检索）、混合搜索（向量 + 关键词）和文档重排序功能。
使用余弦相似度（<=> 运算符）检索与查询最相关的文档。
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

logger = logging.getLogger(__name__)


def _make_default_ai_service():
    from services.ai import AIService

    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com")
    model = os.getenv("OPENAI_MODEL", "deepseek-chat")
    embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "deepseek-chat")

    return AIService(
        api_key=api_key,
        base_url=base_url,
        model=model,
        embedding_model=embedding_model,
    )


async def semantic_search(
    query: str,
    db: AsyncSession,
    top_k: int = 5,
    use_chunks: bool = True,
    ai_service=None,
) -> list[dict]:
    if ai_service is None:
        ai_service = _make_default_ai_service()

    query_embedding = await ai_service.create_embedding(query)
    query_embedding_str = str(query_embedding)

    if use_chunks:
        sql = text(
            """
            SELECT DISTINCT ON (ur.id)
                ur.id,
                ur.title,
                ur.url,
                cc.content,
                ur.summary,
                cc.id AS chunk_id,
                1 - (cc.embedding <=> :embedding) AS similarity
            FROM content_chunks cc
            JOIN url_records ur ON ur.id = cc.url_id
            WHERE cc.embedding IS NOT NULL
            ORDER BY ur.id, cc.embedding <=> :embedding
            LIMIT :top_k
            """
        )
    else:
        sql = text(
            """
            SELECT
                id, title, url, content, summary, NULL AS chunk_id,
                1 - (embedding <=> :embedding) AS similarity
            FROM url_records
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> :embedding
            LIMIT :top_k
            """
        )

    result = await db.execute(sql, {"embedding": query_embedding_str, "top_k": top_k})
    rows = result.fetchall()
    docs = [
        {
            "id": row.id,
            "title": row.title,
            "url": row.url,
            "content": row.content,
            "summary": row.summary,
            "similarity": round(float(row.similarity), 4),
            "chunk_id": getattr(row, "chunk_id", None),
        }
        for row in rows
    ]

    logger.info("语义搜索完成，查询: %s，返回 %d 条结果", query[:50], len(docs))
    return docs


async def hybrid_search(
    query: str,
    db: AsyncSession,
    top_k: int = 5,
    vector_weight: float = 0.7,
    keyword_weight: float = 0.3,
    ai_service=None,
) -> list[dict]:
    if ai_service is None:
        ai_service = _make_default_ai_service()

    query_embedding = await ai_service.create_embedding(query)
    query_embedding_str = str(query_embedding)

    candidate_sql = text(
        """
        SELECT DISTINCT ON (ur.id)
            ur.id, ur.title, ur.url,
            COALESCE(cc.content, ur.content) AS content,
            ur.summary,
            1 - (COALESCE(cc.embedding, ur.embedding) <=> :embedding) AS similarity
        FROM url_records ur
        LEFT JOIN content_chunks cc ON cc.url_id = ur.id
        WHERE ur.embedding IS NOT NULL OR cc.embedding IS NOT NULL
        ORDER BY ur.id, COALESCE(cc.embedding, ur.embedding) <=> :embedding
        LIMIT :limit
        """
    )

    result = await db.execute(candidate_sql, {"embedding": query_embedding_str, "limit": top_k * 3})
    rows = result.fetchall()

    query_keywords = _tokenize_keywords(query)

    scored_docs = []
    for row in rows:
        content_text = (row.content or "").lower()
        similarity = float(row.similarity) if row.similarity is not None else 0.0

        keyword_score = _compute_keyword_score(query_keywords, content_text)
        hybrid_score = vector_weight * similarity + keyword_weight * keyword_score

        scored_docs.append({
            "id": row.id,
            "title": row.title,
            "url": row.url,
            "content": row.content,
            "summary": row.summary,
            "similarity": round(similarity, 4),
            "keyword_score": round(keyword_score, 4),
            "hybrid_score": round(hybrid_score, 4),
        })

    scored_docs.sort(key=lambda d: d["hybrid_score"], reverse=True)
    top_docs = scored_docs[:top_k]

    logger.info(
        "混合搜索完成，查询: %s，候选 %d 条，返回 %d 条",
        query[:50], len(scored_docs), len(top_docs),
    )
    return top_docs


def _tokenize_keywords(text: str) -> list[str]:
    import re
    stopwords = {
        "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都",
        "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你",
        "会", "着", "没有", "看", "好", "自己", "这", "他", "她", "它",
        "the", "is", "a", "an", "to", "of", "in", "and", "for",
        "什么", "怎么", "如何", "为什么", "哪些", "哪个",
    }
    words = re.findall(r"[\u4e00-\u9fa5]+|[a-zA-Z0-9]+", text.lower())
    return [w for w in words if w not in stopwords and len(w) > 1]


def _compute_keyword_score(keywords: list[str], content: str) -> float:
    if not keywords or not content:
        return 0.0
    hits = sum(1 for kw in keywords if kw in content)
    return hits / len(keywords)


async def search_with_rerank(
    query: str,
    db: AsyncSession,
    top_k: int = 5,
    ai_service=None,
) -> list[dict]:
    if ai_service is None:
        ai_service = _make_default_ai_service()

    candidates = await hybrid_search(query, db, top_k=top_k * 2, ai_service=ai_service)

    if len(candidates) <= top_k:
        return candidates

    ranked = await ai_service.rank_documents(query, candidates)
    return ranked[:top_k]
