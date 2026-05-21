"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ai_workspace_api_config";

export interface ApiConfig {
  api_key: string;
  base_url: string;
  model: string;
  embedding_model: string;
}

interface ApiConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (config: ApiConfig) => void;
}

function loadFromStorage(): ApiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { api_key: "", base_url: "", model: "", embedding_model: "" };
}

function saveToStorage(config: ApiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export default function ApiConfigModal({ open, onClose, onSaved }: ApiConfigModalProps) {
  const [config, setConfig] = useState<ApiConfig>(loadFromStorage);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setConfig(loadFromStorage());
      setTestResult(null);
    }
  }, [open]);

  if (!open) return null;

  const update = (key: keyof ApiConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setTestResult(data.status === "ok" ? "✓ 连接成功" : `✗ ${data.message}`);
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : "网络错误"}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    saveToStorage(config);
    try {
      await fetch("http://localhost:8000/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
    } catch {}
    setSaving(false);
    onSaved(config);
    onClose();
  };

  const fields: { key: keyof ApiConfig; label: string; placeholder: string; type: string }[] = [
    { key: "api_key", label: "API Key", placeholder: "sk-...", type: "password" },
    { key: "base_url", label: "Base URL", placeholder: "https://api.openai.com", type: "text" },
    { key: "model", label: "模型", placeholder: "gpt-4o-mini", type: "text" },
    { key: "embedding_model", label: "Embedding 模型", placeholder: "text-embedding-ada-002", type: "text" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md animate-[fadeIn_200ms_ease-out] rounded-2xl border border-black/5 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
          <div>
            <h2 className="text-sm font-medium text-black">API 配置</h2>
            <p className="mt-0.5 text-xs text-gray-400">设置你的 LLM API 连接信息</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-50 hover:text-black"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">{f.label}</label>
              <div className="relative">
                <input
                  type={f.type}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm text-black placeholder-gray-400 transition-shadow duration-200 focus:border-black/30 focus:outline-none focus:shadow-sm"
                  placeholder={f.placeholder}
                  value={config[f.key]}
                  onChange={update(f.key)}
                />
                {f.key === "api_key" && config.api_key && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    {config.api_key.length} 字符
                  </span>
                )}
              </div>
            </div>
          ))}

          {testResult && (
            <div
              className={`rounded-lg px-3 py-2 text-xs ${
                testResult.startsWith("✓")
                  ? "bg-gray-50 text-gray-700"
                  : "bg-gray-50 text-gray-500"
              }`}
            >
              {testResult}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-black/5 px-6 py-4">
          <p className="text-xs text-gray-400">
            未配置则使用服务端默认值
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing || !config.api_key || !config.base_url}
              className="rounded-lg border border-black/10 px-4 py-2 text-xs font-medium text-gray-700 transition-all duration-150 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {testing ? "测试中..." : "测试连接"}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !config.api_key || !config.base_url}
              className="rounded-lg bg-black px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
