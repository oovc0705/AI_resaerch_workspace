"""
AI 服务模块。
封装与 OpenAI 兼容 API（或本地 LLM）的交互逻辑，
提供内容摘要、标签生成、embedding 向量化和 RAG 问答功能。
所有方法均包含异常处理和自动重试机制（最多 3 次）。
"""

import json
import logging
import asyncio

import httpx
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class AIService:
    """
    AI 服务类，封装 LLM 和 Embedding 的调用逻辑。

    初始化参数：
        api_key: OpenAI 兼容的 API Key
        base_url: API 的基础 URL（支持自定义 endpoint）
        model: 对话模型名称（如 gpt-4o-mini）
        embedding_model: Embedding 模型名称（如 text-embedding-ada-002）

    使用方式：
        ai = AIService(api_key="...", base_url="...", model="...")
        summary = await ai.summarize(content)
    """

    # 内容截断的最大字符数，避免超出模型 token 限制
    MAX_CONTENT_LENGTH = 8000

    def __init__(self, api_key: str, base_url: str, model: str, embedding_model: str = "text-embedding-ada-002"):
        """
        初始化 AIService 实例，创建 AsyncOpenAI 客户端。

        参数：
            api_key: API 密钥
            base_url: API 基础 URL
            model: 默认使用的对话模型名称
            embedding_model: 默认使用的 embedding 模型名称
        """
        self.model = model
        self.embedding_model = embedding_model
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )

    async def _call_with_retry(self, func, *args, max_retries: int = 3, **kwargs):
        """
        带重试机制的 API 调用包装器。

        在遇到网络错误或服务器错误时自动重试，最多 max_retries 次。
        每次重试前等待时间递增（1s, 2s, 3s）。

        参数：
            func: 要调用的异步函数
            max_retries: 最大重试次数
            其余参数透传给 func

        返回：
            func 的返回值

        异常：
            重试耗尽后抛出最后一次的异常
        """
        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e
                logger.warning(
                    "AI API 调用失败 (第 %d/%d 次): %s",
                    attempt, max_retries, str(e),
                )
                if attempt < max_retries:
                    await asyncio.sleep(attempt)
        raise last_error

    def _truncate_content(self, content: str) -> str:
        """
        截断过长内容，避免超出模型 token 限制。

        如果内容超过 MAX_CONTENT_LENGTH 字符，截取前 MAX_CONTENT_LENGTH 个字符，
        并附加省略标记。
        """
        if len(content) <= self.MAX_CONTENT_LENGTH:
            return content
        return content[:self.MAX_CONTENT_LENGTH] + "\n...(内容过长，已截断)"

    async def _raw_chat_request(self, messages: list[dict], max_tokens: int = 500) -> dict:
        """
        使用 httpx 直接发送原始 HTTP 请求，完全绕过 OpenAI SDK 的响应解析。

        当 SDK 解析失败时使用此方法作为 fallback，
        确保兼容 LM Studio、Ollama、vLLM 等各种 OpenAI 兼容但不完全一致的服务。

        参数：
            messages: 消息列表
            max_tokens: 最大生成 token 数

        返回：
            原始 JSON 响应字典，应包含 choices 字段
        """
        url = f"{str(self.client.base_url).rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.client.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
        # 去除空的 api_key（有些本地服务不需要 Authorization header）
        if not self.client.api_key or self.client.api_key.strip() == "":
            del headers["Authorization"]

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    async def _raw_embedding_request(self, text: str) -> dict:
        """
        使用 httpx 直接发送原始 Embedding 请求。

        参数：
            text: 需要向量化的文本

        返回：
            原始 JSON 响应字典，应包含 data 字段
        """
        url = f"{str(self.client.base_url).rstrip('/')}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.client.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.embedding_model,
            "input": text,
        }
        if not self.client.api_key or self.client.api_key.strip() == "":
            del headers["Authorization"]

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            return resp.json()

    def _extract_content_from_raw(self, raw: dict, method_name: str) -> str:
        """
        从原始 JSON 响应中提取文本内容。

        支持多种非标准响应格式：
          - {"choices": [{"message": {"content": "..."}}]}
          - {"choices": [{"text": "..."}]}
          - {"results": [{"text": "..."}]}
          - {"response": "..."}

        参数：
            raw: 原始 JSON 响应字典
            method_name: 调用方方法名

        返回：
            提取的文本内容字符串
        """
        if not isinstance(raw, dict):
            raise ValueError(f"{method_name}: 原始响应不是 JSON 字典，类型: {type(raw).__name__}")

        # 尝试 choices → message.content
        choices = raw.get("choices")
        if choices and isinstance(choices, list) and len(choices) > 0:
            c0 = choices[0]
            if isinstance(c0, dict):
                msg = c0.get("message")
                if isinstance(msg, dict) and msg.get("content"):
                    return msg["content"]
                if c0.get("text"):
                    return c0["text"]

        # 尝试 results 字段
        results = raw.get("results")
        if results and isinstance(results, list) and len(results) > 0:
            if isinstance(results[0], dict) and results[0].get("text"):
                return results[0]["text"]

        # 尝试 response 字段（某些本地 API 直接把文本放在顶层）
        if isinstance(raw.get("response"), str):
            return raw["response"]

        # 尝试 content 字段
        if isinstance(raw.get("content"), str):
            return raw["content"]

        raise ValueError(
            f"{method_name}: 无法从原始响应提取内容。"
            f"响应 keys: {list(raw.keys())}，"
            f"请检查 {self.client.base_url} 的 /chat/completions 端点响应格式"
        )

    def _extract_embedding_from_raw(self, raw: dict, method_name: str) -> list[float]:
        """
        从原始 JSON 响应中提取 embedding 向量。

        参数：
            raw: 原始 JSON 响应字典
            method_name: 调用方方法名

        返回：
            浮点数列表
        """
        if not isinstance(raw, dict):
            raise ValueError(f"{method_name}: 原始响应不是 JSON 字典")

        data = raw.get("data")
        if data and isinstance(data, list) and len(data) > 0:
            d0 = data[0]
            if isinstance(d0, dict) and "embedding" in d0:
                return d0["embedding"]

        # 有些服务直接把向量放在顶层
        if isinstance(raw.get("embedding"), list):
            return raw["embedding"]

        raise ValueError(f"{method_name}: 无法从原始响应提取 embedding，响应 keys: {list(raw.keys())}")

    def _validate_chat_response(self, response, method_name: str) -> str:
        """
        校验 Chat Completion 响应结构，提取文本内容。

        支持多种 OpenAI 兼容 API 的响应格式：
          1. 标准 OpenAI: response.choices[0].message.content
          2. Pydantic model_dump: response.model_dump()["choices"]
          3. 原始 dict: response["choices"]
          4. 文本补全格式: response["choices"][0]["text"]

        参数：
            response: API 返回的响应对象
            method_name: 调用方方法名，用于错误日志

        返回：
            提取的文本内容字符串

        异常：
            ValueError: 当响应结构不符合所有已知格式时
        """
        if response is None:
            raise ValueError(f"{method_name}: API 返回了空响应")

        # 尝试多种方式提取 choices
        choices = None

        # 方式1: 标准 Pydantic 模型属性访问
        if hasattr(response, "choices") and response.choices is not None:
            choices = response.choices
        # 方式2: Pydantic v2 model_dump 导出为字典后取 key
        elif hasattr(response, "model_dump"):
            try:
                raw_dict = response.model_dump()
                choices = raw_dict.get("choices")
            except Exception:
                pass
        # 方式3: 有些 SDK 版本用 dict() 转换
        elif hasattr(response, "__dict__"):
            raw = vars(response)
            choices = raw.get("choices") or raw.get("_choices")
        # 方式4: 响应本身就是 dict（某些本地 LLM 代理直接返回 dict）
        elif isinstance(response, dict):
            choices = response.get("choices")

        if choices is None or (isinstance(choices, list) and len(choices) == 0):
            # 记录响应类型和可用属性，帮助排查
            resp_type = type(response).__name__
            attrs = []
            try:
                if hasattr(response, "model_dump"):
                    attrs = list(response.model_dump().keys())
                elif isinstance(response, dict):
                    attrs = list(response.keys())
                elif hasattr(response, "__dict__"):
                    attrs = list(vars(response).keys())
            except Exception:
                attrs = ["<无法读取>"]

            raise ValueError(
                f"{method_name}: API 响应缺少可解析的 choices 字段。"
                f"响应类型: {resp_type}，"
                f"可用字段: {attrs}，"
                f"请检查 OPENAI_BASE_URL 和 OPENAI_MODEL 配置是否正确"
            )

        # 提取第一个 choice 的内容
        first = choices[0]

        # 尝试标准 message.content
        if hasattr(first, "message") and first.message is not None:
            msg = first.message
            if hasattr(msg, "content") and msg.content is not None:
                return msg.content

        # 尝试 text 字段（旧版补全 API 格式）
        if hasattr(first, "text") and first.text is not None:
            return first.text

        # 尝试 dict 形式的 message
        if isinstance(first, dict):
            msg = first.get("message", {})
            if isinstance(msg, dict):
                content = msg.get("content")
                if content:
                    return content
            text = first.get("text")
            if text:
                return text

        raise ValueError(
            f"{method_name}: 无法从 choice 中提取内容。"
            f"choice 类型: {type(first).__name__}，"
            f"支持格式: message.content 或 text"
        )

    async def summarize(self, content: str) -> str:
        """
        使用 LLM 生成 3-5 句中文内容摘要。

        流程：
            1. 截断过长内容（超过 8000 字符）
            2. 先尝试 OpenAI SDK 调用，解析失败则 fallback 到原始 HTTP 请求
            3. 校验响应结构并返回摘要文本

        参数：
            content: 需要总结的文本内容

        返回：
            3-5 句中文摘要字符串
        """
        truncated = self._truncate_content(content)

        system_prompt = "你是一个专业的内容总结助手，请用3-5句话中文总结以下内容要点"
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": truncated},
        ]

        # 方式1: 尝试 SDK 调用
        try:
            response = await self._call_with_retry(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=500,
            )
            summary = self._validate_chat_response(response, "summarize").strip()
        except (ValueError, AttributeError) as e:
            logger.warning("summarize: SDK 解析失败 (%s)，fallback 到原始 HTTP 请求", str(e))
            # 方式2: fallback 到原始 HTTP 请求
            raw = await self._call_with_retry(self._raw_chat_request, messages=messages, max_tokens=500)
            summary = self._extract_content_from_raw(raw, "summarize").strip()

        logger.info("摘要生成成功，长度: %d 字符", len(summary))
        return summary

    async def generate_tags(self, content: str) -> list[str]:
        """
        使用 LLM 根据内容自动生成 3-5 个关键词标签。

        流程：
            1. 截断过长内容
            2. 使用 System prompt 要求 LLM 以 JSON 数组格式返回标签
            3. 校验响应结构
            4. 解析 JSON 数组，提取标签列表
            5. 如果解析失败，尝试从文本中提取

        参数：
            content: 需要生成标签的文本内容

        返回：
            标签字符串列表，包含 3-5 个关键词
        """
        truncated = self._truncate_content(content)

        system_prompt = (
            "你是一个内容标签生成助手，请根据以下内容生成3-5个关键词标签，"
            "以JSON数组格式返回，例如：[\"Python\", \"机器学习\", \"数据分析\"]"
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": truncated},
        ]

        # 方式1: 尝试 SDK 调用
        try:
            response = await self._call_with_retry(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=200,
            )
            raw = self._validate_chat_response(response, "generate_tags").strip()
        except (ValueError, AttributeError) as e:
            logger.warning("generate_tags: SDK 解析失败 (%s)，fallback 到原始 HTTP 请求", str(e))
            raw_response = await self._call_with_retry(self._raw_chat_request, messages=messages, max_tokens=200)
            raw = self._extract_content_from_raw(raw_response, "generate_tags").strip()

        try:
            # 尝试直接解析 JSON 数组
            tags = json.loads(raw)
            if isinstance(tags, list):
                result = [str(t) for t in tags][:5]
                logger.info("标签生成成功: %s", result)
                return result
        except json.JSONDecodeError:
            pass

        # 如果 JSON 解析失败，尝试从文本中提取
        import re
        # 匹配引号中的内容或逗号分隔的词
        matches = re.findall(r'"([^"]+)"', raw)
        if matches:
            result = matches[:5]
            logger.info("标签解析（备用方案）: %s", result)
            return result

        # 最后尝试按逗号分割
        result = [t.strip() for t in raw.split(",") if t.strip()][:5]
        logger.info("标签解析（按逗号分割）: %s", result)
        return result

    async def create_embedding(self, text: str) -> list[float]:
        """
        调用 Embedding API 生成文本的向量表示。

        生成 1536 维浮点数向量，用于语义搜索的相似度计算。

        参数：
            text: 需要向量化的文本

        返回：
            1536 维浮点数列表

        异常：
            ValueError: 输入文本为空或 API 响应结构异常时抛出
        """
        if not text or not text.strip():
            raise ValueError("embedding 输入文本不能为空")

        # embedding 模型通常有 token 限制，截断到 8000 字符
        truncated = text[:8000] if len(text) > 8000 else text

        # 方式1: 尝试 SDK 调用
        try:
            response = await self._call_with_retry(
                self.client.embeddings.create,
                model=self.embedding_model,
                input=truncated,
            )

            if response is None:
                raise ValueError("API 返回了空响应")
            if not hasattr(response, "data") or response.data is None:
                raise ValueError("API 响应缺少 data 字段")
            if len(response.data) == 0:
                raise ValueError("API 返回的 data 为空")
            if not hasattr(response.data[0], "embedding") or response.data[0].embedding is None:
                raise ValueError("API 响应的 embedding 字段为空")

            embedding = response.data[0].embedding
        except (ValueError, AttributeError) as e:
            logger.warning("create_embedding: SDK 解析失败 (%s)，fallback 到原始 HTTP 请求", str(e))
            raw = await self._call_with_retry(self._raw_embedding_request, text=truncated)
            embedding = self._extract_embedding_from_raw(raw, "create_embedding")

        logger.info("Embedding 生成成功，维度: %d", len(embedding))
        return embedding

    async def answer_question(self, question: str, context_docs: list[dict]) -> str:
        """
        基于多个相关文档的上下文，使用 LLM 回答用户问题（RAG 问答）。

        流程：
            1. 如果上下文为空，返回提示信息
            2. 构建包含所有相关文档上下文的 System prompt
            3. 调用 LLM 生成答案

        参数：
            question: 用户提出的问题
            context_docs: 相关文档列表，每个文档包含 title 和 content 字段

        返回：
            AI 生成的回答字符串
        """
        if not context_docs:
            return "未找到相关内容"

        # 构建上下文文本
        context_parts = []
        for i, doc in enumerate(context_docs, 1):
            title = doc.get("title", "无标题")
            content = doc.get("content", "")
            # 每个文档截取前 2000 字符，避免上下文过长
            content_preview = content[:2000] if len(content) > 2000 else content
            context_parts.append(f"[文档{i}] 标题: {title}\n{content_preview}")

        context_text = "\n\n---\n\n".join(context_parts)

        system_prompt = (
            "你是一个知识库问答助手。请基于以下提供的文档内容回答用户的问题。"
            "如果文档中没有相关信息，请如实说明。"
            "回答时请尽量引用文档中的具体信息，使用中文回复。\n\n"
            f"## 参考文档\n\n{context_text}"
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ]

        # 方式1: 尝试 SDK 调用
        try:
            response = await self._call_with_retry(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=1000,
            )
            answer = self._validate_chat_response(response, "answer_question").strip()
        except (ValueError, AttributeError) as e:
            logger.warning("answer_question: SDK 解析失败 (%s)，fallback 到原始 HTTP 请求", str(e))
            raw = await self._call_with_retry(self._raw_chat_request, messages=messages, max_tokens=1000)
            answer = self._extract_content_from_raw(raw, "answer_question").strip()

        logger.info("问答生成成功，答案长度: %d 字符", len(answer))
        return answer

    async def rank_documents(self, question: str, docs: list[dict]) -> list[dict]:
        """
        使用 LLM 对检索到的文档进行相关性重排序。

        流程：
            1. 将每个文档编号并截取摘要
            2. 要求 LLM 返回按相关性从高到低排列的文档编号
            3. 按 LLM 给出的顺序重新排列文档列表

        参数：
            question: 用户问题
            docs: 检索到的文档列表，每个包含 id, title, content, similarity

        返回：
            重排序后的文档列表
        """
        if len(docs) <= 1:
            return docs

        doc_descriptions = []
        for i, doc in enumerate(docs):
            preview = (doc.get("content", "") or "")[:300]
            title = doc.get("title", "无标题")
            doc_descriptions.append(f"[{i}] 标题: {title}\n内容: {preview}")

        prompt = (
            "请根据以下问题，对文档列表按相关性从高到低排序。"
            f"只返回文档编号的JSON数组，如 [2,0,1]。\n\n问题: {question}\n\n文档:\n"
            + "\n\n".join(doc_descriptions)
        )
        messages = [
            {"role": "system", "content": "你是一个文档排序助手。只返回JSON数组格式的排序结果。"},
            {"role": "user", "content": prompt},
        ]

        try:
            response = await self._call_with_retry(
                self.client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0,
                max_tokens=100,
            )
            raw = self._validate_chat_response(response, "rank_documents").strip()
        except (ValueError, AttributeError) as e:
            logger.warning("rank_documents: SDK 解析失败 (%s)，fallback 到原始 HTTP 请求", str(e))
            raw_response = await self._call_with_retry(self._raw_chat_request, messages=messages, max_tokens=100)
            raw = self._extract_content_from_raw(raw_response, "rank_documents").strip()

        try:
            order = json.loads(raw)
            if isinstance(order, list):
                ranked = [docs[i] for i in order if 0 <= i < len(docs)]
                if ranked:
                    logger.info("文档重排序完成，%d -> %d 条", len(docs), len(ranked))
                    return ranked
        except (json.JSONDecodeError, IndexError):
            pass

        return docs
