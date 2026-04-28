import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    const shares = await prisma.folderShare.findMany({
      where: { folderId: id },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: shares });
  } catch (error) {
    console.error("Get folder shares error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get shares" },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const { email, canWrite = false } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.findFirst({
      where: { id, userId: session.userId, isActive: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        isActive: true,
        NOT: { id: session.userId },
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.folderShare.findUnique({
      where: { folderId_sharedWithId: { folderId: id, sharedWithId: targetUser.id } },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Folder already shared with this user" },
        { status: 409 }
      );
    }

    const share = await prisma.folderShare.create({
      data: {
        folderId: id,
        sharedWithId: targetUser.id,
        sharedById: session.userId,
        canWrite,
      },
      include: {
        sharedWith: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: share }, { status: 201 });
  } catch (error) {
    console.error("Create folder share error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to share folder" },
      { status: 500 }
    );
  }
}
