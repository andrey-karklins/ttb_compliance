"use client";

import { v4 as uuidv4 } from "uuid";
import type { ChatImage, ChatMessage, ComplianceReport } from "@/lib/schema";

const CHAT_STORAGE_PREFIX = "ttb_chat:";

export type ChatSnapshot = {
  messages: ChatMessage[];
  isStreaming: boolean;
  hasStartedResponse: boolean;
  error: string | null;
};

export type ChatStreamParams = {
  chatId: string;
  sessionId: string;
  vectorStoreId: string;
  report: ComplianceReport | null;
  content: string;
  focusFindingId?: string;
  images?: ChatImage[];
};

type ChatMemory = ChatSnapshot & {
  abortController: AbortController | null;
  requestId: number;
};

type ChatStatePatch = Partial<ChatSnapshot> & {
  messages?: ChatMessage[];
};

const chatMemory = new Map<string, ChatMemory>();
const chatSubscribers = new Map<string, Set<(snapshot: ChatSnapshot) => void>>();

function getChatStorageKey(chatId: string): string {
  return `${CHAT_STORAGE_PREFIX}${chatId}`;
}

function loadChatMessages(chatId: string): ChatMessage[] {
  const stored = localStorage.getItem(getChatStorageKey(chatId));
  if (!stored) return [];
  try {
    return JSON.parse(stored) as ChatMessage[];
  } catch {
    return [];
  }
}

function ensureChatMemory(chatId: string): ChatMemory {
  const existing = chatMemory.get(chatId);
  if (existing) return existing;
  const memory: ChatMemory = {
    messages: loadChatMessages(chatId),
    isStreaming: false,
    hasStartedResponse: false,
    error: null,
    abortController: null,
    requestId: 0,
  };
  chatMemory.set(chatId, memory);
  return memory;
}

function createSnapshot(memory: ChatMemory): ChatSnapshot {
  return {
    messages: memory.messages,
    isStreaming: memory.isStreaming,
    hasStartedResponse: memory.hasStartedResponse,
    error: memory.error,
  };
}

function emitChatUpdate(chatId: string) {
  const listeners = chatSubscribers.get(chatId);
  if (!listeners || listeners.size === 0) return;
  const snapshot = createSnapshot(ensureChatMemory(chatId));
  listeners.forEach((listener) => listener(snapshot));
}

function persistChatMessages(chatId: string, messages: ChatMessage[]) {
  const storageKey = getChatStorageKey(chatId);
  if (messages.length > 0) {
    localStorage.setItem(storageKey, JSON.stringify(messages));
  } else {
    localStorage.removeItem(storageKey);
  }
}

function applyChatState(chatId: string, patch: ChatStatePatch) {
  const memory = ensureChatMemory(chatId);
  if ("messages" in patch) {
    memory.messages = patch.messages ?? [];
    persistChatMessages(chatId, memory.messages);
  }
  if (typeof patch.isStreaming === "boolean") {
    memory.isStreaming = patch.isStreaming;
  }
  if (typeof patch.hasStartedResponse === "boolean") {
    memory.hasStartedResponse = patch.hasStartedResponse;
  }
  if ("error" in patch) {
    memory.error = patch.error ?? null;
  }
  emitChatUpdate(chatId);
}

function appendChatMessage(chatId: string, message: ChatMessage) {
  const memory = ensureChatMemory(chatId);
  applyChatState(chatId, { messages: [...memory.messages, message] });
}

function updateChatMessage(chatId: string, messageId: string, content: string) {
  const memory = ensureChatMemory(chatId);
  applyChatState(chatId, {
    messages: memory.messages.map((msg) =>
      msg.id === messageId ? { ...msg, content } : msg
    ),
  });
}

export function getChatSnapshot(chatId: string): ChatSnapshot {
  return createSnapshot(ensureChatMemory(chatId));
}

export function subscribeToChat(chatId: string, listener: (snapshot: ChatSnapshot) => void) {
  const listeners = chatSubscribers.get(chatId) ?? new Set();
  listeners.add(listener);
  chatSubscribers.set(chatId, listeners);
  return () => {
    const current = chatSubscribers.get(chatId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      chatSubscribers.delete(chatId);
    }
  };
}

export function clearChatMemory(chatId: string) {
  const memory = ensureChatMemory(chatId);
  memory.abortController?.abort();
  memory.abortController = null;
  memory.requestId += 1;
  applyChatState(chatId, {
    messages: [],
    isStreaming: false,
    hasStartedResponse: false,
    error: null,
  });
}

export async function startChatStream({
  chatId,
  sessionId,
  vectorStoreId,
  report,
  content,
  focusFindingId,
  images,
}: ChatStreamParams) {
  const memory = ensureChatMemory(chatId);
  if (!content.trim() || memory.isStreaming) return;

  memory.abortController?.abort();
  const controller = new AbortController();
  memory.abortController = controller;
  const requestId = memory.requestId + 1;
  memory.requestId = requestId;

  const userMessage: ChatMessage = {
    id: uuidv4(),
    role: "user",
    content: content.trim(),
    createdAt: new Date().toISOString(),
    focusFindingId,
  };

  const nextMessages = [...memory.messages, userMessage];
  applyChatState(chatId, {
    messages: nextMessages,
    isStreaming: true,
    hasStartedResponse: false,
    error: null,
  });

  const isCurrent = () => {
    const current = ensureChatMemory(chatId);
    return (
      current.requestId === requestId &&
      current.abortController === controller &&
      !controller.signal.aborted
    );
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        vectorStoreId,
        report,
        messages: nextMessages,
        focusFindingId,
        images,
      }),
      signal: controller.signal,
    });

    if (!isCurrent()) return;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to get response");
    }

    if (!response.body) {
      const text = await response.text();
      if (!isCurrent()) return;
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: text,
        createdAt: new Date().toISOString(),
        focusFindingId,
      };
      applyChatState(chatId, { hasStartedResponse: true });
      appendChatMessage(chatId, assistantMessage);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantCreated = false;
    const assistantId = uuidv4();
    let assistantContent = "";

    while (true) {
      const { value, done } = await reader.read();
      if (!isCurrent()) return;
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;

      if (!assistantCreated) {
        assistantCreated = true;
        applyChatState(chatId, { hasStartedResponse: true });
        appendChatMessage(chatId, {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          focusFindingId,
        });
      }

      assistantContent += chunk;
      updateChatMessage(chatId, assistantId, assistantContent);
    }

    assistantContent += decoder.decode();
    if (assistantCreated) {
      updateChatMessage(chatId, assistantId, assistantContent);
    } else if (isCurrent()) {
      throw new Error("No response received");
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      applyChatState(chatId, {
        error: err instanceof Error ? err.message : "Failed to send message",
      });
    }
  } finally {
    if (isCurrent()) {
      applyChatState(chatId, { isStreaming: false, hasStartedResponse: false });
    }
  }
}
