import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

interface FileNode {
  id: string;
  name: string;
  content: string;
  layoutData: string;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isSharedWithOthers: boolean;
  isSharedWithMe?: boolean;
  sharedByName?: string;
  canWrite?: boolean;
}

interface FolderNode {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: Date;
  children: FolderNode[];
  files: FileNode[];
  isSharedWithOthers: boolean;
  isSharedWithMe?: boolean;
  sharedByName?: string;
  canWrite?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFileNode(f: any, overrides: Partial<FileNode> = {}): FileNode {
  return {
    id: f.id,
    name: f.name,
    content: f.content,
    layoutData: f.layoutData,
    folderId: f.folderId,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    isSharedWithOthers: Array.isArray(f.shares) ? f.shares.length > 0 : false,
    ...overrides,
  };
}

const FOLDER_INCLUDE = {
  files: {
    where: { isActive: true },
    include: { shares: { select: { id: true } } },
    orderBy: { name: "asc" as const },
  },
  shares: { select: { id: true } },
};

async function buildFolderTree(userId: string): Promise<FolderNode[]> {
  const rootFolders = await prisma.folder.findMany({
    where: { userId, parentFolderId: null, isActive: true },
    include: FOLDER_INCLUDE,
    orderBy: { name: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadChildren = async (folder: any): Promise<FolderNode> => {
    const children = await prisma.folder.findMany({
      where: { parentFolderId: folder.id, isActive: true },
      include: FOLDER_INCLUDE,
      orderBy: { name: "asc" },
    });

    const childrenWithNested = await Promise.all(children.map(loadChildren));

    return {
      id: folder.id,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      createdAt: folder.createdAt,
      isSharedWithOthers: folder.shares.length > 0,
      children: childrenWithNested,
      files: folder.files.map((f: any) => mapFileNode(f)),
    };
  };

  return Promise.all(rootFolders.map(loadChildren));
}

async function buildSharedFolderTree(
  folderId: string,
  sharedByName: string,
  canWrite: boolean
): Promise<FolderNode> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, isActive: true },
    include: {
      files: {
        where: { isActive: true },
        orderBy: { name: "asc" },
      },
      shares: { select: { id: true } },
    },
  });

  if (!folder) {
    return {
      id: folderId,
      name: "",
      parentFolderId: null,
      createdAt: new Date(),
      isSharedWithOthers: false,
      isSharedWithMe: true,
      sharedByName,
      canWrite,
      children: [],
      files: [],
    };
  }

  const children = await prisma.folder.findMany({
    where: { parentFolderId: folderId, isActive: true },
    include: {
      files: { where: { isActive: true }, orderBy: { name: "asc" } },
      shares: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  const childrenNodes: FolderNode[] = await Promise.all(
    children.map((c) => buildSharedFolderTree(c.id, sharedByName, canWrite))
  );

  return {
    id: folder.id,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
    createdAt: folder.createdAt,
    isSharedWithOthers: folder.shares.length > 0,
    isSharedWithMe: true,
    sharedByName,
    canWrite,
    children: childrenNodes,
    files: folder.files.map((f) =>
      mapFileNode(f, { isSharedWithMe: true, sharedByName, canWrite })
    ),
  };
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

    const folders = await buildFolderTree(session.userId);

    const rootFiles = await prisma.file.findMany({
      where: { userId: session.userId, folderId: null, isActive: true },
      include: { shares: { select: { id: true } } },
      orderBy: { name: "asc" },
    });

    const rootFilesWithMeta: FileNode[] = rootFiles.map((f) => mapFileNode(f));

    // Files shared with this user
    const fileSharesWithMe = await prisma.fileShare.findMany({
      where: { sharedWithId: session.userId },
      include: {
        file: true,
        sharedBy: { select: { name: true } },
      },
    });

    const sharedFiles: FileNode[] = fileSharesWithMe
      .filter((s) => s.file?.isActive)
      .map((s) =>
        mapFileNode(s.file, {
          isSharedWithMe: true,
          sharedByName: s.sharedBy.name,
          canWrite: s.canWrite,
        })
      );

    // Folders shared with this user
    const folderSharesWithMe = await prisma.folderShare.findMany({
      where: { sharedWithId: session.userId },
      include: { sharedBy: { select: { name: true } } },
    });

    const sharedFolders: FolderNode[] = await Promise.all(
      folderSharesWithMe.map((s) =>
        buildSharedFolderTree(s.folderId, s.sharedBy.name, s.canWrite)
      )
    );

    return NextResponse.json({
      success: true,
      data: {
        folders,
        rootFiles: rootFilesWithMeta,
        sharedFiles,
        sharedFolders,
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
