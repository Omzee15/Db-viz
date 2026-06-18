import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function safeParseSchemas(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// Update a saved connection. Used primarily to remember the user's edited
// schema selection from the viewer dropdown, but also supports editing the
// other non-secret fields.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await prisma.connection.findFirst({
      where: { id, userId: session.userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (typeof body.label === "string") data.label = body.label;
    if (typeof body.host === "string") data.host = body.host;
    if (body.port !== undefined) {
      const p = Number.parseInt(String(body.port), 10);
      if (Number.isFinite(p)) data.port = p;
    }
    if (typeof body.database === "string") data.database = body.database;
    if (typeof body.username === "string") data.username = body.username;
    if (typeof body.ssl === "boolean") data.ssl = body.ssl;
    if (Array.isArray(body.schemas)) {
      data.schemas = JSON.stringify(
        body.schemas.filter((s: unknown) => typeof s === "string")
      );
    }

    const connection = await prisma.connection.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      success: true,
      message: "Connection updated",
      data: { ...connection, schemas: safeParseSchemas(connection.schemas) },
    });
  } catch (error) {
    console.error("Update connection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await prisma.connection.findFirst({
      where: { id, userId: session.userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Connection not found" },
        { status: 404 }
      );
    }

    await prisma.connection.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Connection deleted" });
  } catch (error) {
    console.error("Delete connection error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
