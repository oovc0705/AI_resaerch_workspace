"use client";

import { useChat } from "@/context/ChatContext";
import { ChatMessage } from "@/lib/api";
import { useRef, useEffect } from "react";

export default function ChatArea() {
  const { activeConversation, isLoading } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages, isLoading]);

  if (!activeConversation) return null;

  return (
    <div className="flex-1 overflow-y-auto chat-scroll px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {activeConversation.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex items-center gap-3 animate-fadeIn">
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l5-5 5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex gap-1.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 animate-fadeIn ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-[#e5e5e5]" : "bg-black"
        }`}
      >
        {isUser ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 12.5c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7l5-5 5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      <div className={`flex-1 ${isUser ? "flex flex-col items-end" : ""}`}>
        <div
          className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-black text-white rounded-br-lg"
              : "bg-[#f5f5f5] text-black rounded-bl-lg"
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.sources && message.sources.length > 0 && !isUser && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 bg-[#fafafa] border border-[#e5e5e5] rounded-full text-xs text-gray-600 hover:text-black hover:border-black transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M6 1h3v3M9 1L4.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {src.title || `来源 ${i + 1}`}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
