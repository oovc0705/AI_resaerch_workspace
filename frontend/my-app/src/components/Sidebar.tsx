"use client";

import { useChat } from "@/context/ChatContext";
import LoginModal from "@/components/LoginModal";

export default function Sidebar() {
  const {
    conversations,
    activeConversationId,
    sidebarOpen,
    setSidebarOpen,
    selectConversation,
    deleteConversation,
    startConversation,
    isTempSession,
    endTempSession,
  } = useChat();

  const savedConversations = conversations.filter((c) => !isTempSession || c.id !== activeConversationId);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity duration-300 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 z-40 h-full bg-[#fafafa] border-r border-[#e5e5e5] flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden"
        }`}
        style={{ minWidth: sidebarOpen ? "260px" : "0" }}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-semibold tracking-wide text-black">历史记录</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e5e5e5] btn-transition text-black"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll p-2">
          {isTempSession && activeConversationId && (
            <div className="mb-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200">
              <div
                onClick={() => selectConversation(activeConversationId)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${
                  activeConversationId === conversations.find((c) => c.id === activeConversationId)?.id
                    ? "text-yellow-800 font-medium"
                    : "text-yellow-700"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                  <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className="text-xs truncate flex-1">
                  {conversations.find((c) => c.id === activeConversationId)?.title || "临时会话"}
                </span>
              </div>
              <button
                onClick={endTempSession}
                className="w-full mt-1 text-[10px] text-yellow-600 hover:text-red-500 btn-transition"
              >
                退出并清除
              </button>
            </div>
          )}
          {savedConversations.length === 0 && !isTempSession && (
            <p className="text-center text-xs text-gray-400 mt-8">暂无记录</p>
          )}
            {savedConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-0.5 transition-colors duration-150 ${
                  activeConversationId === conv.id
                    ? "bg-black text-white"
                    : "text-gray-700 hover:bg-[#e5e5e5]"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0"
                >
                  <path
                    d="M2 4h12M2 8h12M2 12h8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-xs truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className={`shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    activeConversationId === conv.id
                      ? "hover:bg-white/20 text-white"
                      : "hover:bg-gray-300 text-gray-500"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
        </div>

        <div className="p-3 border-t border-[#e5e5e5] space-y-2">
          <button
            onClick={startConversation}
            className="w-full py-2 px-3 bg-black text-white text-xs font-medium rounded-lg btn-transition flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            新对话
          </button>
          <LoginModal />
        </div>
      </aside>
    </>
  );
}
