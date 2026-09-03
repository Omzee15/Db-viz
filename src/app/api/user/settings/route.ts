import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Per-user settings. Currently just the Gemini API key used by the "Fix Error"
// AI assistant. The key value is never returned to the client — only whether one
// is set.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId, isActive: true },
    select: { geminiApiKey: true },
  });

  return NextResponse.json({
    success: true,
    hasGeminiApiKey: Boolean(user?.geminiApiKey),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const raw: unknown = body?.geminiApiKey;

  if (raw !== null && typeof raw !== "string") {
    return NextResponse.json(
      { success: false, error: "geminiApiKey must be a string or null" },
      { status: 400 }
    );
  }

  // Empty string / null both clear the stored key.
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const next = trimmed.length > 0 ? trimmed : null;

  await prisma.user.update({
    where: { id: session.userId },
    data: { geminiApiKey: next },
  });

  return NextResponse.json({
    success: true,
    hasGeminiApiKey: next !== null,
  });
}
