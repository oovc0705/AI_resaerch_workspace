"use client";

import { useState } from "react";
import { URLResponse } from "@/lib/api";
import TagBadge from "@/components/TagBadge";

interface UrlCardProps {
  item: URLResponse;
  formatRelativeTime: (dateStr: string) => string;
  onDelete: (id: number) => void;
  onToggleExpand: (id: number) => void;
  expanded: boolean;
  onProcessAI: (id: number) => void;
  processingAI: boolean;
  onCite?: (item: URLResponse) => void;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

function getPreview(content: string | null): string {
  if (!content) return "";
  return content.length > 200 ? content.slice(0, 200) + "..." : content;
}

function isProcessed(item: URLResponse): boolean {
  return !!(item.summary || (item.tags && item.tags.length > 0));
}

export default function UrlCard({
  item,
  formatRelativeTime,
  onDelete,
  onToggleExpand,
  expanded,
  onProcessAI,
  processingAI,
  onCite,
}: UrlCardProps) {
  const domain = extractDomain(item.url);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const processed = isProcessed(item);

  return (
    <li className="rounded-xl border border-black/5 bg-white p-4 transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`shrink-0 text-sm font-bold ${item.scraped ? "text-gray-700" : "text-gray-300"}`}
              title={item.scraped ? "抓取成功" : "抓取失败"}
            >
              {item.scraped ? "✓" : "✗"}
            </span>

            <span className="text-xs text-gray-400">{domain}</span>

            <span className="text-xs text-gray-400">
              {formatRelativeTime(item.created_at)}
            </span>

            {item.scraped && !processed && (
              <span className="rounded border border-black/10 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
                待 AI 处理
              </span>
            )}
            {item.scraped && processed && (
              <span className="rounded border border-black/10 bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                AI 已处理
              </span>
            )}
          </div>

          {item.scraped && item.title ? (
            <button
              onClick={() => onToggleExpand(item.id)}
              className="mt-1 text-left text-sm font-medium text-gray-800 transition-colors duration-150 hover:text-black"
            >
              {item.title}
            </button>
          ) : (
            <div className="mt-1">
              <p className="text-sm text-gray-400">抓取失败</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {item.error || "未记录错误详情（请删除后重新提交）"}
              </p>
            </div>
          )}

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-xs text-gray-400 transition-colors duration-150 hover:text-black"
          >
            {item.url}
          </a>

          {item.tags && item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}

          {item.summary && (
            <div className="mt-2">
              <button
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="flex items-center gap-1 text-xs text-gray-500 transition-colors duration-150 hover:text-black"
              >
                <svg
                  className={`h-3 w-3 transition-transform ${summaryExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                AI 摘要
              </button>
              {summaryExpanded && (
                <p className="mt-1 rounded-lg border border-black/5 bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
                  {item.summary}
                </p>
              )}
            </div>
          )}

          {item.scraped && item.content && (
            <p className="mt-1 text-xs leading-relaxed text-gray-400 line-clamp-2">
              {getPreview(item.content)}
            </p>
          )}

          {expanded && item.content && (
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-black/5 bg-gray-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {item.content}
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {onCite && item.scraped && (
            <button
              onClick={() => onCite(item)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-gray-600 transition-all duration-150 hover:bg-gray-50"
              title="引用到当前会话"
            >
              引用
            </button>
          )}
          {item.scraped && !processed && (
            <button
              onClick={() => onProcessAI(item.id)}
              disabled={processingAI}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-gray-600 transition-all duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processingAI ? "处理中..." : "AI 处理"}
            </button>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-all duration-150 hover:bg-gray-50 hover:text-gray-700"
          >
            删除
          </button>
        </div>
      </div>
    </li>
  );
}
