import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
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

    const folder = await prisma.folder.findFirst({
      where: { id, isActive: true },
      include: {
        files: { where: { isActive: true } },
        children: { where: { isActive: true } },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    const isOwner = folder.userId === session.userId;
    if (!isOwner) {
      const share = await prisma.folderShare.findUnique({
        where: { folderId_sharedWithId: { folderId: id, sharedWithId: session.userId } },
      });
      if (!share) {
        return NextResponse.json(
          { success: false, error: "Folder not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true, data: folder });
  } catch (error) {
    console.error("Get folder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get folder" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { name } = await request.json();

    const folder = await prisma.folder.findFirst({
      where: { id, isActive: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 }
      );
    }

    const isOwner = folder.userId === session.userId;
    if (!isOwner) {
      const share = await prisma.folderShare.findUnique({
        where: { folderId_sharedWithId: { folderId: id, sharedWithId: session.userId } },
      });
      if (!share || !share.canWrite) {
        return NextResponse.json(
          { success: false, error: "No write access" },
          { status: 403 }
        );
      }
    }

    const updatedFolder = await prisma.folder.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json({
      success: true,
      message: "Folder updated",
      data: updatedFolder,
    });
  } catch (error) {
    console.error("Update folder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update folder" },
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
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: "Folder deleted",
    });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete folder" },
      { status: 500 }
    );
  }
}
