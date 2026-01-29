import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { startAnalysisJob, getAnalysisJob, listActiveAnalysisJobs } from "@/lib/analysisServerStore";

const COOKIE_NAME = "ttb_uid";

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

export async function GET(request: NextRequest) {
  const { userId, setCookieHeader } = getOrCreateUserId(request);
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const status = searchParams.get("status");

  if (status === "active") {
    const jobs = listActiveAnalysisJobs(userId);
    const response = NextResponse.json({ jobs });
    if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
    return response;
  }

  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  const job = getAnalysisJob(userId, threadId);
  if (!job) {
    const response = NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
    return response;
  }

  const response = NextResponse.json(job);
  if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, vectorStoreId, context, images, readyFileNames } = body ?? {};

    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }

    if (!vectorStoreId || typeof vectorStoreId !== "string") {
      return NextResponse.json(
        { error: "No documents uploaded. Please upload files first." },
        { status: 400 }
      );
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "No label images provided." },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json({ error: "Context is required" }, { status: 400 });
    }

    const { userId, setCookieHeader } = getOrCreateUserId(request);
    const job = startAnalysisJob({
      userId,
      threadId,
      vectorStoreId,
      context,
      images,
      readyFileNames,
    });

    const response = NextResponse.json(job, { status: 202 });
    if (setCookieHeader) response.headers.set("Set-Cookie", setCookieHeader);
    return response;
  } catch (error) {
    console.error("Analysis error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
