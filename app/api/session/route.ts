import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const COOKIE_NAME = "ttb_uid";

export async function POST(request: NextRequest) {
  let clientId: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body.clientId === "string") {
      clientId = body.clientId;
    }
  } catch {
    clientId = undefined;
  }

  const existing = request.cookies.get(COOKIE_NAME)?.value;
  const userId = existing ?? clientId ?? randomUUID();
  const response = NextResponse.json({ sessionId: userId });

  if (!existing || existing !== userId) {
    response.cookies.set(COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
