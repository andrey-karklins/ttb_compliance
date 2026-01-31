"use client";

import { v4 as uuidv4 } from "uuid";
import type { ChatImage, ChatMessage, ComplianceReport } from "@/lib/schema";
import {
  chatMemory,
  chatSubscribers,
  loadChatDb,
  saveChatDb,
  getUserBucket,
  getStoredChat,
  removeStoredChat,
  ensureChatMemory,
  createSnapshot,
  applyChatState,
  writeStreamState,
  clearStreamState,
  appendChatMessage,
  removeChatMessage,
  persistStreamState,
  connectToStream,
  type ChatSnapshot,
  type StoredStreamState,
} from "./chat/chatEngine";

// Re-export public types
export type { ChatSnapshot } from "./chat/chatEngine";

export type ChatStreamParams = {
  chatId: string;
  vectorStoreId: string;
  report: ComplianceReport | null;
  content: string;
  focusFindingId?: string;
  images?: ChatImage[];
};

// ============================================================================
// User Management
// ============================================================================

let chatUserId: string | null = null;

function getActiveUserId() {
  return chatUserId ?? "local";
}

export function setChatUserId(userId: string) {
  if (chatUserId && chatUserId !== userId) {
    chatMemory.clear();
  }
  chatUserId = userId;
  const db = loadChatDb();
  getUserBucket(db, userId);
  saveChatDb(db);
}

// ============================================================================
// Public API
// ============================================================================

export function getChatSnapshot(chatId: string): ChatSnapshot {
  return createSnapshot(ensureChatMemory(chatId, getActiveUserId()));
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
  const userId = getActiveUserId();
  const memory = ensureChatMemory(chatId, userId);
  memory.abortController?.abort();
  memory.abortController = null;
  memory.requestId += 1;
  clearStreamState(chatId, memory, userId);
  applyChatState(chatId, {
    messages: [],
    isStreaming: false,
    hasStartedResponse: false,
    error: null,
  }, userId);
  removeStoredChat(chatId, userId);
  void fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`, { method: "DELETE" }).catch(
    () => undefined
  );
}

export async function syncChatHistory(chatId: string) {
  const userId = getActiveUserId();
  try {
    const response = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !Array.isArray(data.messages)) return;

    const memory = ensureChatMemory(chatId, userId);
    if (data.messages.length > memory.messages.length) {
      applyChatState(chatId, { messages: data.messages }, userId);
    }

    if (data.activeStream && data.activeStream.status === "streaming") {
      const stored = getStoredChat(chatId, userId);
      const assistantId = data.activeStream.assistantId as string | undefined;
      const messageCursor =
        assistantId &&
        memory.messages.find((msg) => msg.id === assistantId)?.content.length;
      const cursor = Math.max(
        stored?.stream?.cursor ?? 0,
        typeof messageCursor === "number" ? messageCursor : 0
      );
      const streamState: StoredStreamState = {
        id: data.activeStream.id,
        assistantId: assistantId ?? null,
        cursor,
        status: "streaming",
        startedAt: stored?.stream?.startedAt ?? new Date().toISOString(),
      };
      persistStreamState(chatId, streamState, userId);
    }
  } catch {
    // Ignore sync errors for MVP resilience
  }
}

export async function resumeChatStream(chatId: string) {
  const userId = getActiveUserId();
  const memory = ensureChatMemory(chatId, userId);
  if (memory.isStreaming) return;
  const stored = getStoredChat(chatId, userId);
  if (!stored?.stream || stored.stream.status !== "streaming" || !stored.stream.id) return;

  memory.abortController?.abort();
  const controller = new AbortController();
  memory.abortController = controller;
  const requestId = memory.requestId + 1;
  memory.requestId = requestId;

  memory.streamId = stored.stream.id;
  memory.assistantId = stored.stream.assistantId ?? null;
  memory.streamCursor = stored.stream.cursor ?? 0;
  memory.streamStartedAt = stored.stream.startedAt ?? new Date().toISOString();

  applyChatState(chatId, {
    isStreaming: true,
    hasStartedResponse: memory.streamCursor > 0,
    error: null,
  }, userId);
  writeStreamState(chatId, memory, userId, "streaming");

  try {
    const response = await fetch(
      `/api/chat?streamId=${encodeURIComponent(memory.streamId)}&cursor=${memory.streamCursor}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to resume stream");
    }
    await connectToStream({ chatId, response, requestId, controller, activeUserId: userId });
  } catch (err) {
    if (!controller.signal.aborted) {
      applyChatState(chatId, {
        error: err instanceof Error ? err.message : "Failed to resume stream",
        isStreaming: false,
        hasStartedResponse: false,
      }, userId);
      writeStreamState(chatId, memory, userId, "error");
    }
  }
}

export async function startChatStream({
  chatId,
  vectorStoreId,
  report,
  content,
  focusFindingId,
  images,
}: ChatStreamParams) {
  const userId = getActiveUserId();
  const memory = ensureChatMemory(chatId, userId);
  if (!content.trim()) return;

  if (memory.isStreaming) {
    await resumeChatStream(chatId);
    return;
  }

  const stored = getStoredChat(chatId, userId);
  if (stored?.stream?.status === "streaming") {
    await resumeChatStream(chatId);
    return;
  }

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

  appendChatMessage(chatId, userMessage, userId);
  applyChatState(chatId, {
    isStreaming: true,
    hasStartedResponse: false,
    error: null,
  }, userId);

  const isCurrent = () => {
    const current = ensureChatMemory(chatId, userId);
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
        chatId,
        vectorStoreId,
        report,
        content: content.trim(),
        focusFindingId,
        images,
      }),
      signal: controller.signal,
    });

    if (!isCurrent()) return;

    if (response.status === 409) {
      const payload = await response.json().catch(() => null);
      if (payload?.streamId) {
        removeChatMessage(chatId, userMessage.id, userId);
        const storedStream: StoredStreamState = {
          id: payload.streamId,
          assistantId: null,
          cursor: 0,
          status: "streaming",
          startedAt: new Date().toISOString(),
        };
        persistStreamState(chatId, storedStream, userId);
        await resumeChatStream(chatId);
        return;
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to get response");
    }

    await connectToStream({ chatId, response, requestId, controller, activeUserId: userId, focusFindingId });
  } catch (err) {
    if (!controller.signal.aborted) {
      applyChatState(chatId, {
        error: err instanceof Error ? err.message : "Failed to send message",
        isStreaming: false,
        hasStartedResponse: false,
      }, userId);
      writeStreamState(chatId, memory, userId, "error");
    }
  }
}
