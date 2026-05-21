# AI Research Workspace

基于 RAG（检索增强生成）的智能 URL 研究助手，支持网页抓取、AI 摘要、标签生成、语义搜索和知识库问答。

## 功能特性

- **网页抓取** — 异步抓取任意网页的标题和正文内容，支持反爬绕过和自动重试
- **AI 摘要** — 调用 LLM 自动生成网页内容的精炼摘要
- **智能标签** — AI 自动为每条记录生成分类标签，支持标签过滤
- **语义搜索** — 基于 pgvector 的向量相似度搜索，支持混合搜索（向量 + 关键词）和结果重排序
- **知识库问答** — 基于 RAG 的智能问答，可结合已保存的 URL 内容和上传文件进行回答
- **异步任务** — 基于 Celery + Redis 的后台任务处理，支持抓取 → 摘要 → 标签 → embedding 链式任务
- **API 配置** — 前端可视化管理 LLM API Key、Base URL、模型等配置

## 技术栈

### 后端

| 技术 | 说明 |
|------|------|
| FastAPI | 异步 Web 框架 |
| SQLAlchemy (async) | ORM + 数据库迁移 |
| PostgreSQL + pgvector | 关系型数据库 + 向量存储 |
| Redis + Celery | 消息队列 + 异步任务 |
| httpx + BeautifulSoup + lxml | 网页抓取与解析 |
| OpenAI 兼容 API | LLM 对话、摘要、标签、Embedding |

### 前端

| 技术 | 说明 |
|------|------|
| Next.js 16 | React 全栈框架 |
| React 19 | UI 库 |
| TypeScript | 类型安全 |
| Tailwind CSS 4 | 原子化 CSS 框架 |

## 项目结构

```
├── backend/                    # 后端服务
│   ├── main.py                 # FastAPI 应用入口
│   ├── database.py             # 数据库引擎与会话管理
│   ├── models.py               # ORM 数据模型 (UrlRecord, ContentChunk, Tag)
│   ├── schemas.py              # Pydantic 请求/响应校验模型
│   ├── dependencies.py         # FastAPI 依赖注入
│   ├── requirements.txt        # Python 依赖
│   ├── routers/                # API 路由
│   │   ├── urls.py             # URL 记录的 CRUD + AI 处理
│   │   ├── qa.py               # RAG 问答接口
│   │   ├── config.py           # LLM API 配置接口
│   │   └── tasks.py            # Celery 任务状态查询
│   ├── services/               # 业务逻辑层
│   │   ├── scraper.py          # 网页抓取 + 内容提取 + 分块
│   │   ├── ai.py               # AI 服务封装 (摘要/标签/Embedding/问答)
│   │   └── rag.py              # RAG 检索 (语义搜索/混合搜索/重排序)
│   └── tasks/                  # Celery 异步任务
│       ├── celery_app.py       # Celery 应用实例
│       └── url_tasks.py        # 抓取/摘要/标签/Embedding 任务
├── frontend/                   # 前端应用
│   └── src/
│       ├── app/                # Next.js App Router 页面
│       ├── components/         # React 组件
│       ├── context/            # React Context 状态管理
│       └── lib/                # API 调用封装
├── docker-compose.yml          # Docker 编排 (PostgreSQL + Redis)
└── README.md
```

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- Docker & Docker Compose
- OpenAI 兼容 API Key（支持 DeepSeek、OpenAI、Ollama 等）

### 1. 克隆项目

```bash
git clone <repo-url>
cd AI_research_workspace
```

### 2. 启动基础设施

```bash
docker compose up -d
```

将启动两个服务：
- **PostgreSQL 16** (pgvector) — 端口 `5432`
- **Redis 7** — 端口 `6379`

### 3. 配置环境变量

复制并编辑后端环境变量文件：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
DATABASE_URL=postgresql+asyncpg://appuser:ykfpostgres@localhost:5432/appdb
OPENAI_API_KEY=your-api-key-here
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-chat
OPENAI_EMBEDDING_MODEL=deepseek-chat
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 4. 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端 API 运行在 `http://localhost:8000`，自动建表并初始化 AI 服务。

启动 Celery Worker（另开终端）：

```bash
cd backend
celery -A tasks.celery_app worker --loglevel=info --pool=threads --concurrency=2
```

### 5. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 `http://localhost:3000`。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | 健康检查 |
| `POST` | `/api/urls` | 创建 URL 记录（自动抓取） |
| `GET` | `/api/urls` | 分页查询 URL 列表（支持关键词搜索） |
| `DELETE` | `/api/urls/{id}` | 删除 URL 记录 |
| `POST` | `/api/urls/{id}/process-ai` | 手动触发 AI 处理 |
| `POST` | `/api/qa/ask` | 知识库智能问答 |
| `POST` | `/api/qa/ask-with-files` | 带文件上传的智能问答 |
| `GET` | `/api/config` | 获取 LLM API 配置 |
| `POST` | `/api/config` | 设置 LLM API 配置 |
| `POST` | `/api/config/test` | 测试 LLM API 连接 |
| `GET` | `/api/tasks/{task_id}` | 查询 Celery 任务状态 |

## 核心流程

### URL 研究流程

```
提交 URL → 异步抓取网页 → 提取标题/正文
    ↓ (Celery 链式任务)
AI 摘要 → AI 标签 → Embedding 向量化
    ↓
支持语义搜索 + RAG 问答
```

### RAG 问答流程

```
用户提问 → Embedding 向量化 → pgvector 语义搜索
    ↓
混合搜索 (向量 70% + 关键词 30%) → LLM 重排序
    ↓
构建上下文 → LLM 生成回答 → 返回答案 + 来源引用
```

## 数据库模型

```mermaid
erDiagram
    UrlRecord ||--o{ ContentChunk : "1:N"
    UrlRecord }o--o{ Tag : "M:N (url_tags)"
    
    UrlRecord {
        int id PK
        string url
        string title
        text content
        text summary
        vector embedding
        datetime created_at
        datetime updated_at
    }
    
    ContentChunk {
        int id PK
        int url_id FK
        int chunk_index
        text content
        vector embedding
    }
    
    Tag {
        int id PK
        string name
    }
```
