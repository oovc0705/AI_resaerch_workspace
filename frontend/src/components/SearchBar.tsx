"use client";

import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading?: boolean;
  initialValue?: string;
}

export default function SearchBar({
  onSearch,
  loading = false,
  initialValue = "",
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearched = useRef(initialValue);

  const triggerSearch = (query: string) => {
    if (query === lastSearched.current) return;
    lastSearched.current = query;
    onSearch(query);
  };

  const handleChange = (newValue: string) => {
    setValue(newValue);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      triggerSearch(newValue);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      triggerSearch(value);
    }
  };

  const handleSearchClick = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    triggerSearch(value);
  };

  const handleClear = () => {
    setValue("");
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    triggerSearch("");
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="w-full rounded-lg border border-black/10 px-4 py-2 pl-9 text-xs text-black placeholder-gray-400 transition-shadow duration-200 focus:border-black/30 focus:outline-none focus:shadow-sm"
            placeholder="搜索 URL、标题或正文..."
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <svg
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          {loading && (
            <svg
              className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}

          {value && !loading && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              title="清除搜索"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={handleSearchClick}
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:opacity-80 disabled:opacity-30"
        >
          搜索
        </button>
      </div>
    </div>
  );
}
