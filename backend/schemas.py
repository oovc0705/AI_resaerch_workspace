"""
Pydantic v2 数据校验模型（Schemas）。
定义 API 请求体与响应体的数据结构，自动校验输入、序列化输出。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


class URLCreate(BaseModel):
    url: HttpUrl


class URLBatchCreate(BaseModel):
    urls: list[HttpUrl]


class URLBatchResponse(BaseModel):
    total: int
    task_ids: list[str]
    records: list[dict]


class URLScrapeResult(BaseModel):
    title: str | None = None
    content: str | None = None
    error: str | None = None


class URLResponse(BaseModel):
    id: int
    url: str
    title: str | None
    content: str | None
    created_at: datetime
    updated_at: datetime
    scraped: bool = False
    error: str | None = None
    summary: str | None = None
    tags: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class URLSearchParams(BaseModel):
    q: str | None = None
    page: int = 1
    page_size: int = 20


class URLListResponse(BaseModel):
    items: list[URLResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class QARequest(BaseModel):
    question: str
    top_k: int = 5


class QAFileItem(BaseModel):
    filename: str
    content: str


class QAFilesRequest(BaseModel):
    question: str
    files: list[QAFileItem] = []
    top_k: int = 5


class QAResponse(BaseModel):
    answer: str
    sources: list[dict]


class ProcessAIResponse(BaseModel):
    id: int
    url: str
    title: str | None
    content: str | None
    created_at: datetime
    updated_at: datetime
    scraped: bool = False
    error: str | None = None
    summary: str | None = None
    tags: list[str] = []

    model_config = ConfigDict(from_attributes=True)
