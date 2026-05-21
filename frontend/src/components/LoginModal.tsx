"use client";

import { useState } from "react";

interface UserState {
  isLoggedIn: boolean;
  username: string;
  avatar: string;
}

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (user: UserState) => void;
}

export default function LoginModal({ open, onClose, onLogin }: LoginModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    setMode("login");
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("请输入用户名");
      return;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }

    onLogin({
      isLoggedIn: true,
      username: username.trim(),
      avatar: "",
    });
    resetForm();
    onClose();
  };

  const switchMode = () => {
    setError("");
    setMode((prev) => (prev === "login" ? "register" : "login"));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      <div className="relative z-[101] w-96 animate-[fadeIn_200ms_ease-out] rounded-2xl border border-black/5 bg-white p-8 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 transition-colors duration-150 hover:text-black"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="mb-6 text-center text-lg font-bold text-black">
          {mode === "login" ? "登录 AI Research Workspace" : "注册 AI Research Workspace"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm text-black placeholder-gray-400 outline-none transition-shadow duration-200 focus:border-black/30 focus:shadow-sm"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="password"
            className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm text-black placeholder-gray-400 outline-none transition-shadow duration-200 focus:border-black/30 focus:shadow-sm"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {mode === "register" && (
            <input
              type="password"
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm text-black placeholder-gray-400 outline-none transition-shadow duration-200 focus:border-black/30 focus:shadow-sm"
              placeholder="请确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          )}

          {error && (
            <p className="text-center text-xs text-gray-500">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white transition-all duration-200 hover:opacity-80"
          >
            {mode === "login" ? "登录" : "注册"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            onClick={switchMode}
            className="ml-1 text-black transition-colors duration-150 hover:opacity-70"
          >
            {mode === "login" ? "注册" : "登录"}
          </button>
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
