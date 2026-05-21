"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";

import {
  askQuestion,
  askWithFiles,
  createUrl,
  deleteUrl,
  processAI,
  searchUrls,
  URLResponse,
  type QAFileItem,
} from "@/lib/api";
import AIChat from "@/components/AIChat";
import ApiConfigModal, { type ApiConfig } from "@/components/ApiConfigModal";
import Pagination from "@/components/Pagination";
import SearchBar from "@/components/SearchBar";
import UrlCard from "@/components/UrlCard";
import { useChatContext } from "@/context/ChatContext";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: { id: number; title: string; url: string }[];
}

type MenuMode = "closed" | "menu" | "kb";

interface WebReference {
  content: string;
  title: string;
  url: string;
}

interface FileReference {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileTypeLabel(type: string): string {
  if (type.includes("pdf")) return "PDF";
  if (type.includes("csv") || type.includes("excel") || type.includes("spreadsheet")) return "CSV";
  if (type.includes("json")) return "JSON";
  if (type.includes("markdown") || type.includes("md")) return "MD";
  if (type.includes("text")) return "TXT";
  const ext = type.split("/").pop() || "";
  return ext.toUpperCase() || "TXT";
}

export default function Home() {
  const initialized = useRef(false);

  // ---- AI 对话状态 ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>("closed");
  const [webReference, setWebReference] = useState<WebReference | null>(null);
  const [fileReferences, setFileReferences] = useState<FileReference[]>([]);

  const hasAnyReference = webReference !== null || fileReferences.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasMessages = messages.length > 0;

  const [isTempSession, setIsTempSession] = useState(false);
  const showChat = hasMessages || isTempSession;

  const {
    activeConversationId,
    setActiveConversationId,
    loadConversation,
    cleanupPendingConversation,
    setPendingMessages,
  } = useChatContext();

  const savedConvIdRef = useRef<string | null>(null);
  const [savedConvId, setSavedConvId] = useState<string | null>(null);
  const prevHasMessagesRef = useRef(false);

  useEffect(() => {
    if (activeConversationId) {
      const conv = loadConversation(activeConversationId);
      if (conv) {
        setMessages(conv.messages);
        savedConvIdRef.current = conv.id;
        setSavedConvId(conv.id);
      }
    } else {
      setMessages([]);
      setInput("");
      setWebReference(null);
      setFileReferences([]);
      setIsTempSession(false);
    }
  }, [activeConversationId, loadConversation]);

  useEffect(() => {
    const was = prevHasMessagesRef.current;
    const is = showChat;
    prevHasMessagesRef.current = is;
    if (was && !is && !savedConvIdRef.current) {
      cleanupPendingConversation();
      setIsTempSession(false);
    }
    if (!was && is) {
      savedConvIdRef.current = null;
      setSavedConvId(null);
    }
  }, [showChat, cleanupPendingConversation]);

  useEffect(() => {
    setPendingMessages(messages);
  }, [messages, setPendingMessages]);

  // ---- 知识库面板状态 ----
  const [urls, setUrls] = useState<URLResponse[]>([]);
  const [kbInputValue, setKbInputValue] = useState("");
  const [kbLoading, setKbLoading] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // ---- 知识库逻辑 ----
  const loadUrls = useCallback(async (query: string, page: number) => {
    setSearchLoading(true);
    try {
      const result = await searchUrls({ q: query || undefined, page, page_size: 20 });
      setUrls(result.items ?? []);
      setTotalItems(result.total ?? 0);
      setTotalPages(result.total_pages ?? 0);
    } catch {
      setKbError("加载列表失败，请确认后端服务已启动");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadUrls("", 1);
  }, [loadUrls]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    loadUrls(query, 1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadUrls(searchQuery, page);
  };

  const handleKbSubmit = async () => {
    const trimmed = kbInputValue.trim();
    if (!trimmed) return;
    setKbLoading(true);
    setKbError(null);
    try {
      await createUrl(trimmed);
      setKbInputValue("");
      setCurrentPage(1);
      await loadUrls("", 1);
    } catch (e) {
      setKbError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setKbLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUrl(id);
      await loadUrls(searchQuery, currentPage);
    } catch {
      setKbError("删除失败");
    }
  };

  const handleProcessAI = async (id: number) => {
    setProcessingId(id);
    setKbError(null);
    try {
      const updated = await processAI(id);
      setUrls((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (e) {
      setKbError(e instanceof Error ? e.message : "AI 处理失败");
    } finally {
      setProcessingId(null);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleCiteUrl = useCallback(
    (item: URLResponse) => {
      setWebReference({
        content: item.summary || (item.content || "").slice(0, 3000),
        title: item.title || item.url,
        url: item.url,
      });
      setMenuMode("closed");
    },
    [],
  );

  const formatRelativeTime = (dateStr: string): string => {
    try {
      return formatDistanceToNowStrict(new Date(dateStr), { addSuffix: true, locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  // ---- AI 对话逻辑 ----
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuMode("closed");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSend = useCallback(
    async (text?: string, files?: QAFileItem[]) => {
      const question = (text ?? input).trim();
      const allFiles = files ?? fileReferences.map((f) => ({ filename: f.name, content: f.content }));
      if (!question || loading) return;
      const isNewConversation = messages.length === 0;
      if (isNewConversation) {
        setActiveConversationId(null);
        savedConvIdRef.current = null;
        setSavedConvId(null);
      }
      const userMsg: Message = { role: "user", content: question };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput("");
      setFileReferences([]);
      setWebReference(null);
      setLoading(true);
      try {
        const result = allFiles.length > 0
          ? await askWithFiles(question, allFiles)
          : await askQuestion(question);
        const assistantMsg: Message = {
          role: "assistant",
          content: result.answer,
          sources: result.sources,
        };
        const finalMessages = [...next, assistantMsg];
        setMessages(finalMessages);
      } catch (e) {
        const detail = e instanceof Error ? e.message : "未知错误";
        const errMsg: Message = {
          role: "assistant",
          content: `问答服务请求失败：${detail}`,
        };
        const finalMessages = [...next, errMsg];
        setMessages(finalMessages);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, fileReferences, setActiveConversationId],
  );

  const handleAtClick = () => {
    setMenuMode((prev) => (prev === "closed" ? "menu" : "closed"));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setFileReferences((prev) => {
          if (prev.some((f) => f.name === file.name && f.size === file.size)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              size: file.size,
              type: file.type || (file.name.split(".").pop() || "txt"),
              content: reader.result as string,
            },
          ];
        });
      };
      reader.onerror = () => {};
      reader.readAsText(file);
    });
    setMenuMode("closed");
    if (inputRef.current) inputRef.current.focus();
    e.target.value = "";
  };

  const handleClearWebReference = () => {
    setWebReference(null);
  };

  const handleRemoveFileReference = (id: string) => {
    setFileReferences((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStartTempSession = () => {
    setActiveConversationId(null);
    savedConvIdRef.current = null;
    setSavedConvId(null);
    setMessages([]);
    setInput("");
    setWebReference(null);
    setFileReferences([]);
    setIsTempSession(true);
  };

  const handleExitChat = () => {
    cleanupPendingConversation();
    setMessages([]);
    setInput("");
    setWebReference(null);
    setFileReferences([]);
    setIsTempSession(false);
    setActiveConversationId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  const isPendingConversation = isTempSession ? !savedConvId : (hasMessages && !savedConvId);

  const kbPanelContent = (
    <>
      <div className="flex gap-1.5 mb-2">
        <input
          type="url"
          className="flex-1 rounded-md border border-black/10 px-2.5 py-1.5 text-[11px] text-black placeholder-gray-400 focus:border-black/30 focus:outline-none"
          placeholder="输入 URL"
          value={kbInputValue}
          onChange={(e) => setKbInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleKbSubmit()}
          disabled={kbLoading}
        />
        <button
          onClick={handleKbSubmit}
          disabled={kbLoading || !kbInputValue.trim()}
          className="rounded-md bg-black px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-30"
        >
          {kbLoading ? "..." : "保存"}
        </button>
      </div>
      {kbError && <p className="mb-1.5 text-[11px] text-gray-400">{kbError}</p>}
      <SearchBar onSearch={handleSearch} loading={searchLoading} />
      {searchLoading && urls.length === 0 ? (
        <div className="py-8 text-center text-[11px] text-gray-400">加载中...</div>
      ) : urls.length === 0 ? (
        <div className="py-8 text-center text-[11px] text-gray-400">暂无记录</div>
      ) : (
        <ul className="space-y-1">
          {urls.map((item) => (
            <UrlCard
              key={item.id}
              item={item}
              formatRelativeTime={formatRelativeTime}
              onDelete={handleDelete}
              onToggleExpand={toggleExpand}
              expanded={expandedIds.has(item.id)}
              onProcessAI={handleProcessAI}
              processingAI={processingId === item.id}
              onCite={handleCiteUrl}
            />
          ))}
        </ul>
      )}
      <Pagination page={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
    </>
  );

  return (
    <>
      {isPendingConversation && (
        <div className="group fixed right-4 top-4 z-50">
          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-black/20 bg-white/90 px-3 py-1.5 text-xs text-gray-500 backdrop-blur-sm">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            临时会话
          </div>
          <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-black/5 bg-white px-2.5 py-1.5 text-xs text-gray-500 opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100">
            返回主页面时，此临时会话将被自动删除
          </span>
        </div>
      )}
      {!showChat ? (
        /* ===== 极简入口 ===== */
        <main className="mx-auto flex h-screen max-w-2xl flex-col items-center px-4 pt-[20vh]">
          <div className="group fixed right-4 top-4 z-50">
            <button
              onClick={handleStartTempSession}
              className="rounded-lg border border-dashed border-black/20 bg-white/90 px-3 py-1.5 text-xs text-gray-500 backdrop-blur-sm transition-all duration-150 hover:border-black/40 hover:text-black"
            >
              临时会话
            </button>
            <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md border border-black/5 bg-white px-2.5 py-1.5 text-xs text-gray-500 opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100">
              新建一个退出后自动删除的临时会话
            </span>
          </div>
          <h1 className={`mb-8 text-center text-2xl font-bold tracking-tight text-black ${hasAnyReference ? "hidden" : ""}`}>AI Research Workspace</h1>
          <div className="w-full max-w-xl">
            {webReference && (
              <div className="relative mb-3 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/10 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <span className="font-medium text-black">{webReference.title}</span>
                  <span className="text-xs text-gray-400">{webReference.url}</span>
                </div>
                <p className="mt-1 ml-6 text-xs leading-relaxed text-gray-500">
                  {webReference.content.length > 300 ? webReference.content.slice(0, 300) + "..." : webReference.content}
                </p>
                <button
                  onClick={handleClearWebReference}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-gray-300 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-500"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {fileReferences.length > 0 && (
              <div className="mb-3 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/10 bg-white p-2">
                <div className="flex flex-wrap gap-2">
                  {fileReferences.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-lg border border-black/10 bg-gray-50 px-3 py-2 text-sm transition-colors duration-150 hover:border-black/20"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black text-[10px] font-medium text-white">
                        {getFileTypeLabel(file.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-700">
                          {file.name}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveFileReference(file.id)}
                        className="shrink-0 rounded p-0.5 text-gray-300 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-500"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative flex items-center rounded-2xl border border-black/15 bg-white px-4 py-3 shadow-sm transition-shadow duration-200 focus-within:shadow-md focus-within:border-black/30">
              <div className="relative" ref={menuRef}>
                <button
                  onClick={handleAtClick}
                  className="group relative mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-sm font-medium text-gray-500 transition-all duration-200 hover:bg-black hover:text-white"
                >
                  @
                  <span className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-black/5 bg-white px-2 py-1 text-xs font-normal text-gray-600 opacity-0 shadow-sm transition-opacity duration-75 group-hover:opacity-100">
                    上传引用
                  </span>
                </button>

                {menuMode !== "closed" && (
                  <div className="absolute left-0 top-full mt-2 w-44 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/5 bg-white py-1.5 shadow-lg">
                    <button
                      onClick={() => setMenuMode("kb")}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                    >
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      抓取网页
                    </button>
                    <button
                      onClick={() => { fileInputRef.current?.click(); setMenuMode("closed"); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                    >
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      本地文件
                    </button>
                    {/* 知识库内嵌面板 */}
                    {menuMode === "kb" && (
                      <div className="absolute left-full top-0 ml-1 w-[620px] animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/5 bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
                          <span className="text-xs font-medium text-black">知识库</span>
                          <button onClick={() => setMenuMode("menu")} className="text-gray-300 hover:text-black">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                        </div>
                        <div className="max-h-[450px] overflow-y-auto px-3 py-2">
                          {kbPanelContent}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <input
                ref={inputRef}
                type="text"
                className="flex-1 border-none bg-transparent text-base text-black placeholder-gray-400 outline-none"
                placeholder={hasAnyReference ? "基于引用内容提问..." : "输入你的问题..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />

              <div className="relative ml-1.5">
                <button
                  onClick={() => setConfigOpen(true)}
                  className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-gray-400 transition-all duration-200 hover:bg-gray-100 hover:text-black"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-black/5 bg-white px-2 py-1 text-xs text-gray-600 opacity-0 shadow-sm transition-opacity duration-100 group-hover:opacity-100">
                    API 设置
                  </span>
                </button>
              </div>

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white transition-all duration-200 hover:scale-105 hover:opacity-80 disabled:opacity-30 disabled:hover:scale-100"
              >
                {loading ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.csv,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </main>
      ) : (
        /* ===== AI 对话视图 ===== */
        <main className="mx-auto flex h-screen max-w-2xl flex-col px-4 py-6">
          {isTempSession && !savedConvId && (
            <div className="relative mb-3 animate-[fadeIn_200ms_ease-out] rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-2.5 pr-24 text-xs text-amber-700">
              <svg className="mr-1.5 inline-block h-3.5 w-3.5 align-text-bottom" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              已进入临时会话，退出后将自动删除
              <button
                onClick={handleExitChat}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-amber-300 px-2.5 py-1 text-[11px] text-amber-600 transition-colors duration-150 hover:bg-amber-100"
              >
                退出
              </button>
            </div>
          )}
          {webReference && (
            <div className="relative mb-3 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/10 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span className="font-medium text-black">{webReference.title}</span>
                <span className="text-xs text-gray-400">{webReference.url}</span>
              </div>
              <p className="mt-1 ml-6 text-xs leading-relaxed text-gray-500">
                {webReference.content.length > 300 ? webReference.content.slice(0, 300) + "..." : webReference.content}
              </p>
              <button
                onClick={handleClearWebReference}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-gray-300 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-500"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {fileReferences.length > 0 && (
            <div className="mb-3 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/10 bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {fileReferences.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-lg border border-black/10 bg-gray-50 px-3 py-2 text-sm transition-colors duration-150 hover:border-black/20"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black text-[10px] font-medium text-white">
                      {getFileTypeLabel(file.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-700">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveFileReference(file.id)}
                      className="shrink-0 rounded p-0.5 text-gray-300 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-500"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1">
            <AIChat
              messages={messages}
              onSend={handleSend}
              loading={loading}
              onOpenConfig={() => setConfigOpen(true)}
              renderKbPanel={kbPanelContent}
            />
          </div>
        </main>
      )
      }

      <ApiConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={(_config: ApiConfig) => {}}
      />



      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
