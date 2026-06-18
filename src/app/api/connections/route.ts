import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Saved database connections. The password is NEVER stored — only the
// non-secret details (host/port/database/username/ssl) plus the user's chosen
// list of schemas. The user re-enters the password when reconnecting.

function normalizeSchemas(schemas: unknown): string {
  const arr = Array.isArray(schemas)
    ? schemas.filter((s): s is string => typeof s === "string")
    : [];
  return JSON.stringify(arr);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const connections = await prisma.connection.findMany({
      where: { userId: session.userId },
      orderBy: { updatedAt: "desc" },
    });

    // Parse the JSON schemas column into an array for the client.
    const data = connections.map((c) => ({
      ...c,
      schemas: safeParseSchemas(c.schemas),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get connections error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get connections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { label, host, database } = body ?? {};

    if (!host || !database) {
      return NextResponse.json(
        { success: false, error: "Host and database are required" },
        { status: 400 }
      );
    }

    const portNum = Number.parseInt(String(body.port ?? "5432"), 10);

    const connection = await prisma.connection.create({
      data: {
        userId: session.userId,
        label: String(label || `${database}@${host}`),
        host: String(host),
        port: Number.isFinite(portNum) ? portNum : 5432,
        database: String(database),
        username: String(body.username ?? ""),
        ssl: Boolean(body.ssl),
        schemas: normalizeSchemas(body.schemas),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Connection saved",
      data: { ...connection, schemas: safeParseSchemas(connection.schemas) },
    });
  } catch (error) {
    console.error("Create connection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save connection" },
      { status: 500 }
    );
  }
}

function safeParseSchemas(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}
