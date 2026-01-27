import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, runComplianceChatStream } from "@/lib/openai";
import { getRegulationsVectorStoreId } from "@/lib/regulations";
import { ChatRequestSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const parseResult = ChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { sessionId, vectorStoreId, report, messages, focusFindingId, images } = parseResult.data;

    // Validate we have at least one message
    if (messages.length === 0) {
      return NextResponse.json(
        { error: "At least one message is required" },
        { status: 400 }
      );
    }

    // Get OpenAI client
    const client = getOpenAIClient();

    // Build vector store IDs array - regulations store + user uploads store
    const regulationsStoreId = getRegulationsVectorStoreId();
    const vectorStoreIds: string[] = [];
    if (regulationsStoreId) {
      vectorStoreIds.push(regulationsStoreId);
    }
    if (vectorStoreId) {
      vectorStoreIds.push(vectorStoreId);
    }

    // Convert images to AnalysisImage format if provided
    const analysisImages = images?.map(img => ({
      base64: img.base64,
      mimeType: img.mimeType,
      filename: img.filename,
    }));

    const textStream = await runComplianceChatStream(
      client,
      vectorStoreIds,
      report,
      messages,
      focusFindingId,
      analysisImages
    );

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (streamError) {
          console.error("Chat stream error:", streamError);
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat request failed" },
      { status: 500 }
    );
  }
}
