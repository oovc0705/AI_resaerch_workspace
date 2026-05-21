"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import {
  ChatMessage,
  Conversation,
  askQuestion,
  askWithFiles,
  createUrl,
  generateId,
} from "@/lib/api";

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  isTempSession: boolean;
  isLoading: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeConversation: Conversation | null;
  isLanding: boolean;

  startConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string, files?: { filename: string; content: string }[]) => Promise<void>;
  startTempSession: () => void;
  endTempSession: () => void;
  clearCurrentConversation: () => void;
}

const STORAGE_KEY = "ai_research_conversations";

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch { /* ignore */ }
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isTempSession, setIsTempSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLanding, setIsLanding] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const saved = loadConversations();
    setConversations(saved);
  }, []);

  useEffect(() => {
    if (initialized.current) {
      saveConversations(conversations);
    }
  }, [conversations]);

  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId) || null
    : null;

  const startConversation = useCallback(() => {
    const id = generateId();
    const conv: Conversation = {
      id,
      title: "新对话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => {
      const next = [conv, ...prev];
      saveConversations(next);
      return next;
    });
    setActiveConversationId(id);
    setIsTempSession(false);
    setIsLanding(false);
    return id;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setIsTempSession(false);
    setIsLanding(false);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setIsLanding(true);
    }
  }, [activeConversationId]);

  const startTempSession = useCallback(() => {
    const id = generateId();
    const conv: Conversation = {
      id,
      title: "临时会话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(id);
    setIsTempSession(true);
    setIsLanding(false);
  }, []);

  const endTempSession = useCallback(() => {
    if (isTempSession && activeConversationId) {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== activeConversationId);
        saveConversations(next);
        return next;
      });
    }
    setActiveConversationId(null);
    setIsTempSession(false);
    setIsLanding(true);
  }, [isTempSession, activeConversationId]);

  const clearCurrentConversation = useCallback(() => {
    setActiveConversationId(null);
    setIsTempSession(false);
    setIsLanding(true);
  }, []);

  const sendMessage = useCallback(
    async (content: string, files?: { filename: string; content: string }[]) => {
      let convId = activeConversationId;
      if (!convId) {
        convId = generateId();
        const conv: Conversation = {
          id: convId,
          title: content.slice(0, 30) + (content.length > 30 ? "..." : ""),
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(convId);
        setIsLanding(false);
      }

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, userMsg],
                updatedAt: Date.now(),
              }
            : c
        )
      );

      setIsLoading(true);

      try {
        let response;
        if (files && files.length > 0) {
          response = await askWithFiles(content, files);
        } else {
          response = await askQuestion(content);
        }

        const assistantMsg: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          timestamp: Date.now(),
        };

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, assistantMsg],
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      } catch (error) {
        const errorMsg: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: error instanceof Error ? `错误: ${error.message}` : "请求失败，请稍后重试",
          timestamp: Date.now(),
        };

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, errorMsg],
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId]
  );

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        isTempSession,
        isLoading,
        sidebarOpen,
        setSidebarOpen,
        activeConversation,
        isLanding,
        startConversation,
        selectConversation,
        deleteConversation,
        sendMessage,
        startTempSession,
        endTempSession,
        clearCurrentConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
