"use client";

import { v4 as uuidv4 } from "uuid";
import type { ChatImage, ChatMessage, ComplianceReport } from "@/lib/schema";

const CHAT_DB_KEY = "ttb_chat_db_v2";

export type ChatSnapshot = {
  messages: ChatMessage[];
  isStreaming: boolean;
  hasStartedResponse: boolean;
  error: string | null;
};

export type ChatStreamParams = {
  chatId: string;
  vectorStoreId: string;
  report: ComplianceReport | null;
  content: string;
  focusFindingId?: string;
  images?: ChatImage[];
};

type StoredStreamState = {
  id: string;
  assistantId: string | null;
  cursor: number;
  status: "streaming" | "done" | "error";
  startedAt: string;
  error?: string;
};

type StoredChat = {
  messages: ChatMessage[];
  updatedAt: string;
  stream?: StoredStreamState;
};

type ChatDb = {
  version: 2;
  users: Record<string, { chats: Record<string, StoredChat> }>;
};

type ChatMemory = ChatSnapshot & {
  abortController: AbortController | null;
  requestId: number;
  streamId: string | null;
  assistantId: string | null;
  streamCursor: number;
  streamStartedAt: string | null;
};

type ChatStatePatch = Partial<ChatSnapshot> & {
  messages?: ChatMessage[];
};

const chatMemory = new Map<string, ChatMemory>();
const chatSubscribers = new Map<string, Set<(snapshot: ChatSnapshot) => void>>();

let chatUserId: string | null = null;

function getActiveUserId() {
  return chatUserId ?? "local";
}

function loadChatDb(): ChatDb {
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

function saveChatDb(db: ChatDb) {
  localStorage.setItem(CHAT_DB_KEY, JSON.stringify(db));
}

function getUserBucket(db: ChatDb, userId: string) {
  if (!db.users[userId]) {
    db.users[userId] = { chats: {} };
  }
  return db.users[userId];
}

function getStoredChat(chatId: string): StoredChat | null {
  const db = loadChatDb();
  const user = getUserBucket(db, getActiveUserId());
  return user.chats[chatId] ?? null;
}

function saveStoredChat(chatId: string, stored: StoredChat) {
  const db = loadChatDb();
  const user = getUserBucket(db, getActiveUserId());
  user.chats[chatId] = stored;
  saveChatDb(db);
}

function removeStoredChat(chatId: string) {
  const db = loadChatDb();
  const user = getUserBucket(db, getActiveUserId());
  delete user.chats[chatId];
  saveChatDb(db);
}

function persistChatMessages(chatId: string, messages: ChatMessage[]) {
  const stored = getStoredChat(chatId) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  saveStoredChat(chatId, {
    ...stored,
    messages,
    updatedAt: new Date().toISOString(),
  });
}

function persistStreamState(chatId: string, stream: StoredStreamState | null) {
  const stored = getStoredChat(chatId) ?? {
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  if (stream) {
    saveStoredChat(chatId, {
      ...stored,
      stream,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const { stream: _removed, ...rest } = stored;
    saveStoredChat(chatId, { ...rest, updatedAt: new Date().toISOString() });
  }
}

function ensureChatMemory(chatId: string): ChatMemory {
  const existing = chatMemory.get(chatId);
  if (existing) return existing;
  const stored = getStoredChat(chatId);
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

function writeStreamState(chatId: string, memory: ChatMemory, statusOverride?: StoredStreamState["status"]) {
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
  persistStreamState(chatId, stream);
}

function clearStreamState(chatId: string, memory: ChatMemory) {
  memory.streamId = null;
  memory.assistantId = null;
  memory.streamCursor = 0;
  memory.streamStartedAt = null;
  persistStreamState(chatId, null);
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

function removeChatMessage(chatId: string, messageId: string) {
  const memory = ensureChatMemory(chatId);
  applyChatState(chatId, {
    messages: memory.messages.filter((msg) => msg.id !== messageId),
  });
}

function ensureAssistantMessage(chatId: string, assistantId: string, focusFindingId?: string) {
  const memory = ensureChatMemory(chatId);
  const existing = memory.messages.find((msg) => msg.id === assistantId);
  if (existing) return;
  appendChatMessage(chatId, {
    id: assistantId,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    focusFindingId,
  });
}

async function streamSse(
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

async function connectToStream({
  chatId,
  response,
  requestId,
  controller,
  focusFindingId,
}: {
  chatId: string;
  response: Response;
  requestId: number;
  controller: AbortController;
  focusFindingId?: string;
}) {
  const isCurrent = () => {
    const current = ensureChatMemory(chatId);
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
      const memory = ensureChatMemory(chatId);

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
          ensureAssistantMessage(chatId, memory.assistantId, focusFindingId);
        }
        writeStreamState(chatId, memory, "streaming");
        emitChatUpdate(chatId);
        return;
      }

      if (event === "delta") {
        const assistantId = memory.assistantId ?? data?.assistantId;
        if (!assistantId || typeof data?.delta !== "string") return;
        ensureAssistantMessage(chatId, assistantId, focusFindingId);
        const existing = memory.messages.find((msg) => msg.id === assistantId);
        const nextContent = `${existing?.content ?? ""}${data.delta}`;
        memory.streamCursor = typeof data?.cursor === "number" ? data.cursor : nextContent.length;
        updateChatMessage(chatId, assistantId, nextContent);
        if (!memory.hasStartedResponse) {
          applyChatState(chatId, { hasStartedResponse: true });
        }
        writeStreamState(chatId, memory, "streaming");
        return;
      }

      if (event === "done") {
        applyChatState(chatId, { isStreaming: false, hasStartedResponse: false });
        clearStreamState(chatId, memory);
        return;
      }

      if (event === "error") {
        const message =
          typeof data?.message === "string" ? data.message : "Failed to send message";
        applyChatState(chatId, {
          isStreaming: false,
          hasStartedResponse: false,
          error: message,
        });
        writeStreamState(chatId, memory, "error");
      }
    },
    isCurrent
  );
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
  clearStreamState(chatId, memory);
  applyChatState(chatId, {
    messages: [],
    isStreaming: false,
    hasStartedResponse: false,
    error: null,
  });
  removeStoredChat(chatId);
  void fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`, { method: "DELETE" }).catch(
    () => undefined
  );
}

export async function syncChatHistory(chatId: string) {
  try {
    const response = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !Array.isArray(data.messages)) return;

    const memory = ensureChatMemory(chatId);
    if (data.messages.length > memory.messages.length) {
      applyChatState(chatId, { messages: data.messages });
    }

    if (data.activeStream && data.activeStream.status === "streaming") {
      const stored = getStoredChat(chatId);
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
      persistStreamState(chatId, streamState);
    }
  } catch {
    // Ignore sync errors for MVP resilience
  }
}

export async function resumeChatStream(chatId: string) {
  const memory = ensureChatMemory(chatId);
  if (memory.isStreaming) return;
  const stored = getStoredChat(chatId);
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
  });
  writeStreamState(chatId, memory, "streaming");

  try {
    const response = await fetch(
      `/api/chat?streamId=${encodeURIComponent(memory.streamId)}&cursor=${memory.streamCursor}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to resume stream");
    }
    await connectToStream({ chatId, response, requestId, controller });
  } catch (err) {
    if (!controller.signal.aborted) {
      applyChatState(chatId, {
        error: err instanceof Error ? err.message : "Failed to resume stream",
        isStreaming: false,
        hasStartedResponse: false,
      });
      writeStreamState(chatId, memory, "error");
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
  const memory = ensureChatMemory(chatId);
  if (!content.trim()) return;

  if (memory.isStreaming) {
    await resumeChatStream(chatId);
    return;
  }

  const stored = getStoredChat(chatId);
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

  appendChatMessage(chatId, userMessage);
  applyChatState(chatId, {
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
        removeChatMessage(chatId, userMessage.id);
        const storedStream: StoredStreamState = {
          id: payload.streamId,
          assistantId: null,
          cursor: 0,
          status: "streaming",
          startedAt: new Date().toISOString(),
        };
        persistStreamState(chatId, storedStream);
        await resumeChatStream(chatId);
        return;
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to get response");
    }

    await connectToStream({ chatId, response, requestId, controller, focusFindingId });
  } catch (err) {
    if (!controller.signal.aborted) {
      applyChatState(chatId, {
        error: err instanceof Error ? err.message : "Failed to send message",
        isStreaming: false,
        hasStartedResponse: false,
      });
      writeStreamState(chatId, memory, "error");
    }
  }
}
