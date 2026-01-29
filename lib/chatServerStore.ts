import { randomUUID } from "crypto";
import type { ChatImage, ChatMessage, ComplianceReport } from "@/lib/schema";
import { getOpenAIClient, runComplianceChatStream, type AnalysisImage } from "@/lib/openai";
import { getRegulationsVectorStoreId } from "@/lib/regulations";

type StreamStatus = "streaming" | "done" | "error";

type StreamState = {
  id: string;
  chatId: string;
  userId: string;
  assistantId: string;
  content: string;
  status: StreamStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

type ChatState = {
  messages: ChatMessage[];
  updatedAt: number;
  activeStreamId?: string;
};

type UserState = {
  chats: Map<string, ChatState>;
  streams: Map<string, StreamState>;
};

export type ChatStreamSummary = {
  id: string;
  assistantId: string;
  status: StreamStatus;
  contentLength: number;
};

type StartChatParams = {
  userId: string;
  chatId: string;
  vectorStoreId: string;
  report: ComplianceReport | null;
  content: string;
  focusFindingId?: string;
  images?: ChatImage[];
};

const STREAM_TTL_MS = 10 * 60 * 1000;
const userStates = new Map<string, UserState>();

function getUserState(userId: string): UserState {
  const existing = userStates.get(userId);
  if (existing) return existing;
  const next: UserState = { chats: new Map(), streams: new Map() };
  userStates.set(userId, next);
  return next;
}

function getChatState(userId: string, chatId: string): ChatState {
  const userState = getUserState(userId);
  const existing = userState.chats.get(chatId);
  if (existing) return existing;
  const next: ChatState = { messages: [], updatedAt: Date.now() };
  userState.chats.set(chatId, next);
  return next;
}

function scheduleStreamCleanup(userId: string, streamId: string) {
  setTimeout(() => {
    const userState = userStates.get(userId);
    if (!userState) return;
    userState.streams.delete(streamId);
  }, STREAM_TTL_MS);
}

function mapImages(images?: ChatImage[]): AnalysisImage[] | undefined {
  if (!images || images.length === 0) return undefined;
  return images.map((img) => ({
    base64: img.base64,
    mimeType: img.mimeType,
    filename: img.filename,
  }));
}

async function runStreamInBackground(
  streamState: StreamState,
  chatState: ChatState,
  vectorStoreId: string,
  report: ComplianceReport | null,
  focusFindingId?: string,
  images?: ChatImage[]
) {
  try {
    const client = getOpenAIClient();
    const vectorStoreIds: string[] = [];
    const regulationsStoreId = getRegulationsVectorStoreId();
    if (regulationsStoreId) {
      vectorStoreIds.push(regulationsStoreId);
    }
    if (vectorStoreId) {
      vectorStoreIds.push(vectorStoreId);
    }

    const textStream = await runComplianceChatStream(
      client,
      vectorStoreIds,
      report,
      chatState.messages,
      focusFindingId,
      mapImages(images)
    );

    for await (const chunk of textStream) {
      streamState.content += chunk;
      streamState.updatedAt = Date.now();
    }

    streamState.status = "done";
    streamState.updatedAt = Date.now();

    const assistantMessage: ChatMessage = {
      id: streamState.assistantId,
      role: "assistant",
      content: streamState.content,
      createdAt: new Date().toISOString(),
      focusFindingId,
    };

    chatState.messages.push(assistantMessage);
    chatState.updatedAt = Date.now();
  } catch (error) {
    streamState.status = "error";
    streamState.error = error instanceof Error ? error.message : "Chat stream failed";
    streamState.updatedAt = Date.now();
  } finally {
    chatState.activeStreamId = undefined;
    scheduleStreamCleanup(streamState.userId, streamState.id);
  }
}

export function getStream(userId: string, streamId: string): StreamState | null {
  const userState = getUserState(userId);
  return userState.streams.get(streamId) ?? null;
}

export function getChatHistory(userId: string, chatId: string): {
  messages: ChatMessage[];
  activeStream: ChatStreamSummary | null;
} {
  const chatState = getChatState(userId, chatId);
  const userState = getUserState(userId);
  const streamId = chatState.activeStreamId;
  const streamState = streamId ? userState.streams.get(streamId) ?? null : null;
  const activeStream = streamState
    ? {
        id: streamState.id,
        assistantId: streamState.assistantId,
        status: streamState.status,
        contentLength: streamState.content.length,
      }
    : null;
  return { messages: chatState.messages, activeStream };
}

export function clearChat(userId: string, chatId: string) {
  const userState = getUserState(userId);
  const chatState = userState.chats.get(chatId);
  if (chatState?.activeStreamId) {
    userState.streams.delete(chatState.activeStreamId);
  }
  userState.chats.delete(chatId);
}

export function startChatStream(params: StartChatParams): {
  streamId: string;
  assistantId: string;
  existingStream: boolean;
} {
  const { userId, chatId, vectorStoreId, report, content, focusFindingId, images } = params;
  const userState = getUserState(userId);
  const chatState = getChatState(userId, chatId);
  const activeStreamId = chatState.activeStreamId;
  if (activeStreamId) {
    const existing = userState.streams.get(activeStreamId);
    if (existing && existing.status === "streaming") {
      return { streamId: existing.id, assistantId: existing.assistantId, existingStream: true };
    }
  }

  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: content.trim(),
    createdAt: new Date().toISOString(),
    focusFindingId,
  };

  chatState.messages.push(userMessage);
  chatState.updatedAt = Date.now();

  const streamId = randomUUID();
  const assistantId = randomUUID();
  const streamState: StreamState = {
    id: streamId,
    chatId,
    userId,
    assistantId,
    content: "",
    status: "streaming",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  chatState.activeStreamId = streamId;
  userState.streams.set(streamId, streamState);

  void runStreamInBackground(
    streamState,
    chatState,
    vectorStoreId,
    report,
    focusFindingId,
    images
  );

  return { streamId, assistantId, existingStream: false };
}
