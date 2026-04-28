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

    const files = await prisma.file.findMany({
      where: {
        userId: session.userId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: files });
  } catch (error) {
    console.error("Get files error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get files" },
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

    const { name, content, folderId } = await request.json();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 }
      );
    }

    // Validate file extension
    const validExtensions = [".dbml", ".sql"];
    const hasValidExtension = validExtensions.some(ext => name.toLowerCase().endsWith(ext));
    if (!hasValidExtension) {
      return NextResponse.json(
        { success: false, error: "Invalid file extension. Only .dbml and .sql files are allowed" },
        { status: 400 }
      );
    }

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: session.userId, isActive: true },
      });
      if (!folder) {
        return NextResponse.json(
          { success: false, error: "Folder not found" },
          { status: 404 }
        );
      }
    }

    const file = await prisma.file.create({
      data: {
        name,
        content: content || "",
        userId: session.userId,
        folderId: folderId || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "File created",
      data: file,
    });
  } catch (error) {
    console.error("Create file error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create file" },
      { status: 500 }
    );
  }
}
