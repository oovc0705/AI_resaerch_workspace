"use client";

import { useState, useEffect } from "react";

interface StoredUser {
  username: string;
  password: string;
}

const USERS_KEY = "ai_research_users";
const SESSION_KEY = "ai_research_session";

function loadUsers(): StoredUser[] {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch { /* ignore */ }
}

export default function LoginModal() {
  const [showModal, setShowModal] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState("");

  useEffect(() => {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session) {
      setIsLoggedIn(true);
      setCurrentUser(session);
    } else {
      const local = localStorage.getItem(SESSION_KEY);
      if (local) {
        setIsLoggedIn(true);
        setCurrentUser(local);
      }
    }
  }, []);

  const handleAuth = () => {
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("请填写完整信息");
      return;
    }

    const users = loadUsers();

    if (isRegister) {
      if (password !== confirmPassword) {
        setError("两次密码不一致");
        return;
      }
      if (users.some((u) => u.username === username.trim())) {
        setError("用户名已存在");
        return;
      }
      users.push({ username: username.trim(), password: password.trim() });
      saveUsers(users);
      setIsRegister(false);
      setError("");
      setPassword("");
      setConfirmPassword("");
      setUsername("");
      return;
    }

    const found = users.find(
      (u) => u.username === username.trim() && u.password === password.trim()
    );
    if (found) {
      setIsLoggedIn(true);
      setCurrentUser(username.trim());
      sessionStorage.setItem(SESSION_KEY, username.trim());
      setShowModal(false);
      setError("");
      setUsername("");
      setPassword("");
    } else {
      setError("用户名或密码错误");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser("");
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  };

  const switchMode = () => {
    setIsRegister(!isRegister);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  if (!isLoggedIn) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-2 px-3 border border-black text-black text-xs font-medium rounded-lg btn-transition flex items-center justify-center gap-2 hover:bg-black hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 12.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          登录
        </button>

        {showModal && (
          <>
            <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setShowModal(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[360px] bg-white rounded-2xl shadow-2xl animate-slideDown overflow-hidden">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => { setIsRegister(false); setError(""); }}
                    className={`text-base font-semibold pb-1 border-b-2 btn-transition ${
                      !isRegister ? "text-black border-black" : "text-gray-400 border-transparent hover:text-gray-600"
                    }`}
                  >
                    登录
                  </button>
                  <button
                    onClick={() => { setIsRegister(true); setError(""); }}
                    className={`text-base font-semibold pb-1 border-b-2 btn-transition ${
                      isRegister ? "text-black border-black" : "text-gray-400 border-transparent hover:text-gray-600"
                    }`}
                  >
                    注册
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="用户名"
                      className="w-full px-3 py-2.5 text-sm border border-[#d1d1d1] rounded-lg focus:outline-none focus:border-black transition-colors"
                      onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="密码"
                      className="w-full px-3 py-2.5 text-sm border border-[#d1d1d1] rounded-lg focus:outline-none focus:border-black transition-colors"
                      onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                    />
                  </div>
                  {isRegister && (
                    <div>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="确认密码"
                        className="w-full px-3 py-2.5 text-sm border border-[#d1d1d1] rounded-lg focus:outline-none focus:border-black transition-colors"
                        onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                      />
                    </div>
                  )}
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <button
                    onClick={handleAuth}
                    className="w-full py-2.5 bg-black text-white text-sm font-medium rounded-lg btn-transition"
                  >
                    {isRegister ? "注册" : "登录"}
                  </button>
                  {isRegister && (
                    <p className="text-center text-xs text-gray-400">
                      注册成功后将自动返回登录
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="p-3 border-t border-[#e5e5e5]">
      <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
        <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="4" r="2" stroke="white" strokeWidth="1" />
            <path d="M2 11c0-2 2-3.5 4-3.5s4 1.5 4 3.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-xs font-medium text-black">{currentUser}</span>
      </div>
      <button
        onClick={handleLogout}
        className="w-full py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg btn-transition"
      >
        退出登录
      </button>
    </div>
  );
}
