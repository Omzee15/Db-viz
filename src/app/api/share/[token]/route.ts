import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fetch file or folder by public token - no auth required
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length !== 32) {
      return NextResponse.json(
        { success: false, error: "Invalid share link" },
        { status: 400 }
      );
    }

    // Try to find a file with this token
    const file = await prisma.file.findFirst({
      where: { publicToken: token, isActive: true },
      select: {
        id: true,
        name: true,
        content: true,
        layoutData: true,
        user: { select: { name: true } },
      },
    });

    if (file) {
      return NextResponse.json({
        success: true,
        data: {
          type: "file",
          id: file.id,
          name: file.name,
          content: file.content,
          layoutData: file.layoutData,
          ownerName: file.user.name,
        },
      });
    }

    // Try to find a folder with this token
    const folder = await prisma.folder.findFirst({
      where: { publicToken: token, isActive: true },
      select: {
        id: true,
        name: true,
        user: { select: { name: true } },
        files: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            content: true,
            layoutData: true,
          },
        },
      },
    });

    if (folder) {
      return NextResponse.json({
        success: true,
        data: {
          type: "folder",
          id: folder.id,
          name: folder.name,
          ownerName: folder.user.name,
          files: folder.files,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Share link not found or expired" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Fetch public share error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load shared content" },
      { status: 500 }
    );
  }
}
