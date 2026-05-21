"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: { id: number; title: string; url: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
}

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  saveConversation: (messages: Message[]) => string;
  loadConversation: (id: string) => Conversation | undefined;
  deleteConversation: (id: string) => void;
  pendingMessages: Message[];
  setPendingMessages: (messages: Message[]) => void;
  savePendingConversation: () => void;
  cleanupPendingConversation: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

function generateTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "空对话";
  const content = firstUser.content.replace(/\n/g, " ");
  return content.length > 30 ? content.slice(0, 30) + "..." : content;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
  const pendingRef = useRef<string | null>(null);

  const saveConversation = useCallback(
    (messages: Message[]): string => {
      if (messages.length === 0) return "";
      const id = pendingRef.current || Date.now().toString();
      const title = generateTitle(messages);
      const conversation: Conversation = {
        id,
        title,
        messages,
        createdAt: new Date().toISOString(),
      };
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        return [conversation, ...filtered];
      });
      setActiveConversationId(id);
      setPendingMessages([]);
      pendingRef.current = null;
      return id;
    },
    [],
  );

  const savePendingConversation = useCallback(() => {
    if (pendingMessages.length === 0) return;
    saveConversation(pendingMessages);
  }, [pendingMessages, saveConversation]);

  const loadConversation = useCallback(
    (id: string) => {
      return conversations.find((c) => c.id === id);
    },
    [conversations],
  );

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConversationId((current) => (current === id ? null : current));
    if (pendingRef.current === id) {
      pendingRef.current = null;
    }
  }, []);

  const cleanupPendingConversation = useCallback(() => {
    setPendingMessages([]);
    pendingRef.current = null;
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        setActiveConversationId,
        saveConversation,
        loadConversation,
        deleteConversation,
        pendingMessages,
        setPendingMessages,
        savePendingConversation,
        cleanupPendingConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
