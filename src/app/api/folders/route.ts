import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const folders = await prisma.folder.findMany({
      where: {
        userId: session.userId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: folders });
  } catch (error) {
    console.error("Get folders error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get folders" },
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

    const { name, parentFolderId } = await request.json();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    if (parentFolderId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: parentFolderId, userId: session.userId, isActive: true },
      });
      if (!parentFolder) {
        return NextResponse.json(
          { success: false, error: "Parent folder not found" },
          { status: 404 }
        );
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        userId: session.userId,
        parentFolderId: parentFolderId || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Folder created",
      data: folder,
    });
  } catch (error) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
