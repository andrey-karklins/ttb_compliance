"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { clearChatMemory, setChatUserId } from "@/lib/chatStore";
import type { NavItem, ChatThread } from "@/lib/mockData";
import {
  SESSION_KEY,
  CHAT_THREADS_KEY,
  ACTIVE_CHAT_KEY,
  DEFAULT_CHAT_TITLE,
  loadFromStorage,
  deriveChatTitle,
} from "@/lib/mockData";

export function useAppState() {
  // Navigation state
  const [activeNav, setActiveNav] = useState<NavItem>("dashboard");

  // Session state
  const [sessionId, setSessionId] = useState<string>("");

  // Chat thread state
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [pendingChatId, setPendingChatId] = useState<string>(() => uuidv4());

  // Initialize session (cookie-backed, local cache for resilience)
  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      const storedId = localStorage.getItem(SESSION_KEY);
      try {
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: storedId }),
        });
        const data = response.ok ? await response.json() : null;
        const nextId = data?.sessionId || storedId || uuidv4();
        localStorage.setItem(SESSION_KEY, nextId);
        if (isMounted) {
          setSessionId(nextId);
          setChatUserId(nextId);
        }
      } catch {
        const fallbackId = storedId || uuidv4();
        localStorage.setItem(SESSION_KEY, fallbackId);
        if (isMounted) {
          setSessionId(fallbackId);
          setChatUserId(fallbackId);
        }
      }
    };
    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load chat threads from localStorage on mount
  useEffect(() => {
    const storedChatThreads = loadFromStorage<ChatThread[]>(CHAT_THREADS_KEY, []);

    const normalizedChatThreads: ChatThread[] = storedChatThreads.map((thread) => ({
      id: thread.id,
      title: thread.title || DEFAULT_CHAT_TITLE,
      createdAt: thread.createdAt || new Date().toISOString(),
      updatedAt: thread.updatedAt || thread.createdAt || new Date().toISOString(),
    }));

    const storedActiveChatId = localStorage.getItem(ACTIVE_CHAT_KEY);

    const sortedChats = [...normalizedChatThreads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const nextActiveChatId =
      storedActiveChatId && normalizedChatThreads.some((thread) => thread.id === storedActiveChatId)
        ? storedActiveChatId
        : sortedChats[0]?.id ?? "";

    setChatThreads(normalizedChatThreads);
    setActiveChatId(nextActiveChatId);
  }, []);

  // Persist chat threads to localStorage
  useEffect(() => {
    localStorage.setItem(CHAT_THREADS_KEY, JSON.stringify(chatThreads));
  }, [chatThreads]);

  // Persist active chat ID to localStorage
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem(ACTIVE_CHAT_KEY, activeChatId);
    }
  }, [activeChatId]);

  // Sorted chat threads (most recent first)
  const sortedChatThreads = useMemo(
    () =>
      [...chatThreads].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [chatThreads]
  );

  // Called when user sends first message - creates thread if needed
  const handleChatActivity = useCallback((chatId: string, content: string) => {
    const now = new Date().toISOString();
    const existingThread = chatThreads.find((t) => t.id === chatId);

    if (!existingThread) {
      const newThread: ChatThread = {
        id: chatId,
        title: deriveChatTitle(content),
        createdAt: now,
        updatedAt: now,
      };
      setChatThreads((prev) => [newThread, ...prev]);
      setActiveChatId(chatId);
      setActiveNav("pilot");
    } else {
      setChatThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== chatId) return thread;
          return { ...thread, updatedAt: now };
        })
      );
    }
  }, [chatThreads]);

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveNav("pilot");
  }, []);

  // Start a new chat - doesn't create thread until first message
  const handleNewChat = useCallback(() => {
    setActiveChatId("");
    setActiveNav("pilot");
    setPendingChatId(uuidv4());
  }, []);

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      setChatThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== chatId);
        if (chatId === activeChatId) {
          const nextActive = remaining[0]?.id ?? "";
          setActiveChatId(nextActive);
          if (!nextActive) {
            setPendingChatId(uuidv4());
          }
        }
        return remaining;
      });
      clearChatMemory(chatId);
    },
    [activeChatId]
  );

  return {
    // Navigation
    activeNav,
    setActiveNav,
    // Session
    sessionId,
    // Chat threads
    chatThreads,
    setChatThreads,
    activeChatId,
    setActiveChatId,
    pendingChatId,
    sortedChatThreads,
    // Chat handlers
    handleChatActivity,
    handleSelectChat,
    handleNewChat,
    handleDeleteChat,
  };
}
