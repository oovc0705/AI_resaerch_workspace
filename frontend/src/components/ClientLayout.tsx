"use client";

import { useState, type ReactNode } from "react";
import { ChatProvider, useChatContext, type Conversation } from "@/context/ChatContext";
import Sidebar from "@/components/Sidebar";
import LoginModal from "@/components/LoginModal";

interface UserState {
  isLoggedIn: boolean;
  username: string;
  avatar: string;
}

function LayoutInner({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    username: "",
    avatar: "",
  });
  const { setActiveConversationId, savePendingConversation } = useChatContext();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const handleSelectConversation = (conv: Conversation) => {
    savePendingConversation();
    setActiveConversationId(conv.id);
    setSidebarOpen(false);
  };

  const handleNewConversation = () => {
    savePendingConversation();
    setActiveConversationId(null);
    setSidebarOpen(false);
  };

  const handleLoginClick = () => {
    setLoginModalOpen(true);
  };

  const handleLogin = (loggedInUser: UserState) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    setUser({ isLoggedIn: false, username: "", avatar: "" });
  };

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="group fixed left-0.5 top-2 z-50 flex h-10 w-8 items-center justify-center text-black transition-all duration-300 hover:text-gray-500"
        style={{ transform: sidebarOpen ? "translateX(288px)" : "translateX(0)" }}
      >
        <svg
          className={`h-8 w-7 -rotate-90 transition-transform duration-300 ${sidebarOpen ? "-scale-x-100" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 28 22"
        >
          <rect x="2" y="2" width="24" height="18" rx="2" />
          <line x1="9" y1="11" x2="19" y2="11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 15l2 2 2-2" />
        </svg>
        <span className="pointer-events-none absolute left-full ml-1.5 whitespace-nowrap rounded-md border border-black/5 bg-white px-2 py-1 text-xs text-gray-600 opacity-0 shadow-sm transition-opacity duration-75 group-hover:opacity-100">
          展开侧边栏
        </span>
      </button>

      <Sidebar
        open={sidebarOpen}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        user={user}
        onLoginClick={handleLoginClick}
        onLogout={handleLogout}
      />

      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onLogin={handleLogin}
      />

      {children}
    </>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <ChatProvider>
      <LayoutInner>{children}</LayoutInner>
    </ChatProvider>
  );
}
