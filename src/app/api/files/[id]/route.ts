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

    const file = await prisma.file.findFirst({
      where: { id, isActive: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    const isOwner = file.userId === session.userId;
    if (!isOwner) {
      const share = await prisma.fileShare.findUnique({
        where: { fileId_sharedWithId: { fileId: id, sharedWithId: session.userId } },
      });
      if (!share) {
        const folderShare = file.folderId
          ? await prisma.folderShare.findUnique({
              where: {
                folderId_sharedWithId: {
                  folderId: file.folderId,
                  sharedWithId: session.userId,
                },
              },
            })
          : null;

        if (!folderShare) {
          return NextResponse.json(
            { success: false, error: "File not found" },
            { status: 404 }
          );
        }
      }
    }

    return NextResponse.json({ success: true, data: file });
  } catch (error) {
    console.error("Get file error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get file" },
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
    const { name, content, layoutData, folderId } = await request.json();

    const file = await prisma.file.findFirst({
      where: { id, isActive: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    const isOwner = file.userId === session.userId;
    if (!isOwner) {
      const share = await prisma.fileShare.findUnique({
        where: { fileId_sharedWithId: { fileId: id, sharedWithId: session.userId } },
      });
      if (!share || !share.canWrite) {
        const folderShare = file.folderId
          ? await prisma.folderShare.findUnique({
              where: {
                folderId_sharedWithId: {
                  folderId: file.folderId,
                  sharedWithId: session.userId,
                },
              },
            })
          : null;

        if (!folderShare || !folderShare.canWrite) {
          return NextResponse.json(
            { success: false, error: "No write access" },
            { status: 403 }
          );
        }
      }
    }

    const updateData: {
      name?: string;
      content?: string;
      layoutData?: string;
      folderId?: string | null;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (content !== undefined) updateData.content = content;
    if (layoutData !== undefined) updateData.layoutData = layoutData;
    if (folderId !== undefined && isOwner) updateData.folderId = folderId;

    const updatedFile = await prisma.file.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "File updated",
      data: updatedFile,
    });
  } catch (error) {
    console.error("Update file error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update file" },
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

    const file = await prisma.file.findFirst({
      where: { id, userId: session.userId, isActive: true },
    });

    if (!file) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    await prisma.file.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({
      success: true,
      message: "File deleted",
    });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
