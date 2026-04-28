"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  FilePlus,
  Plus,
  LogOut,
  User,
  RefreshCw,
  Trash2,
  Upload,
  Save,
  Loader2,
  Share2,
  Users,
  X,
  Search,
} from "lucide-react";
import DBViewer from "@/components/DBViewer";
import { useGuest } from "@/lib/guest-context";

interface FileItem {
  id: string;
  name: string;
  content: string;
  layoutData: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  isSharedWithOthers?: boolean;
  isSharedWithMe?: boolean;
  sharedByName?: string;
  canWrite?: boolean;
}

interface FolderItem {
  id: string;
  name: string;
  parentFolderId: string | null;
  children: FolderItem[];
  files: FileItem[];
  createdAt: string;
  isSharedWithOthers?: boolean;
  isSharedWithMe?: boolean;
  sharedByName?: string;
  canWrite?: boolean;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface ShareEntry {
  id: string;
  canWrite: boolean;
  sharedWith: { id: string; name: string; email: string };
}

type FileFilter = "all" | "my" | "shared";

export default function DashboardPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [rootFiles, setRootFiles] = useState<FileItem[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<FolderItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [creatingInFolderId, setCreatingInFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "file" | "folder";
    id: string;
  } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [dbmlContent, setDbmlContent] = useState("");
  const [fileLayoutData, setFileLayoutData] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [fileFilter, setFileFilter] = useState<FileFilter>("all");
  const [fileSearch, setFileSearch] = useState("");
  const [showCompactSearch, setShowCompactSearch] = useState(false);

  // Loading states
  const [isCreatingFileLoading, setIsCreatingFileLoading] = useState(false);
  const [isDeletingFile, setIsDeletingFile] = useState<string | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Share modal state
  const [shareModal, setShareModal] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [shareModalShares, setShareModalShares] = useState<ShareEntry[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareCanWrite, setShareCanWrite] = useState(false);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [isAddingShare, setIsAddingShare] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareUserResults, setShareUserResults] = useState<UserInfo[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const isSidebarCompact = sidebarWidth <= 170;

  useEffect(() => {
    if (!isSidebarCompact) {
      setShowCompactSearch(false);
    }
  }, [isSidebarCompact]);

  const isResizing = useRef(false);
  const router = useRouter();
  const { isGuest, guestFiles, addGuestFile, updateGuestFile, deleteGuestFile, getGuestFile, setGuestMode } = useGuest();

  useEffect(() => {
    if (selectedFile) {
      setDbmlContent(selectedFile.content);
      setFileLayoutData(selectedFile.layoutData);
      setHasChanges(false);
    } else {
      setDbmlContent("");
      setFileLayoutData("");
      setHasChanges(false);
    }
  }, [selectedFile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(e.clientX, 150), 500);
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const fetchFileTree = useCallback(async () => {
    if (isGuest) {
      setFolders([]);
      setRootFiles(guestFiles as FileItem[]);
      setSharedFiles([]);
      setSharedFolders([]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/files/tree");
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return;
      }

      setFolders(data.data.folders || []);
      setRootFiles(data.data.rootFiles || []);
      setSharedFiles(data.data.sharedFiles || []);
      setSharedFolders(data.data.sharedFolders || []);
    } catch (error) {
      console.error("Failed to fetch file tree:", error);
    } finally {
      setIsLoading(false);
    }
  }, [router, isGuest, guestFiles]);

  useEffect(() => {
    if (isGuest) {
      setUser({ id: "guest", name: "Guest", email: "guest@local" });
      setFolders([]);
      setRootFiles(guestFiles as FileItem[]);
      setSharedFiles([]);
      setSharedFolders([]);
      setIsLoading(false);
    } else {
      const userStr = localStorage.getItem("user");
      if (userStr) setUser(JSON.parse(userStr));
      fetchFileTree();
    }
  }, [fetchFileTree, isGuest, guestFiles]);

  useEffect(() => {
    if (!shareModal) {
      setShareUserResults([]);
      setIsSearchingUsers(false);
      return;
    }

    const query = shareEmail.trim();
    if (query.length < 2) {
      setShareUserResults([]);
      setIsSearchingUsers(false);
      return;
    }

    const handle = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (res.ok) {
          setShareUserResults(Array.isArray(data.data) ? data.data : []);
        } else {
          setShareUserResults([]);
        }
      } catch {
        setShareUserResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [shareEmail, shareModal]);

  const handleLogout = async () => {
    if (isGuest) {
      setGuestMode(false);
      router.push("/login");
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("user");
    router.push("/login");
    router.refresh();
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const handleSelectFile = async (file: FileItem) => {
    if (isGuest) {
      const guestFile = getGuestFile(file.id);
      if (guestFile) setSelectedFile(guestFile as FileItem);
      return;
    }

    setIsLoadingFile(file.id);
    try {
      const res = await fetch(`/api/files/${file.id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedFile({ ...data.data, isSharedWithMe: file.isSharedWithMe, sharedByName: file.sharedByName, canWrite: file.canWrite });
      }
    } catch (error) {
      console.error("Failed to fetch file:", error);
    } finally {
      setIsLoadingFile(null);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;

    if (isGuest) {
      updateGuestFile(selectedFile.id, dbmlContent, fileLayoutData);
      setSelectedFile((prev) =>
        prev ? { ...prev, content: dbmlContent, layoutData: fileLayoutData } : null
      );
      setHasChanges(false);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/files/${selectedFile.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: dbmlContent, layoutData: fileLayoutData }),
      });

      if (res.ok) {
        setSelectedFile((prev) =>
          prev ? { ...prev, content: dbmlContent, layoutData: fileLayoutData } : null
        );
        setHasChanges(false);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLayoutChange = (layoutData: string) => {
    setFileLayoutData(layoutData);
    setHasChanges(true);
  };

  const handleCreateFile = async (name: string) => {
    if (!name.trim()) { cancelInlineCreate(); return; }

    const validExtensions = [".dbml", ".sql"];
    const lowerName = name.toLowerCase();
    const hasExtension = lowerName.includes(".");

    if (hasExtension) {
      const hasValidExtension = validExtensions.some((ext) => lowerName.endsWith(ext));
      if (!hasValidExtension) {
        alert("Invalid file extension. Only .dbml and .sql files are allowed");
        return;
      }
    }

    const fileName = hasExtension ? name : `${name}.dbml`;

    if (isGuest) {
      addGuestFile(fileName);
      cancelInlineCreate();
      return;
    }

    setIsCreatingFileLoading(true);
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fileName, content: "", folderId: creatingInFolderId }),
      });

      if (res.ok) {
        cancelInlineCreate();
        fetchFileTree();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create file");
      }
    } catch (error) {
      console.error("Failed to create file:", error);
    } finally {
      setIsCreatingFileLoading(false);
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!name.trim()) { cancelInlineCreate(); return; }

    if (isGuest) {
      alert("Folders are not available in guest mode");
      cancelInlineCreate();
      return;
    }

    setIsCreatingFileLoading(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentFolderId: creatingInFolderId }),
      });
      if (res.ok) { cancelInlineCreate(); fetchFileTree(); }
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setIsCreatingFileLoading(false);
    }
  };

  const startCreatingFile = (folderId: string | null) => {
    setIsCreatingFile(true);
    setIsCreatingFolder(false);
    setCreatingInFolderId(folderId);
    setNewItemName("");
    if (folderId) setExpandedFolders((prev) => new Set([...prev, folderId]));
  };

  const startCreatingFolder = (parentFolderId: string | null) => {
    setIsCreatingFolder(true);
    setIsCreatingFile(false);
    setCreatingInFolderId(parentFolderId);
    setNewItemName("");
    if (parentFolderId) setExpandedFolders((prev) => new Set([...prev, parentFolderId]));
  };

  const cancelInlineCreate = () => {
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
    setCreatingInFolderId(null);
    setNewItemName("");
  };

  const renderInlineInput = (type: "file" | "folder", depth: number = 0) => (
    <div
      className="flex items-center gap-2 rounded-md"
      style={{
        padding: "8px 12px",
        paddingLeft: type === "file" ? `${32 + depth * 16}px` : `${16 + depth * 16}px`,
        background: "#EBE3D5",
        marginBottom: "4px",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {isCreatingFileLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#9B8F5E", flexShrink: 0 }} />
      ) : type === "folder" ? (
        <Folder className="h-4 w-4" style={{ color: "#9B8F5E", flexShrink: 0 }} />
      ) : (
        <FileText className="h-4 w-4" style={{ color: "#9B8F5E", flexShrink: 0 }} />
      )}
      <input
        type="text"
        value={newItemName}
        onChange={(e) => setNewItemName(e.target.value)}
        placeholder={type === "folder" ? "Folder name" : "filename.dbml or .sql"}
        autoFocus
        disabled={isCreatingFileLoading}
        className="text-sm rounded border-0 focus:outline-none disabled:opacity-50"
        style={{ background: "#F5EEE5", color: "#3E2723", padding: "4px 8px", flex: 1, minWidth: 0 }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isCreatingFileLoading) {
            type === "folder" ? handleCreateFolder(newItemName) : handleCreateFile(newItemName);
          } else if (e.key === "Escape") {
            cancelInlineCreate();
          }
        }}
        onBlur={() => {
          if (newItemName.trim() && !isCreatingFileLoading) {
            type === "folder" ? handleCreateFolder(newItemName) : handleCreateFile(newItemName);
          } else if (!isCreatingFileLoading) {
            cancelInlineCreate();
          }
        }}
      />
    </div>
  );

  const handleDeleteFile = async (id: string) => {
    if (isGuest) {
      deleteGuestFile(id);
      if (selectedFile?.id === id) setSelectedFile(null);
      setContextMenu(null);
      return;
    }

    setIsDeletingFile(id);
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedFile?.id === id) setSelectedFile(null);
        fetchFileTree();
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
    } finally {
      setIsDeletingFile(null);
    }
    setContextMenu(null);
  };

  const handleDeleteFolder = async (id: string) => {
    if (isGuest) { setContextMenu(null); return; }

    setIsDeletingFolder(id);
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (res.ok) fetchFileTree();
    } catch (error) {
      console.error("Failed to delete folder:", error);
    } finally {
      setIsDeletingFolder(null);
    }
    setContextMenu(null);
  };

  // Share modal helpers
  const openShareModal = async (type: "file" | "folder", id: string, name: string) => {
    setShareModal({ type, id, name });
    setShareEmail("");
    setShareCanWrite(false);
    setShareError("");
    setShareUserResults([]);
    setIsLoadingShares(true);
    try {
      const res = await fetch(`/api/${type === "file" ? "files" : "folders"}/${id}/share`);
      const data = await res.json();
      if (res.ok) setShareModalShares(data.data);
    } catch {
      // ignore
    } finally {
      setIsLoadingShares(false);
    }
  };

  const handleAddShare = async () => {
    if (!shareModal || !shareEmail.trim()) return;
    setIsAddingShare(true);
    setShareError("");
    try {
      const endpoint = shareModal.type === "file" ? "files" : "folders";
      const res = await fetch(`/api/${endpoint}/${shareModal.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail.trim(), canWrite: shareCanWrite }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareModalShares((prev) => [...prev, data.data]);
        setShareEmail("");
        setShareCanWrite(false);
        setShareUserResults([]);
        fetchFileTree();
      } else {
        setShareError(data.error || "Failed to share");
      }
    } catch {
      setShareError("Failed to share");
    } finally {
      setIsAddingShare(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!shareModal) return;
    const endpoint = shareModal.type === "file" ? "files" : "folders";
    try {
      const res = await fetch(`/api/${endpoint}/${shareModal.id}/share/${shareId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShareModalShares((prev) => prev.filter((s) => s.id !== shareId));
        fetchFileTree();
      }
    } catch {
      // ignore
    }
  };

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isDeleting = isDeletingFolder === folder.id;
    const isOwned = !folder.isSharedWithMe;

    return (
      <div key={folder.id} style={{ marginBottom: "4px", opacity: isDeleting ? 0.5 : 1 }}>
        <div
          className="flex items-center gap-2 rounded-md cursor-pointer group"
          style={{ padding: "10px 12px", paddingLeft: `${16 + depth * 16}px`, color: "#3E2723" }}
          onClick={() => !isDeleting && toggleFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (isOwned) {
              setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
            }
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#EBE3D5")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" style={{ color: "#8B7355" }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: "#8B7355" }} />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" style={{ color: "#9B8F5E" }} />
          ) : (
            <Folder className="h-4 w-4" style={{ color: "#9B8F5E" }} />
          )}
          <span className="text-sm truncate flex-1">{folder.name}</span>

          {/* Shared indicator icons */}
          {folder.isSharedWithOthers && (
            <Users className="h-3 w-3 flex-shrink-0" style={{ color: "#9B8F5E" }} title="Shared with others" />
          )}
          {folder.isSharedWithMe && (
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "#8B7355", fontSize: "10px" }}
              title={`Shared by ${folder.sharedByName}`}
            >
              shared
            </span>
          )}

          <div className="flex items-center gap-1">
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#C4756C" }} />
            ) : (
              <>
                {/* Share button (owner only) */}
                {isOwned && !isGuest && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openShareModal("folder", folder.id, folder.name);
                    }}
                    className="rounded hover:opacity-80 opacity-0 group-hover:opacity-100"
                    style={{ padding: "4px" }}
                    title="Share folder"
                  >
                    <Share2 className="h-3 w-3" style={{ color: "#9B8F5E" }} />
                  </button>
                )}
                {isOwned && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                    className="rounded hover:opacity-80 opacity-0 group-hover:opacity-100"
                    style={{ padding: "4px" }}
                    title="Delete folder"
                  >
                    <Trash2 className="h-3 w-3" style={{ color: "#C4756C" }} />
                  </button>
                )}
                {isOwned && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startCreatingFile(folder.id);
                    }}
                    className="rounded hover:bg-[#D9CDBF]"
                    style={{ padding: "4px" }}
                    title="New file"
                  >
                    <Plus className="h-3 w-3" style={{ color: "#8B7355" }} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: "4px" }}>
            {isCreatingFolder && creatingInFolderId === folder.id && renderInlineInput("folder", depth + 1)}
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {isCreatingFile && creatingInFolderId === folder.id && renderInlineInput("file", depth + 1)}
            {folder.files.map((file) => renderFile(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: FileItem, depth: number = 0) => {
    const isSelected = selectedFile?.id === file.id;
    const isDeleting = isDeletingFile === file.id;
    const isLoadingThisFile = isLoadingFile === file.id;
    const isOwned = !file.isSharedWithMe;

    return (
      <div
        key={file.id}
        className="flex items-center gap-2 rounded-md cursor-pointer group"
        style={{
          padding: "10px 12px",
          paddingLeft: `${32 + depth * 16}px`,
          background: isSelected ? "#EBE3D5" : "transparent",
          marginBottom: "4px",
          opacity: isDeleting ? 0.5 : 1,
        }}
        onClick={() => !isDeleting && !isLoadingThisFile && handleSelectFile(file)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (isOwned) {
            setContextMenu({ x: e.clientX, y: e.clientY, type: "file", id: file.id });
          }
        }}
        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = "#EBE3D5")}
        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = "transparent")}
      >
        {isLoadingThisFile ? (
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#9B8F5E" }} />
        ) : (
          <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "#9B8F5E" }} />
        )}
        <span className="text-sm truncate flex-1" style={{ color: "#3E2723" }}>
          {file.name}
        </span>

        {/* Shared indicator icons */}
        {file.isSharedWithOthers && (
          <Users className="h-3 w-3 flex-shrink-0" style={{ color: "#9B8F5E" }} title="Shared with others" />
        )}
        {file.isSharedWithMe && (
          <span
            className="flex-shrink-0 text-xs"
            style={{ color: "#8B7355", fontSize: "10px" }}
            title={`Shared by ${file.sharedByName}`}
          >
            shared
          </span>
        )}

        {isDeleting ? (
          <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#C4756C" }} />
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
            {/* Share button (owner only) */}
            {isOwned && !isGuest && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openShareModal("file", file.id, file.name);
                }}
                style={{ padding: "4px" }}
                title="Share file"
              >
                <Share2 className="h-3 w-3" style={{ color: "#9B8F5E" }} />
              </button>
            )}
            {isOwned && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFile(file.id);
                }}
                style={{ padding: "4px" }}
                title="Delete file"
              >
                <Trash2 className="h-3 w-3" style={{ color: "#C4756C" }} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const filterFoldersByQuery = (items: FolderItem[], queryLower: string): FolderItem[] => {
    return items.reduce<FolderItem[]>((acc, folder) => {
      const childMatches = filterFoldersByQuery(folder.children, queryLower);
      const fileMatches = folder.files.filter((f) => f.name.toLowerCase().includes(queryLower));
      const folderMatches = folder.name.toLowerCase().includes(queryLower);

      if (folderMatches || childMatches.length > 0 || fileMatches.length > 0) {
        acc.push({
          ...folder,
          children: childMatches,
          files: fileMatches,
        });
      }
      return acc;
    }, []);
  };

  // Compute what to show based on filter
  const visibleFolders = fileFilter === "shared" ? sharedFolders : fileFilter === "my" ? folders : [...folders, ...sharedFolders];
  const visibleRootFiles = fileFilter === "shared" ? sharedFiles : fileFilter === "my" ? rootFiles : [...rootFiles, ...sharedFiles];
  const searchQuery = fileSearch.trim().toLowerCase();
  const filteredFolders = searchQuery ? filterFoldersByQuery(visibleFolders, searchQuery) : visibleFolders;
  const filteredRootFiles = searchQuery
    ? visibleRootFiles.filter((file) => file.name.toLowerCase().includes(searchQuery))
    : visibleRootFiles;
  const isEmpty = filteredFolders.length === 0 && filteredRootFiles.length === 0 && !isCreatingFile && !isCreatingFolder;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#F5EFE7" }}>
      {/* Header */}
      <header
        className="h-14 border-b flex items-center justify-between"
        style={{ background: "#F5EFE7", borderColor: "#D9CDBF", padding: "0 24px" }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "#9B8F5E" }}>
              <Database className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: "#3E2723" }}>DB-Viz</span>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 hover:opacity-80">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: isGuest ? "#8B7355" : "#9B8F5E" }}>
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-medium" style={{ color: "#3E2723" }}>
              {isGuest ? "Guest" : user?.name || "User"}
            </span>
            {isGuest && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#EBE3D5", color: "#8B7355" }}>
                Local
              </span>
            )}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-md shadow-lg z-50" style={{ background: "#FFFFFF", border: "1px solid #D9CDBF", padding: "8px" }}>
              <div style={{ borderBottom: "1px solid #D9CDBF", padding: "8px 12px 12px" }}>
                <p className="text-sm font-medium" style={{ color: "#3E2723" }}>{isGuest ? "Guest Mode" : user?.name}</p>
                <p className="text-xs" style={{ color: "#8B7355" }}>{isGuest ? "Files stored locally" : user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-sm hover:opacity-80 rounded-md"
                style={{ color: "#C4756C", padding: "10px 12px", marginTop: "8px" }}
              >
                <LogOut className="h-4 w-4" />
                {isGuest ? "Exit guest mode" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className="flex flex-col relative"
          style={{
            background: "#FFFFFF",
            borderRight: "1px solid #D9CDBF",
            width: `${sidebarWidth}px`,
            minWidth: "150px",
            maxWidth: "500px",
          }}
        >
          {/* Resize Handle */}
          <div
            onMouseDown={startResizing}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#9B8F5E] transition-colors z-10"
            style={{ background: "transparent" }}
          />

          {selectedFile ? (
            <>
              <div className="flex items-center justify-between" style={{ padding: "12px 16px", borderBottom: "1px solid #D9CDBF" }}>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="flex items-center gap-2 text-sm rounded-md hover:opacity-80"
                  style={{ background: "#EBE3D5", color: "#8B7355", padding: "8px 12px" }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleSaveFile}
                  disabled={isSaving || (selectedFile.isSharedWithMe && !selectedFile.canWrite)}
                  className="flex items-center gap-2 text-sm rounded-md hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: hasChanges ? "#9B8F5E" : "#EBE3D5",
                    color: hasChanges ? "#FFFFFF" : "#8B7355",
                    padding: "8px 12px",
                  }}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {isSaving ? "Saving..." : hasChanges ? "Save" : "Saved"}
                </button>
              </div>

              <div className="flex items-center gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid #D9CDBF" }}>
                <FileText className="h-4 w-4" style={{ color: "#9B8F5E" }} />
                <span className="text-sm font-medium truncate flex-1" style={{ color: "#3E2723" }}>
                  {selectedFile.name}
                </span>
                {selectedFile.isSharedWithMe && (
                  <span
                    className="text-xs rounded"
                    style={{
                      background: "#EBE3D5",
                      color: "#8B7355",
                      whiteSpace: "nowrap",
                      padding: "6px 12px",
                      lineHeight: "1.2",
                    }}
                  >
                    {selectedFile.canWrite ? "can edit" : "view only"}
                  </span>
                )}
              </div>

              <div className="flex-1 flex overflow-hidden">
                <style>{`
                  .dbml-editor::-webkit-scrollbar { width: 8px; }
                  .dbml-editor::-webkit-scrollbar-track { background: #F5EEE5; }
                  .dbml-editor::-webkit-scrollbar-thumb { background: #9E8E58; border-radius: 4px; }
                  .dbml-editor::-webkit-scrollbar-thumb:hover { background: #8B7F4E; }
                  .line-numbers::-webkit-scrollbar { display: none; }
                `}</style>
                <div
                  id="line-numbers"
                  className="line-numbers text-xs font-mono text-right select-none overflow-y-scroll"
                  style={{ background: "#EBE3D5", color: "#8B7355", padding: "16px 12px 16px 16px", minWidth: "50px", borderRight: "1px solid #D9CDBF" }}
                >
                  {dbmlContent.split("\n").map((_, i) => (
                    <div key={i} style={{ lineHeight: "1.5" }}>{i + 1}</div>
                  ))}
                  {dbmlContent === "" && <div style={{ lineHeight: "1.5" }}>1</div>}
                </div>
                <textarea
                  value={dbmlContent}
                  onChange={(e) => {
                    setDbmlContent(e.target.value);
                    setHasChanges(true);
                  }}
                  readOnly={selectedFile.isSharedWithMe && !selectedFile.canWrite}
                  onScroll={(e) => {
                    const lineNumbers = document.getElementById("line-numbers");
                    if (lineNumbers) lineNumbers.scrollTop = e.currentTarget.scrollTop;
                  }}
                  placeholder={`// Define your database schema\nTable users {\n  id int [pk]\n  name varchar\n}`}
                  className="dbml-editor flex-1 text-sm font-mono resize-none focus:outline-none"
                  style={{ background: "#F5EEE5", color: "#3E2723", padding: "16px 16px 16px 20px", border: "none", lineHeight: "1.5", whiteSpace: "nowrap", overflowX: "auto" }}
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between" style={{ height: "48px", padding: "0 16px", borderBottom: "1px solid #D9CDBF" }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B7355" }}>
                  {isGuest ? "Local Files" : "Files"}
                </span>
                <div className="flex items-center gap-2">
                  {!isGuest && (
                    <button
                      onClick={() => startCreatingFolder(null)}
                      className="rounded-md hover:opacity-80"
                      style={{ background: "#EBE3D5", padding: "6px" }}
                      title="New Folder"
                    >
                      <FolderPlus className="h-4 w-4" style={{ color: "#8B7355" }} />
                    </button>
                  )}
                  <button
                    onClick={() => startCreatingFile(null)}
                    disabled={isCreatingFileLoading}
                    className="rounded-md hover:opacity-90 disabled:opacity-50"
                    style={{ background: "#9B8F5E", padding: "6px" }}
                    title="New File"
                  >
                    {isCreatingFileLoading ? (
                      <Loader2 className="h-4 w-4 text-white animate-spin" />
                    ) : (
                      <FilePlus className="h-4 w-4 text-white" />
                    )}
                  </button>
                </div>
              </div>

              {/* Filter + search row */}
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #D9CDBF" }}>
                {isSidebarCompact ? (
                  <div className="flex items-center gap-2">
                    {!isGuest && (
                      <div className="relative">
                        <button
                          className="rounded-md flex items-center justify-center"
                          style={{ background: "#F5EEE5", border: "1px solid #D9CDBF", width: "36px", height: "36px" }}
                          title="Filter files"
                        >
                          <ChevronDown className="h-4 w-4" style={{ color: "#8B7355" }} />
                        </button>
                        <select
                          value={fileFilter}
                          onChange={(e) => setFileFilter(e.target.value as FileFilter)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          aria-label="Filter files"
                        >
                          <option value="all">All Files</option>
                          <option value="my">My Files</option>
                          <option value="shared">Shared with me</option>
                        </select>
                      </div>
                    )}
                    <button
                      onClick={() => setShowCompactSearch((prev) => !prev)}
                      className="rounded-md flex items-center justify-center"
                      style={{ background: "#F5EEE5", border: "1px solid #D9CDBF", width: "36px", height: "36px" }}
                      title="Search files"
                    >
                      <Search className="h-4 w-4" style={{ color: "#8B7355" }} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {!isGuest && (
                      <div style={{ maxWidth: "220px", flex: "0 0 auto" }}>
                        <select
                          value={fileFilter}
                          onChange={(e) => setFileFilter(e.target.value as FileFilter)}
                          className="text-xs rounded-md focus:outline-none"
                          style={{
                            background: "#F5EEE5",
                            color: "#3E2723",
                            border: "1px solid #D9CDBF",
                            padding: "16px 18px",
                            height: "44px",
                            lineHeight: "1.2",
                            cursor: "pointer",
                            width: "fit-content",
                          }}
                        >
                          <option value="all">All Files</option>
                          <option value="my">My Files</option>
                          <option value="shared">Shared with me</option>
                        </select>
                      </div>
                    )}
                    <input
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      placeholder="Search files"
                      className="text-xs rounded-md focus:outline-none"
                      style={{
                        background: "#F5EEE5",
                        color: "#3E2723",
                        border: "1px solid #D9CDBF",
                        padding: "12px 12px",
                        height: "44px",
                        flex: 1,
                        minWidth: 0,
                      }}
                    />
                  </div>
                )}
                {isSidebarCompact && showCompactSearch && (
                  <div style={{ marginTop: "8px" }}>
                    <input
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      placeholder="Search files"
                      className="w-full text-xs rounded-md focus:outline-none"
                      style={{
                        background: "#F5EEE5",
                        color: "#3E2723",
                        border: "1px solid #D9CDBF",
                        padding: "10px 12px",
                      }}
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto" style={{ padding: "12px" }}>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "#8B7355" }} />
                  </div>
                ) : (
                  <>
                    {isCreatingFolder && creatingInFolderId === null && renderInlineInput("folder", 0)}
                    {filteredFolders.map((folder) => renderFolder(folder))}
                    {isCreatingFile && creatingInFolderId === null && renderInlineInput("file", 0)}
                    {filteredRootFiles.map((file) => renderFile(file))}

                    {isEmpty && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 0", color: "#8B7355" }}>
                        <FileText style={{ width: "48px", height: "48px", marginBottom: "10px", opacity: 0.5 }} />
                        <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
                          {fileFilter === "shared" ? "Nothing shared with you yet" : "No files yet"}
                        </p>
                        <p style={{ fontSize: "12px" }}>
                          {fileFilter === "shared" ? "Files shared by others will appear here" : "Create your first .dbml or .sql file"}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {selectedFile ? (
            <DBViewer
              dbmlContent={dbmlContent}
              fileName={selectedFile.name}
              layoutData={fileLayoutData}
              onLayoutChange={handleLayoutChange}
            />
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between" style={{ height: "48px", background: "#FFFFFF", borderBottom: "1px solid #D9CDBF", padding: "0 16px" }}>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" style={{ color: "#9B8F5E" }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8B7355" }}>DB Viewer</span>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center" style={{ background: "#F5EFE7" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                  <Database style={{ width: "64px", height: "64px", marginBottom: "12px", opacity: 0.3, color: "#8B7355" }} />
                  <h2 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "8px", color: "#3E2723" }}>Select a file</h2>
                  <p style={{ fontSize: "14px", color: "#8B7355" }}>Choose a DBML file from the sidebar to view its diagram</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y, background: "#FFFFFF", border: "1px solid #D9CDBF" }}
        >
          {contextMenu.type === "file" && (
            <button
              onClick={() => {
                const file = [...rootFiles, ...sharedFiles]
                  .concat(getAllFilesFromFolders(folders))
                  .find((f) => f.id === contextMenu.id);
                if (file) openShareModal("file", contextMenu.id, file.name);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm w-full hover:opacity-80"
              style={{ color: "#9B8F5E" }}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
          {contextMenu.type === "folder" && (
            <button
              onClick={() => {
                const folder = findFolderById(folders, contextMenu.id);
                if (folder) openShareModal("folder", contextMenu.id, folder.name);
                setContextMenu(null);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm w-full hover:opacity-80"
              style={{ color: "#9B8F5E" }}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
          <button
            onClick={() =>
              contextMenu.type === "file"
                ? handleDeleteFile(contextMenu.id)
                : handleDeleteFolder(contextMenu.id)
            }
            className="flex items-center gap-2 px-4 py-2 text-sm w-full hover:opacity-80"
            style={{ color: "#C4756C" }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="rounded-xl shadow-2xl w-full max-w-md" style={{ background: "#FFFFFF", border: "1px solid #D9CDBF", padding: "32px" }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5" style={{ color: "#9B8F5E" }} />
                <h2 className="text-base font-semibold" style={{ color: "#3E2723" }}>
                  Share "{shareModal.name}"
                </h2>
              </div>
              <button onClick={() => { setShareModal(null); setShareUserResults([]); }} className="hover:opacity-70">
                <X className="h-5 w-5" style={{ color: "#8B7355" }} />
              </button>
            </div>

            {/* Add share form */}
            <div className="mb-7">
              <label className="text-xs font-medium mb-2 block" style={{ color: "#8B7355" }}>
                Add people by email
              </label>
              <div className="relative mb-2">
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => { setShareEmail(e.target.value); setShareError(""); }}
                    placeholder="user@example.com"
                    className="flex-1 text-sm rounded-md focus:outline-none"
                    style={{ background: "#F5EEE5", color: "#3E2723", border: "1px solid #D9CDBF", padding: "12px 14px" }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddShare(); }}
                  />
                  <button
                    onClick={handleAddShare}
                    disabled={isAddingShare || !shareEmail.trim()}
                    className="text-sm rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                    style={{ background: "#9B8F5E", color: "#FFFFFF", padding: "12px 16px", whiteSpace: "nowrap" }}
                  >
                    {isAddingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                  </button>
                </div>
                {shareEmail.trim().length >= 2 && (isSearchingUsers || shareUserResults.length > 0) && (
                  <div
                    className="absolute z-10 mt-2 w-full rounded-md shadow-lg"
                    style={{ background: "#FFFFFF", border: "1px solid #D9CDBF", padding: "8px" }}
                  >
                    {isSearchingUsers ? (
                      <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#8B7355" }} />
                      </div>
                    ) : (
                      (() => {
                        const sharedEmails = new Set(
                          shareModalShares.map((s) => s.sharedWith.email.toLowerCase())
                        );
                        const filteredResults = shareUserResults.filter(
                          (u) => !sharedEmails.has(u.email.toLowerCase())
                        );

                        if (filteredResults.length === 0) {
                          return (
                            <p className="text-xs text-center py-2" style={{ color: "#A89B7B" }}>
                              No matches
                            </p>
                          );
                        }

                        return (
                          <ul className="space-y-1">
                            {filteredResults.map((u) => (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  onClick={() => { setShareEmail(u.email); setShareUserResults([]); }}
                                  className="w-full text-left flex items-center gap-2 rounded-md hover:opacity-90"
                                  style={{ padding: "10px 12px", background: "#F5EEE5" }}
                                >
                                  <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-medium"
                                    style={{ background: "#9B8F5E" }}
                                  >
                                    {u.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium" style={{ color: "#3E2723" }}>{u.name}</p>
                                    <p className="text-xs" style={{ color: "#8B7355" }}>{u.email}</p>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "#8B7355" }}>
                <input
                  type="checkbox"
                  checked={shareCanWrite}
                  onChange={(e) => setShareCanWrite(e.target.checked)}
                  className="rounded"
                />
                Allow editing
              </label>
              {shareError && (
                <p className="text-xs mt-2" style={{ color: "#C4756C" }}>{shareError}</p>
              )}
            </div>

            {/* Current shares list */}
            <div>
              <p className="text-xs font-medium mb-3" style={{ color: "#8B7355" }}>
                Shared with
              </p>
              {isLoadingShares ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#8B7355" }} />
                </div>
              ) : shareModalShares.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: "#A89B7B" }}>
                  Not shared with anyone yet
                </p>
              ) : (
                <ul className="space-y-3">
                  {shareModalShares.map((s) => (
                    <li key={s.id} className="flex items-center justify-between rounded-md" style={{ padding: "12px 16px", background: "#F5EEE5" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-medium" style={{ background: "#9B8F5E" }}>
                          {s.sharedWith.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium" style={{ color: "#3E2723" }}>{s.sharedWith.name}</p>
                          <p className="text-xs" style={{ color: "#8B7355" }}>{s.sharedWith.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded" style={{ background: "#EBE3D5", color: "#8B7355" }}>
                          {s.canWrite ? "can edit" : "view only"}
                        </span>
                        <button
                          onClick={() => handleRemoveShare(s.id)}
                          className="hover:opacity-70"
                          title="Remove access"
                        >
                          <X className="h-3.5 w-3.5" style={{ color: "#C4756C" }} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getAllFilesFromFolders(folders: FolderItem[]): FileItem[] {
  const files: FileItem[] = [];
  for (const folder of folders) {
    files.push(...folder.files);
    files.push(...getAllFilesFromFolders(folder.children));
  }
  return files;
}

function findFolderById(folders: FolderItem[], id: string): FolderItem | null {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const found = findFolderById(folder.children, id);
    if (found) return found;
  }
  return null;
}
