"use client";

import type { ChatMessage } from "@/lib/schema";

// ============================================================================
// Types
// ============================================================================

export type ChatSnapshot = {
  messages: ChatMessage[];
  isStreaming: boolean;
  hasStartedResponse: boolean;
  error: string | null;
};

export type StoredStreamState = {
  id: string;
  assistantId: string | null;
  cursor: number;
  status: "streaming" | "done" | "error";
  startedAt: string;
  error?: string;
};

export type StoredChat = {
  messages: ChatMessage[];
  updatedAt: string;
  stream?: StoredStreamState;
};

export type ChatDb = {
  version: 2;
  users: Record<string, { chats: Record<string, StoredChat> }>;
};

export type ChatMemory = ChatSnapshot & {
  abortController: AbortController | null;
  requestId: number;
  streamId: string | null;
  assistantId: string | null;
  streamCursor: number;
  streamStartedAt: string | null;
};

export type ChatStatePatch = Partial<ChatSnapshot> & {
  messages?: ChatMessage[];
};

// ============================================================================
// Constants
// ============================================================================

const CHAT_DB_KEY = "ttb_chat_db_v2";

// ============================================================================
// Module State
// ============================================================================

export const chatMemory = new Map<string, ChatMemory>();
export const chatSubscribers = new Map<string, Set<(snapshot: ChatSnapshot) => void>>();

// ============================================================================
// localStorage Persistence
// ============================================================================

export function loadChatDb(): ChatDb {
  try {
    const raw = localStorage.getItem(CHAT_DB_KEY);
    if (!raw) return { version: 2, users: {} };
    const parsed = JSON.parse(raw) as ChatDb;
    if (!parsed || parsed.version !== 2 || typeof parsed.users !== "object") {
      return { version: 2, users: {} };
    }
    return { version: 2, users: parsed.users ?? {} };
  } catch {
    return { version: 2, users: {} };
  }
}

export function saveChatDb(db: ChatDb) {
  localStorage.setItem(CHAT_DB_KEY, JSON.stringify(db));
}

export function getUserBucket(db: ChatDb, userId: string) {
  if (!db.users[userId]) {
    db.users[userId] = { chats: {} };
  }
  return db.users[userId];
}

export function getStoredChat(chatId: string, activeUserId: string): StoredChat | null {
  const db = loadChatDb();
  const user = getUserBucket(db, activeUserId);
  return user.chats[chatId] ?? null;
}

export function saveStoredChat(chatId: string, stored: StoredChat, activeUserId: string) {
  const db = loadChatDb();
  const user = getUserBucket(db, activeUserId);
  user.chats[chatId] = stored;
  saveChatDb(db);
}

export function removeStoredChat(chatId: string, activeUserId: string) {
  const db = loadChatDb();
  const user = getUserBucket(db, activeUserId);
  delete user.chats[chatId];
  saveChatDb(db);
}

export function persistChatMessages(chatId: string, messages: ChatMessage[], activeUserId: string) {
  const stored = getStoredChat(chatId, activeUserId) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  saveStoredChat(chatId, {
    ...stored,
    messages,
    updatedAt: new Date().toISOString(),
  }, activeUserId);
}

export function persistStreamState(chatId: string, stream: StoredStreamState | null, activeUserId: string) {
  const stored = getStoredChat(chatId, activeUserId) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  if (stream) {
    saveStoredChat(chatId, {
      ...stored,
      stream,
      updatedAt: new Date().toISOString(),
    }, activeUserId);
  } else {
    const { stream: _removed, ...rest } = stored;
    saveStoredChat(chatId, { ...rest, updatedAt: new Date().toISOString() }, activeUserId);
  }
}

// ============================================================================
// Memory Management
// ============================================================================

export function ensureChatMemory(chatId: string, activeUserId: string): ChatMemory {
  const existing = chatMemory.get(chatId);
  if (existing) return existing;
  const stored = getStoredChat(chatId, activeUserId);
  const stream = stored?.stream;
  const messages = stored?.messages ?? [];
  const hasAssistantContent = messages.some(
    (message) => message.role === "assistant" && message.content.trim().length > 0
  );
  const memory: ChatMemory = {
    messages,
    isStreaming: stream?.status === "streaming",
    hasStartedResponse: Boolean(stream?.cursor || hasAssistantContent),
    error: stream?.status === "error" ? stream.error ?? null : null,
    abortController: null,
    requestId: 0,
    streamId: stream?.id ?? null,
    assistantId: stream?.assistantId ?? null,
    streamCursor: stream?.cursor ?? 0,
    streamStartedAt: stream?.startedAt ?? null,
  };
  chatMemory.set(chatId, memory);
  return memory;
}

export function createSnapshot(memory: ChatMemory): ChatSnapshot {
  return {
    messages: memory.messages,
    isStreaming: memory.isStreaming,
    hasStartedResponse: memory.hasStartedResponse,
    error: memory.error,
  };
}

export function emitChatUpdate(chatId: string, activeUserId: string) {
  const listeners = chatSubscribers.get(chatId);
  if (!listeners || listeners.size === 0) return;
  const snapshot = createSnapshot(ensureChatMemory(chatId, activeUserId));
  listeners.forEach((listener) => listener(snapshot));
}

export function applyChatState(chatId: string, patch: ChatStatePatch, activeUserId: string) {
  const memory = ensureChatMemory(chatId, activeUserId);
  if ("messages" in patch) {
    memory.messages = patch.messages ?? [];
    persistChatMessages(chatId, memory.messages, activeUserId);
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
  emitChatUpdate(chatId, activeUserId);
}

export function writeStreamState(chatId: string, memory: ChatMemory, activeUserId: string, statusOverride?: StoredStreamState["status"]) {
  if (!memory.streamId) return;
  const status =
    statusOverride ??
    (memory.isStreaming ? "streaming" : memory.error ? "error" : "done");
  const stream: StoredStreamState = {
    id: memory.streamId,
    assistantId: memory.assistantId,
    cursor: memory.streamCursor,
    status,
    startedAt: memory.streamStartedAt ?? new Date().toISOString(),
    error: status === "error" ? memory.error ?? undefined : undefined,
  };
  memory.streamStartedAt = stream.startedAt;
  persistStreamState(chatId, stream, activeUserId);
}

export function clearStreamState(chatId: string, memory: ChatMemory, activeUserId: string) {
  memory.streamId = null;
  memory.assistantId = null;
  memory.streamCursor = 0;
  memory.streamStartedAt = null;
  persistStreamState(chatId, null, activeUserId);
}

export function appendChatMessage(chatId: string, message: ChatMessage, activeUserId: string) {
  const memory = ensureChatMemory(chatId, activeUserId);
  applyChatState(chatId, { messages: [...memory.messages, message] }, activeUserId);
}

export function updateChatMessage(chatId: string, messageId: string, content: string, activeUserId: string) {
  const memory = ensureChatMemory(chatId, activeUserId);
  applyChatState(chatId, {
    messages: memory.messages.map((msg) =>
      msg.id === messageId ? { ...msg, content } : msg
    ),
  }, activeUserId);
}

export function removeChatMessage(chatId: string, messageId: string, activeUserId: string) {
  const memory = ensureChatMemory(chatId, activeUserId);
  applyChatState(chatId, {
    messages: memory.messages.filter((msg) => msg.id !== messageId),
  }, activeUserId);
}

export function ensureAssistantMessage(chatId: string, assistantId: string, activeUserId: string, focusFindingId?: string) {
  const memory = ensureChatMemory(chatId, activeUserId);
  const existing = memory.messages.find((msg) => msg.id === assistantId);
  if (existing) return;
  appendChatMessage(chatId, {
    id: assistantId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    focusFindingId,
  }, activeUserId);
}

// ============================================================================
// SSE Streaming
// ============================================================================

export async function streamSse(
  response: Response,
  onEvent: (event: string, data: any) => void,
  isCurrent: () => boolean
) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (!isCurrent()) return;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!rawEvent) continue;

      const lines = rawEvent.split("\n");
      let eventName = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data += line.slice(5).trim();
        }
      }

      if (!data) continue;
      let parsed: any = data;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      onEvent(eventName, parsed);
    }
  }
}

export async function connectToStream({
  chatId,
  response,
  requestId,
  controller,
  activeUserId,
  focusFindingId,
}: {
  chatId: string;
  response: Response;
  requestId: number;
  controller: AbortController;
  activeUserId: string;
  focusFindingId?: string;
}) {
  const isCurrent = () => {
    const current = ensureChatMemory(chatId, activeUserId);
    return (
      current.requestId === requestId &&
      current.abortController === controller &&
      !controller.signal.aborted
    );
  };

  await streamSse(
    response,
    (event, data) => {
      if (!isCurrent()) return;
      const memory = ensureChatMemory(chatId, activeUserId);

      if (event === "meta") {
        if (typeof data?.streamId === "string") {
          memory.streamId = data.streamId;
        }
        if (typeof data?.assistantId === "string") {
          memory.assistantId = data.assistantId;
        }
        if (typeof data?.cursor === "number") {
          memory.streamCursor = data.cursor;
        }
        memory.streamStartedAt = memory.streamStartedAt ?? new Date().toISOString();
        memory.isStreaming = true;
        if (memory.assistantId) {
          ensureAssistantMessage(chatId, memory.assistantId, activeUserId, focusFindingId);
        }
        writeStreamState(chatId, memory, activeUserId, "streaming");
        emitChatUpdate(chatId, activeUserId);
        return;
      }

      if (event === "delta") {
        const assistantId = memory.assistantId ?? data?.assistantId;
        if (!assistantId || typeof data?.delta !== "string") return;
        ensureAssistantMessage(chatId, assistantId, activeUserId, focusFindingId);
        const existing = memory.messages.find((msg) => msg.id === assistantId);
        const nextContent = `${existing?.content ?? ""}${data.delta}`;
        memory.streamCursor = typeof data?.cursor === "number" ? data.cursor : nextContent.length;
        updateChatMessage(chatId, assistantId, nextContent, activeUserId);
        if (!memory.hasStartedResponse) {
          applyChatState(chatId, { hasStartedResponse: true }, activeUserId);
        }
        writeStreamState(chatId, memory, activeUserId, "streaming");
        return;
      }

      if (event === "done") {
        applyChatState(chatId, { isStreaming: false, hasStartedResponse: false }, activeUserId);
        clearStreamState(chatId, memory, activeUserId);
        return;
      }

      if (event === "error") {
        const message =
          typeof data?.message === "string" ? data.message : "Failed to send message";
        applyChatState(chatId, {
          isStreaming: false,
          hasStartedResponse: false,
          error: message,
        }, activeUserId);
        writeStreamState(chatId, memory, activeUserId, "error");
      }
    },
    isCurrent
  );
}
