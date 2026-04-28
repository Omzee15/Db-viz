import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id, shareId } = await params;

    const file = await prisma.file.findFirst({
      where: { id, userId: session.userId, isActive: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    const share = await prisma.fileShare.findFirst({
      where: { id: shareId, fileId: id },
    });

    if (!share) {
      return NextResponse.json(
        { success: false, error: "Share not found" },
        { status: 404 }
      );
    }

    await prisma.fileShare.delete({ where: { id: shareId } });

    return NextResponse.json({ success: true, message: "Share removed" });
  } catch (error) {
    console.error("Delete file share error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove share" },
      { status: 500 }
    );
  }
}
