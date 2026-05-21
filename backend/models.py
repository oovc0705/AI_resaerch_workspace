"""
数据模型模块 —— 定义 UrlRecord、ContentChunk、Tag ORM 模型及关联表。
映射到 PostgreSQL 的 url_records、content_chunks、tags、url_tags 表，
存储用户保存的 URL 记录、分块内容与 embedding、AI 生成的标签。
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import UserDefinedType


EMBEDDING_DIM = 1024


class LazyVector(UserDefinedType):
    cache_ok = True

    def __init__(self, dim=None):
        super().__init__()
        self.dim = dim if dim is not None else EMBEDDING_DIM

    def get_col_spec(self, **kw):
        return f"vector({self.dim})" if self.dim else "vector"

    def bind_processor(self, dialect):
        def process(value):
            if value is None:
                return None
            if isinstance(value, list):
                return "[" + ",".join(str(float(v)) for v in value) + "]"
            return str(value)
        return process

    def result_processor(self, dialect, coltype):
        def process(value):
            if value is None:
                return None
            if hasattr(value, "tolist"):
                return value.tolist()
            if isinstance(value, str):
                return [float(x) for x in value.strip("[]").split(",") if x.strip()]
            return list(value) if value is not None else None
        return process


class Base(DeclarativeBase):
    pass


url_tags = Table(
    "url_tags",
    Base.metadata,
    Column("url_id", ForeignKey("url_records.id"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True),
)


class UrlRecord(Base):
    __tablename__ = "url_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(String(2048), nullable=False, unique=True, index=True)
    title = Column(String(512), nullable=True)
    content = Column(Text, nullable=True)
    error_msg = Column(String(1024), nullable=True)
    summary = Column(Text, nullable=True)
    embedding = Column(LazyVector(), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tags = relationship("Tag", secondary=url_tags, back_populates="urls", lazy="selectin")
    chunks = relationship("ContentChunk", back_populates="url_record", lazy="selectin", cascade="all, delete-orphan")


class ContentChunk(Base):
    __tablename__ = "content_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url_id = Column(Integer, ForeignKey("url_records.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(LazyVector(), nullable=True)

    url_record = relationship("UrlRecord", back_populates="chunks")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False, unique=True)

    urls = relationship("UrlRecord", secondary=url_tags, back_populates="tags", lazy="selectin")
