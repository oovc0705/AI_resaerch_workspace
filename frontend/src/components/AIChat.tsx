"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: { id: number; title: string; url: string }[];
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

type MenuMode = "closed" | "menu" | "kb";

interface AIChatProps {
  messages: Message[];
  onSend: (question: string, files?: { filename: string; content: string }[]) => void;
  loading: boolean;
  onOpenConfig?: () => void;
  onOpenKb?: () => void;
  renderKbPanel?: React.ReactNode;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(type: string): string {
  if (type.includes("pdf")) return "PDF";
  if (type.includes("csv") || type.includes("excel") || type.includes("spreadsheet")) return "CSV";
  if (type.includes("json")) return "JSON";
  if (type.includes("markdown") || type.includes("md")) return "MD";
  return "TXT";
}

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const prevTextRef = useRef(text);
  const indexRef = useRef(0);

  useEffect(() => {
    if (prevTextRef.current !== text) {
      prevTextRef.current = text;
      indexRef.current = 0;
      setDisplayed("");
    }

    const chars = [...text];
    let rafId: number;
    function animate() {
      rafId = requestAnimationFrame(() => {
        if (indexRef.current < chars.length) {
          indexRef.current++;
          setDisplayed(chars.slice(0, indexRef.current).join(""));
          animate();
        }
      });
    }

    const startTimer = setTimeout(() => {
      animate();
    }, 0);

    return () => {
      clearTimeout(startTimer);
      cancelAnimationFrame(rafId);
    };
  }, [text]);

  return (
    <span className="whitespace-pre-wrap">
      {displayed}
      {displayed.length < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  );
}

function parseMarkdownBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function AIChat({
  messages,
  onSend,
  loading,
  onOpenConfig,
  onOpenKb,
  renderKbPanel,
}: AIChatProps) {
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [menuMode, setMenuMode] = useState<MenuMode>("closed");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuMode("closed");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedFiles.length === 0) || loading) return;

    let question = trimmed;
    if (attachedFiles.length > 0) {
      const fileContents = attachedFiles
        .map((f) => `[文件: ${f.name}]\n${f.content}`)
        .join("\n\n");
      question = trimmed
        ? `${fileContents}\n\n[用户问题]\n${trimmed}`
        : fileContents;
      const files = attachedFiles.map((f) => ({ filename: f.name, content: f.content }));
      setAttachedFiles([]);
      onSend(question, files);
    } else {
      onSend(question);
    }
    setInput("");
    setMenuMode("closed");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAtClick = () => {
    setMenuMode((prev) => (prev === "closed" ? "menu" : "closed"));
  };

  const handleLocalFile = () => {
    fileInputRef.current?.click();
    setMenuMode("closed");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      const fileType = file.type || (file.name.split(".").pop() || "txt");

      reader.onload = () => {
        const content = reader.result as string;
        setAttachedFiles((prev) => {
          if (prev.some((f) => f.name === file.name && f.size === file.size)) {
            return prev;
          }
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              size: file.size,
              type: fileType,
              content,
            },
          ];
        });
      };
      reader.onerror = () => {
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  const removeAttachedFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleOpenKb = () => {
    setMenuMode("kb");
    if (onOpenKb) onOpenKb();
  };

  const isLastMessage = (idx: number) => idx === messages.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1">
        {messages.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-400">
            开始新的对话
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg.role === "system") {
            return (
              <div key={idx} className="flex justify-center">
                <div className="w-full rounded-xl border border-black/10 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <span className="mr-2 font-medium text-black">@引用</span>
                  {msg.content.length > 300
                    ? msg.content.slice(0, 300) + "..."
                    : msg.content}
                </div>
              </div>
            );
          }

          const isUser = msg.role === "user";
          const last = isLastMessage(idx);

          return (
            <div
              key={idx}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[85%]">
                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-black text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {msg.role === "assistant" && last && loading ? (
                    <span className="flex items-center gap-1">
                      <span className="animate-pulse">思考中</span>
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce [animation-delay:0.1s]">.</span>
                      <span className="animate-bounce [animation-delay:0.2s]">.</span>
                    </span>
                  ) : msg.role === "assistant" && last ? (
                    <TypewriterText text={msg.content} />
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {parseMarkdownBold(msg.content)}
                    </span>
                  )}
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
                    {msg.sources.map((s) => (
                      <a
                        key={s.id}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2.5 py-0.5 text-[11px] text-gray-500 transition-colors duration-150 hover:bg-gray-50 hover:text-black"
                      >
                        <svg className="h-2.5 w-2.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span className="truncate max-w-[140px]">
                          {s.title || "无标题"}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {attachedFiles.length > 0 && (
        <div className="mb-3 max-h-[200px] overflow-y-auto rounded-xl border border-black/10 bg-white p-2">
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-black/10 bg-gray-50 px-3 py-2 text-sm transition-colors duration-150 hover:border-black/20"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black text-[10px] font-medium text-white">
                  {getFileIcon(file.type)}
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
                  onClick={() => removeAttachedFile(file.id)}
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

      <div className="flex gap-2.5 border-t border-black/10 pt-4">
        <div className="relative" ref={menuRef}>
          <button
            onClick={handleAtClick}
            className="group shrink-0 rounded-xl border border-black/10 px-3 py-3 text-sm text-gray-400 transition-all duration-200 hover:bg-gray-50 hover:text-black"
          >
            @
          </button>

          {menuMode !== "closed" && (
            <div className="absolute bottom-full left-0 mb-2 w-44 animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/5 bg-white py-1.5 shadow-lg">
              <button
                onClick={handleOpenKb}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                抓取网页
              </button>
              <button
                onClick={handleLocalFile}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                本地文件
              </button>

              {menuMode === "kb" && renderKbPanel && (
                <div
                  className="absolute left-full bottom-0 ml-1 w-[620px] animate-[fadeIn_200ms_ease-out] rounded-xl border border-black/5 bg-white shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-black/5 px-4 py-2.5">
                    <span className="text-xs font-medium text-black">知识库</span>
                    <button
                      onClick={() => setMenuMode("menu")}
                      className="text-gray-300 hover:text-black"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  </div>
                  <div className="max-h-[450px] overflow-y-auto px-3 py-2">
                    {renderKbPanel}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-black/10 px-4 py-3 text-sm text-black placeholder-gray-400 transition-shadow duration-200 focus:border-black/30 focus:outline-none focus:shadow-sm"
          placeholder="输入你的问题，Enter 发送，Shift+Enter 换行"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        {onOpenConfig && (
          <div className="relative">
            <button
              onClick={onOpenConfig}
              className="group shrink-0 rounded-xl border border-black/10 px-3 py-3 text-sm text-gray-400 transition-all duration-200 hover:bg-gray-50 hover:text-black"
              title="API 设置"
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
        )}
        <button
          onClick={handleSend}
          disabled={loading || (!input.trim() && attachedFiles.length === 0)}
          className="shrink-0 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:opacity-80 disabled:opacity-30 disabled:hover:scale-100"
        >
          {loading ? (
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            "发送"
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.pdf,.csv,.json"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
