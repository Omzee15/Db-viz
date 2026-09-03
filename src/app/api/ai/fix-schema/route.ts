import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  AI_PARSER_SYSTEM_PROMPT,
  buildFixUserPrompt,
} from "@/lib/ai-parser-prompt";

// Sends the user's failing SQL / DBML plus the parser error to Gemini and asks
// for a corrected version that our parsing pipeline accepts. The user's Gemini
// API key is read from their own account record — it is never exposed to the
// client and never logged.

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_CONTENT_CHARS = 60_000;

export async function POST(request: NextRequest) {
  try {
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

    if (!user?.geminiApiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No Gemini API key set. Add one under your account menu → Settings.",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const content: unknown = body?.content;
    const fileName: unknown = body?.fileName;
    const parseError: unknown = body?.error;

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing schema content" },
        { status: 400 }
      );
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        {
          success: false,
          error: `Schema is too large to fix automatically (${content.length} chars, limit ${MAX_CONTENT_CHARS}).`,
        },
        { status: 413 }
      );
    }

    const userPrompt = buildFixUserPrompt({
      fileName: typeof fileName === "string" ? fileName : "schema.dbml",
      content,
      error: typeof parseError === "string" ? parseError : "",
    });

    const geminiRes = await fetch(`${GEMINI_URL}?key=${user.geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: AI_PARSER_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      console.error("Gemini API error:", geminiRes.status, detail.slice(0, 500));
      let message = `Gemini request failed (${geminiRes.status})`;
      if (geminiRes.status === 400 && /API key not valid/i.test(detail)) {
        message = "Your Gemini API key is not valid. Update it in Settings.";
      } else if (geminiRes.status === 429) {
        message = "Gemini rate limit hit. Try again in a moment.";
      }
      return NextResponse.json(
        { success: false, error: message },
        { status: 502 }
      );
    }

    const data = await geminiRes.json();
    const parts: Array<{ text?: string }> =
      data?.candidates?.[0]?.content?.parts ?? [];
    let fixed = parts
      .map((p) => p?.text ?? "")
      .join("")
      .trim();

    // Strip a stray markdown fence if the model added one despite instructions.
    const fence = fixed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
    if (fence) fixed = fence[1].trim();

    if (!fixed) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      return NextResponse.json(
        {
          success: false,
          error:
            finishReason === "MAX_TOKENS"
              ? "The schema was too long for the assistant to rewrite in one pass."
              : "The assistant did not return a corrected schema.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, fixed });
  } catch (error) {
    console.error("AI fix-schema error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to contact the AI assistant" },
      { status: 500 }
    );
  }
}
