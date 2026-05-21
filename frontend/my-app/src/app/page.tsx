"use client";

import { ChatProvider, useChat } from "@/context/ChatContext";
import Sidebar from "@/components/Sidebar";
import ChatInput from "@/components/ChatInput";
import ChatArea from "@/components/ChatArea";
import TemporarySessionButton from "@/components/TemporarySession";

export default function Home() {
  return (
    <ChatProvider>
      <HomeContent />
    </ChatProvider>
  );
}

function HomeContent() {
  const {
    sidebarOpen,
    setSidebarOpen,
    isLanding,
    isTempSession,
    activeConversation,
    endTempSession,
  } = useChat();

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar />

      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "ml-[260px]" : "ml-0"
        }`}
      >
        <header className="h-12 flex items-center justify-between px-4 bg-white shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e5e5e5] btn-transition text-gray-600"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {isTempSession && (
              <span className="px-2 py-0.5 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded text-[10px] font-medium">
                临时
              </span>
            )}
            {activeConversation && (
              <span className="text-xs text-gray-400 truncate max-w-[200px]">
                {activeConversation.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isTempSession && (
              <button
                onClick={endTempSession}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 btn-transition"
              >
                退出临时会话
              </button>
            )}
            <TemporarySessionButton />
          </div>
        </header>

        <div className="flex-1 flex flex-col min-h-0">
          {isLanding ? (
            <div className="flex-1 flex flex-col items-center px-4" style={{ justifyContent: "center", paddingBottom: "20vh" }}>
              <div className="text-center mb-10 animate-fadeIn">
                <h2 className="text-4xl font-bold text-black tracking-tight">
                  AI Research Workspace
                </h2>
              </div>
              <div className="w-full animate-fadeIn" style={{ animationDelay: "0.1s" }}>
                <ChatInput />
              </div>
            </div>
          ) : (
            <ChatArea />
          )}

          {!isLanding && (
            <div className="px-4 pb-4 bg-white border-t border-transparent">
              <ChatInput />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
