"""
网页抓取服务模块。
提供异步网页抓取、HTML 解析和正文提取功能。
使用 httpx 发起 HTTP 请求，BeautifulSoup + lxml 解析 HTML。
"""

import asyncio
import logging
import re
import ssl
import urllib3

import httpx
from bs4 import BeautifulSoup, Tag

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
RETRY_DELAY = 1.0


async def fetch_page(url: str) -> str:
    """
    异步获取网页 HTML 内容。

    参数：
        url: 目标网页的完整 URL 地址

    返回：
        网页的 HTML 原始字符串

    异常：
        httpx.HTTPError: 网络请求相关的各类异常（超时、连接错误、HTTP 错误状态码等）
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        "DNT": "1",
        "Sec-Ch-Ua": (
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
        ),
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

    tls_config = httpx.create_ssl_context()
    tls_config.check_hostname = False
    tls_config.verify_mode = ssl.CERT_NONE
    tls_config.set_ciphers(
        "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:"
        "ECDHE+AES256+SHA384:ECDHE+AES128+SHA256:!aNULL:!MD5"
    )

    last_exception = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            try:
                client_kwargs = dict(
                    timeout=httpx.Timeout(30.0, connect=15.0),
                    follow_redirects=True,
                    headers=headers,
                    verify=tls_config,
                    http2=True,
                    limits=httpx.Limits(max_keepalive_connections=5),
                )
                async with httpx.AsyncClient(**client_kwargs) as client:
                    response = await client.get(url)
                    response.raise_for_status()
                    return response.text
            except RuntimeError:
                client_kwargs.pop("http2", None)
                async with httpx.AsyncClient(**client_kwargs) as client:
                    response = await client.get(url)
                    response.raise_for_status()
                    return response.text
        except (httpx.ConnectTimeout, httpx.ConnectError, httpx.RemoteProtocolError) as e:
            last_exception = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY)
                continue
            raise

    raise last_exception  # type: ignore[misc]


def extract_content(html: str) -> dict:
    """
    从 HTML 中提取网页标题和正文内容。

    解析策略：
        1. 优先使用 lxml 解析器（速度快、容错好），不可用时回退到内置 html.parser
        2. 标题：提取 <title> 标签文本
        3. 正文：按优先级提取 <article> → <main> → <body>
        4. 移除非正文标签（script、style、nav、footer、header 等）
        5. 使用 get_text() 提取纯文本，清理多余空白

    参数：
        html: 网页的 HTML 原始字符串

    返回：
        {"title": str, "content": str} 包含提取的标题和正文

    异常：
        ValueError: 当提取的正文内容为空字符串时抛出
    """
    # 优先尝试 lxml（速度最快、容错最好），不可用时使用内置 html.parser
    parser = "lxml"
    try:
        soup = BeautifulSoup(html, parser)
    except Exception:
        logger.warning("lxml 不可用，回退到内置 html.parser 解析器")
        parser = "html.parser"
        soup = BeautifulSoup(html, parser)

    # ---------- 提取标题 ----------
    title = ""
    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        title = title_tag.string.strip()

    # ---------- 提取正文 ----------
    # 按优先级选择正文容器：article > main > body
    content_container: Tag | None = soup.find("article")
    if content_container is None:
        content_container = soup.find("main")
    if content_container is None:
        content_container = soup.find("body")

    # 如果找不到任何容器，直接使用整个 soup
    if content_container is None:
        content_container = soup

    # 移除不需要的标签：脚本、样式、导航、页眉、页脚、侧边栏
    remove_tags = [
        "script", "style", "nav", "footer", "header",
        "aside", "noscript", "form", "iframe",
    ]
    for tag_name in remove_tags:
        for tag in content_container.find_all(tag_name):
            tag.decompose()  # 彻底从 DOM 树中移除标签

    # 使用 get_text() 提取纯文本，各块级元素之间用换行符分隔
    text = content_container.get_text(separator="\n", strip=True)

    # ---------- 清理多余空白 ----------
    # 合并连续换行符为最多两个换行（保留段落间的空行分隔）
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 去除首尾空白
    text = text.strip()

    # 如果提取结果为空，抛出异常
    if not text:
        raise ValueError("提取的网页正文内容为空")

    return {"title": title, "content": text}


def chunk_content(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    将长文本分割为固定大小的块，支持重叠（overlap），用于 RAG 检索。

    参数：
        text: 需要分块的原始文本
        chunk_size: 每块的目标字符数，默认 500
        overlap: 相邻块之间的重叠字符数，默认 50

    返回：
        文本块列表
    """
    if not text or not text.strip():
        return []

    cleaned = text.strip()
    chunks = []
    start = 0
    text_len = len(cleaned)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break
        start = end - overlap

    return chunks


async def scrape_url(url: str) -> dict:
    """
    组合 fetch_page + extract_content，完成完整的网页抓取流程。

    流程：
        1. 调用 fetch_page() 异步获取 HTML
        2. 调用 extract_content() 解析并提取标题和正文
        3. 返回包含 title 和 content 的结果字典

    参数：
        url: 目标网页的完整 URL 地址

    返回：
        {"title": str, "content": str} 包含标题和正文的字典

    异常：
        透传 fetch_page 和 extract_content 中发生的各类异常
    """
    html = await fetch_page(url)
    return extract_content(html)
