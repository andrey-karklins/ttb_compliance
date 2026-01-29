import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ChatRequestSchema } from "@/lib/schema";
import { clearChat, getChatHistory, getStream, startChatStream } from "@/lib/chatServerStore";

const COOKIE_NAME = "ttb_uid";

type ActiveStream = NonNullable<ReturnType<typeof getStream>>;

function buildCookieHeader(userId: string) {
  const parts = [
    `${COOKIE_NAME}=${userId}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function getOrCreateUserId(request: NextRequest) {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  if (existing) {
    return { userId: existing, setCookieHeader: null as string | null };
  }
  const userId = randomUUID();
  return { userId, setCookieHeader: buildCookieHeader(userId) };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function createStreamResponse(
  streamState: ActiveStream,
  cursor: number,
  setCookieHeader: string | null
) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let currentCursor = Math.max(0, Math.min(cursor, streamState.content.length));

      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event, data)));
          return true;
        } catch {
          return false;
        }
      };

      if (
        !send("meta", {
          streamId: streamState.id,
          chatId: streamState.chatId,
          assistantId: streamState.assistantId,
          status: streamState.status,
          cursor: currentCursor,
        })
      ) {
        controller.close();
        return;
      }

      while (true) {
        const latest = streamState.content;
        if (currentCursor < latest.length) {
          const delta = latest.slice(currentCursor);
          currentCursor = latest.length;
          if (!send("delta", { delta, cursor: currentCursor })) {
            break;
          }
        }

        if (streamState.status === "done") {
          send("done", { cursor: currentCursor });
          break;
        }

        if (streamState.status === "error") {
          send("error", { message: streamState.error ?? "Chat stream failed" });
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      controller.close();
    },
  });

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  if (setCookieHeader) {
    headers.set("Set-Cookie", setCookieHeader);
  }

  return new Response(stream, { headers });
}

export async function GET(request: NextRequest) {
  const { userId, setCookieHeader } = getOrCreateUserId(request);
  const { searchParams } = new URL(request.url);
  const streamId = searchParams.get("streamId");
  const chatId = searchParams.get("chatId");

  if (streamId) {
    const streamState = getStream(userId, streamId);
    if (!streamState) {
      const response = NextResponse.json({ error: "Stream not found" }, { status: 404 });
      if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
      return response;
    }
    const cursor = Number(searchParams.get("cursor") ?? "0");
    return createStreamResponse(streamState, Number.isNaN(cursor) ? 0 : cursor, setCookieHeader);
  }

  if (chatId) {
    const history = getChatHistory(userId, chatId);
    const response = NextResponse.json(history);
    if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
    return response;
  }

  return NextResponse.json({ error: "Missing chatId or streamId" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { chatId, vectorStoreId, report, content, focusFindingId, images } = parseResult.data;
    if (!content.trim()) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const { userId, setCookieHeader } = getOrCreateUserId(request);
    const { streamId, existingStream } = startChatStream({
      userId,
      chatId,
      vectorStoreId,
      report,
      content,
      focusFindingId,
      images,
    });

    if (existingStream) {
      const response = NextResponse.json(
        { error: "Stream already active", streamId },
        { status: 409 }
      );
      if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
      return response;
    }

    const streamState = getStream(userId, streamId);
    if (!streamState) {
      const response = NextResponse.json({ error: "Stream not found" }, { status: 404 });
      if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
      return response;
    }

    return createStreamResponse(streamState, 0, setCookieHeader);
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, setCookieHeader } = getOrCreateUserId(request);
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");
  if (!chatId) {
    const response = NextResponse.json({ error: "chatId is required" }, { status: 400 });
    if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
    return response;
  }

  clearChat(userId, chatId);
  const response = NextResponse.json({ ok: true });
  if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
  return response;
}
