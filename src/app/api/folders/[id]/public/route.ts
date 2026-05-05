import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { randomBytes } from "crypto";

// Generate or get public token for folder
export async function POST(
  _request: NextRequest,
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

    const folder = await prisma.folder.findFirst({
      where: { id, userId: session.userId, isActive: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    // If already has a public token, return it
    if (folder.publicToken) {
      return NextResponse.json({
        success: true,
        data: { publicToken: folder.publicToken },
      });
    }

    // Generate new token
    const publicToken = randomBytes(16).toString("hex");

    await prisma.folder.update({
      where: { id },
      data: { publicToken },
    });

    return NextResponse.json({
      success: true,
      data: { publicToken },
    });
  } catch (error) {
    console.error("Generate folder public token error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate public link" },
      { status: 500 }
    );
  }
}

// Get public token status
export async function GET(
  _request: NextRequest,
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

    const folder = await prisma.folder.findFirst({
      where: { id, userId: session.userId, isActive: true },
      select: { publicToken: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { publicToken: folder.publicToken },
    });
  } catch (error) {
    console.error("Get folder public token error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get public link status" },
      { status: 500 }
    );
  }
}

// Revoke public token
export async function DELETE(
  _request: NextRequest,
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

    const folder = await prisma.folder.findFirst({
      where: { id, userId: session.userId, isActive: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    await prisma.folder.update({
      where: { id },
      data: { publicToken: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revoke folder public token error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to revoke public link" },
      { status: 500 }
    );
  }
}
