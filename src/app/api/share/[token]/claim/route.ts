import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Add the currently logged-in user to the share list of the file/folder with this token
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { token } = await params;

    if (!token || token.length !== 32) {
      return NextResponse.json(
        { success: false, error: "Invalid share link" },
        { status: 400 }
      );
    }

    // Try file first
    const file = await prisma.file.findFirst({
      where: { publicToken: token, isActive: true },
      select: { id: true, userId: true },
    });

    if (file) {
      // Don't add the owner themselves
      if (file.userId === session.userId) {
        return NextResponse.json({ success: true, data: { type: "file", id: file.id } });
      }

      // Upsert the share (idempotent)
      await prisma.fileShare.upsert({
        where: { fileId_sharedWithId: { fileId: file.id, sharedWithId: session.userId } },
        create: {
          fileId: file.id,
          sharedWithId: session.userId,
          sharedById: file.userId,
          canWrite: false,
        },
        update: {},
      });

      return NextResponse.json({ success: true, data: { type: "file", id: file.id } });
    }

    // Try folder
    const folder = await prisma.folder.findFirst({
      where: { publicToken: token, isActive: true },
      select: { id: true, userId: true },
    });

    if (folder) {
      // Don't add the owner themselves
      if (folder.userId === session.userId) {
        return NextResponse.json({ success: true, data: { type: "folder", id: folder.id } });
      }

      await prisma.folderShare.upsert({
        where: { folderId_sharedWithId: { folderId: folder.id, sharedWithId: session.userId } },
        create: {
          folderId: folder.id,
          sharedWithId: session.userId,
          sharedById: folder.userId,
          canWrite: false,
        },
        update: {},
      });

      return NextResponse.json({ success: true, data: { type: "folder", id: folder.id } });
    }

    return NextResponse.json(
      { success: false, error: "Share link not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Claim share error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to claim share" },
      { status: 500 }
    );
  }
}
