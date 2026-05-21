"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useChatContext, type Conversation } from "@/context/ChatContext";

interface UserState {
  isLoggedIn: boolean;
  username: string;
  avatar: string;
}

interface SidebarProps {
  open: boolean;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  user: UserState;
  onLoginClick: () => void;
  onLogout: () => void;
}

function formatTime(dateStr: string): string {
  try {
    return formatDistanceToNowStrict(new Date(dateStr), {
      addSuffix: true,
      locale: zhCN,
    });
  } catch {
    return dateStr;
  }
}

export default function Sidebar({
  open,
  onSelectConversation,
  onNewConversation,
  user,
  onLoginClick,
  onLogout,
}: SidebarProps) {
  const { conversations, deleteConversation } = useChatContext();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity duration-300"
          onClick={() => {}}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-black/5 bg-white transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <span className="text-sm font-medium text-black">对话历史</span>
          <button
            onClick={onNewConversation}
            className="group relative rounded-lg p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-black"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-black/5 bg-white px-2 py-1 text-xs text-gray-600 opacity-0 shadow-sm transition-opacity duration-75 group-hover:opacity-100">
              新建对话
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-gray-400">
              暂无历史对话
            </div>
          ) : (
            <ul className="space-y-0.5 px-2 py-2">
              {conversations.map((conv) => (
                <li key={conv.id} className="group relative">
                  <button
                    onClick={() => onSelectConversation(conv)}
                    className="w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-gray-50"
                  >
                    <p className="truncate text-sm text-gray-700">
                      {conv.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatTime(conv.createdAt)}
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-300 opacity-0 transition-all duration-150 hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100"
                    title="删除对话"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-black/5 px-4 py-3">
          {user.isLoggedIn ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-700">{user.username}</span>
              </div>
              <button
                onClick={onLogout}
                className="rounded-lg px-2 py-1 text-xs text-gray-400 transition-colors duration-150 hover:bg-gray-50 hover:text-black"
              >
                退出
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 transition-colors duration-150 hover:bg-gray-50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-black/15">
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400">未登录</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
