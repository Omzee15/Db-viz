import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface FolderWithRelations {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: Date;
  children: FolderWithRelations[];
  files: {
    id: string;
    name: string;
    content: string;
    layoutData: string;
    folderId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
}

async function getFolderTree(userId: string): Promise<FolderWithRelations[]> {
  const rootFolders = await prisma.folder.findMany({
    where: {
      userId,
      parentFolderId: null,
      isActive: true,
    },
    include: {
      files: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const loadChildren = async (folder: FolderWithRelations): Promise<FolderWithRelations> => {
    const children = await prisma.folder.findMany({
      where: {
        parentFolderId: folder.id,
        isActive: true,
      },
      include: {
        files: {
          where: { isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const childrenWithNested = await Promise.all(
      children.map((child: FolderWithRelations) => loadChildren(child))
    );

    return {
      ...folder,
      children: childrenWithNested,
    };
  };

  return Promise.all(
    rootFolders.map((folder) => loadChildren(folder as unknown as FolderWithRelations))
  );
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const folders = await getFolderTree(session.userId);

    const rootFiles = await prisma.file.findMany({
      where: {
        userId: session.userId,
        folderId: null,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        folders,
        rootFiles,
      },
    });
  } catch (error) {
    console.error("Get file tree error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get file tree" },
      { status: 500 }
    );
  }
}
