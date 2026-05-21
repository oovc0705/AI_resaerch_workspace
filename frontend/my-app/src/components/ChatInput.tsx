"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/context/ChatContext";
import { createUrl, UrlRecord } from "@/lib/api";

interface ChatInputProps {
  onFilesSelected?: (files: { filename: string; content: string }[]) => void;
}

export default function ChatInput({ onFilesSelected }: ChatInputProps) {
  const { sendMessage, isLoading } = useChat();
  const [input, setInput] = useState("");
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [showKbPanel, setShowKbPanel] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapingStatus, setScrapingStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [scrapedResult, setScrapedResult] = useState<UrlRecord | null>(null);
  const [scrapeError, setScrapeError] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ filename: string; content: string }[]>([]);
  const [kbUrls, setKbUrls] = useState<UrlRecord[]>([]);
  const [kbSearch, setKbSearch] = useState("");
  const [kbLoading, setKbLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kbPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (atMenuRef.current && !atMenuRef.current.contains(e.target as Node)) {
        setShowAtMenu(false);
      }
      if (kbPanelRef.current && !kbPanelRef.current.contains(e.target as Node)) {
        setShowKbPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    await sendMessage(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setAttachedFiles([]);
    setScrapedResult(null);
    setScrapingStatus("idle");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAtClick = () => {
    setShowAtMenu(!showAtMenu);
    setShowKbPanel(false);
  };

  const handleScrapeUrl = async () => {
    const url = scrapeUrl.trim();
    if (!url) return;
    setScrapingStatus("loading");
    setScrapeError("");
    try {
      const result = await createUrl(url);
      setScrapedResult(result);
      setScrapingStatus(result.scraped ? "done" : "error");
      if (!result.scraped) {
        setScrapeError(result.error || "抓取失败");
      }
    } catch (err) {
      setScrapingStatus("error");
      setScrapeError(err instanceof Error ? err.message : "抓取失败");
    }
  };

  const handleKbUrlSelect = (record: UrlRecord) => {
    setAttachedFiles((prev) => [
      ...prev,
      { filename: record.title || record.url, content: record.content || record.summary || "" },
    ]);
    setShowKbPanel(false);
    setShowAtMenu(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttached: { filename: string; content: string }[] = [];
    let loaded = 0;

    const processNext = () => {
      if (loaded >= files.length) {
        setAttachedFiles((prev) => [...prev, ...newAttached]);
        setShowAtMenu(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const file = files[loaded];
      const reader = new FileReader();
      reader.onload = () => {
        newAttached.push({
          filename: file.name,
          content: (reader.result as string) || "",
        });
        loaded++;
        processNext();
      };
      reader.onerror = () => {
        loaded++;
        processNext();
      };
      reader.readAsText(file);
    };
    processNext();
  };

  const loadKbUrls = async () => {
    setKbLoading(true);
    try {
      const { getUrls } = await import("@/lib/api");
      const data = await getUrls(kbSearch || undefined);
      setKbUrls(data.items);
    } catch {
      setKbUrls([]);
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => {
    if (showKbPanel) {
      loadKbUrls();
    }
  }, [showKbPanel, kbSearch]);

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {attachedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedFiles.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#f0f0f0] text-xs rounded-full text-gray-700"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2h5l3 3v5.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5V2.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1" />
              </svg>
              {f.filename}
              <button
                onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                className="ml-1 hover:text-red-500"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {scrapedResult && (
        <div className="mb-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
            scrapedResult.scraped ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <span className="font-medium">{scrapedResult.scraped ? "已抓取" : "抓取失败"}:</span>
            <span className="truncate max-w-[200px]">{scrapedResult.title || scrapedResult.url}</span>
            <button
              onClick={() => setScrapedResult(null)}
              className="hover:opacity-70"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="relative flex items-end bg-white border border-[#d1d1d1] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus-within:border-black transition-all duration-200">
        <div className="relative">
          <button
            onClick={handleAtClick}
            className="flex items-center justify-center w-10 h-10 rounded-full m-2 text-gray-500 hover:text-black hover:bg-[#f0f0f0] btn-transition shrink-0"
          >
            <span className="text-lg font-semibold">@</span>
          </button>

          {showAtMenu && (
            <div
              ref={atMenuRef}
              className="absolute left-0 bottom-full mb-2 w-40 bg-white border border-[#e5e5e5] rounded-xl shadow-lg py-1 animate-slideDown z-50"
            >
              <button
                onClick={() => {
                  setShowKbPanel(true);
                  setShowAtMenu(false);
                }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#f5f5f5] flex items-center gap-3 text-gray-700"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                抓取网页
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#f5f5f5] flex items-center gap-3 text-gray-700"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 2h5l3 3v9.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5V2.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M9 2v3.5h3.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                本地文件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题..."
          rows={1}
          className="flex-1 resize-none bg-transparent py-3 pr-3 text-sm text-black placeholder-gray-400 focus:outline-none max-h-[200px]"
          style={{ minHeight: "50px", lineHeight: "20px" }}
        />

        <button
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-black m-2 shrink-0 btn-transition disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#333]"
        >
          {isLoading ? (
            <div className="flex gap-1 items-center">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 8l12-6-6 12-1.5-6L2 8z"
                fill="white"
                stroke="white"
                strokeWidth="0.5"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {showKbPanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowKbPanel(false)} />
          <div
            ref={kbPanelRef}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] bg-white rounded-2xl shadow-2xl animate-slideDown overflow-hidden flex flex-col"
            style={{ maxHeight: "70vh" }}
          >
            <div className="p-4 border-b border-[#e5e5e5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <h3 className="text-sm font-semibold text-black">知识库</h3>
              </div>
              <button
                onClick={() => setShowKbPanel(false)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e5e5e5] text-gray-400 hover:text-black btn-transition"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="p-4 border-b border-[#f0f0f0] space-y-3 bg-[#fafafa]">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScrapeUrl();
                    }
                  }}
                  placeholder="输入网页 URL 进行抓取..."
                  className="flex-1 px-3 py-2 text-xs border border-[#d1d1d1] rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <button
                  onClick={handleScrapeUrl}
                  disabled={scrapingStatus === "loading" || !scrapeUrl.trim()}
                  className="px-4 py-2 bg-black text-white text-xs font-medium rounded-lg btn-transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {scrapingStatus === "loading" ? "抓取中..." : "抓取"}
                </button>
              </div>
              {scrapeError && <p className="text-xs text-red-500">{scrapeError}</p>}
              {scrapedResult && (
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                  scrapedResult.scraped ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}>
                  <span>{scrapedResult.scraped ? "已抓取" : "失败"}:</span>
                  <span className="truncate flex-1">{scrapedResult.title || scrapedResult.url}</span>
                  {scrapedResult.scraped && (
                    <button
                      onClick={() => handleKbUrlSelect(scrapedResult)}
                      className="px-2 py-0.5 bg-green-100 hover:bg-green-200 rounded text-[10px] btn-transition"
                    >
                      引用
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-2 border-b border-[#f0f0f0]">
              <input
                type="text"
                value={kbSearch}
                onChange={(e) => setKbSearch(e.target.value)}
                placeholder="搜索已抓取内容..."
                className="w-full px-3 py-1.5 text-xs border border-[#d1d1d1] rounded-lg focus:outline-none focus:border-black transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto sidebar-scroll">
              {kbLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
                </div>
              ) : kbUrls.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-12">暂无内容</p>
              ) : (
                kbUrls.map((record) => (
                  <button
                    key={record.id}
                    onClick={() => handleKbUrlSelect(record)}
                    className="w-full text-left px-4 py-3 hover:bg-[#f5f5f5] transition-colors border-b border-[#f0f0f0] last:border-b-0"
                  >
                    <p className="text-sm font-medium text-black truncate">{record.title || record.url}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{record.url}</p>
                    {record.summary && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{record.summary}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
