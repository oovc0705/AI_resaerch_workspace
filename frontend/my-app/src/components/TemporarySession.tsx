"use client";

import { useChat } from "@/context/ChatContext";

export default function TemporarySessionButton() {
  const { isTempSession, startTempSession } = useChat();

  return (
    <button
      onClick={startTempSession}
      disabled={isTempSession}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium btn-transition ${
        isTempSession
          ? "bg-yellow-100 text-yellow-700 border border-yellow-300 cursor-default"
          : "border border-[#d1d1d1] text-gray-600 hover:border-black hover:text-black"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M1 7h12M7 1v12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {isTempSession ? "临时会话中" : "临时会话"}
    </button>
  );
}
