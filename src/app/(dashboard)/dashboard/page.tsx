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
} from "lucide-react";
import DBViewer from "@/components/DBViewer";

interface FileItem {
  id: string;
  name: string;
  content: string;
  layoutData: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderItem {
  id: string;
  name: string;
  parentFolderId: string | null;
  children: FolderItem[];
  files: FileItem[];
  createdAt: string;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export default function DashboardPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [rootFiles, setRootFiles] = useState<FileItem[]>([]);
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
  const isResizing = useRef(false);
  const router = useRouter();

  // Sync DBML content with selected file
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

  // Sidebar resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(e.clientX, 150), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = () => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const fetchFileTree = useCallback(async () => {
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
    } catch (error) {
      console.error("Failed to fetch file tree:", error);
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
    fetchFileTree();
  }, [fetchFileTree]);

  const handleLogout = async () => {
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
    try {
      const res = await fetch(`/api/files/${file.id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedFile(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch file:", error);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;

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
    }
  };

  const handleLayoutChange = (layoutData: string) => {
    setFileLayoutData(layoutData);
    setHasChanges(true);
  };

  const handleCreateFile = async (name: string) => {
    if (!name.trim()) {
      cancelInlineCreate();
      return;
    }

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: (name.endsWith(".dbml") || name.endsWith(".sql")) ? name : `${name}.dbml`,
          content: "",
          folderId: creatingInFolderId,
        }),
      });

      if (res.ok) {
        cancelInlineCreate();
        fetchFileTree();
      }
    } catch (error) {
      console.error("Failed to create file:", error);
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!name.trim()) {
      cancelInlineCreate();
      return;
    }

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          parentFolderId: creatingInFolderId,
        }),
      });

      if (res.ok) {
        cancelInlineCreate();
        fetchFileTree();
      }
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const startCreatingFile = (folderId: string | null) => {
    setIsCreatingFile(true);
    setIsCreatingFolder(false);
    setCreatingInFolderId(folderId);
    setNewItemName("");
    if (folderId) {
      setExpandedFolders(prev => new Set([...prev, folderId]));
    }
  };

  const startCreatingFolder = (parentFolderId: string | null) => {
    setIsCreatingFolder(true);
    setIsCreatingFile(false);
    setCreatingInFolderId(parentFolderId);
    setNewItemName("");
    if (parentFolderId) {
      setExpandedFolders(prev => new Set([...prev, parentFolderId]));
    }
  };

  const cancelInlineCreate = () => {
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
    setCreatingInFolderId(null);
    setNewItemName("");
  };

  const renderInlineInput = (type: 'file' | 'folder', depth: number = 0) => (
    <div
      className="flex items-center gap-2 rounded-md"
      style={{ 
        padding: '8px 12px',
        paddingLeft: type === 'file' ? `${32 + depth * 16}px` : `${16 + depth * 16}px`,
        background: '#EBE3D5',
        marginBottom: '4px',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {type === 'folder' ? (
        <Folder className="h-4 w-4" style={{ color: '#9B8F5E', flexShrink: 0 }} />
      ) : (
        <FileText className="h-4 w-4" style={{ color: '#9B8F5E', flexShrink: 0 }} />
      )}
      <input
        type="text"
        value={newItemName}
        onChange={(e) => setNewItemName(e.target.value)}
        placeholder={type === 'folder' ? 'Folder name' : 'filename.dbml or .sql'}
        autoFocus
        className="text-sm rounded border-0 focus:outline-none"
        style={{ background: '#F5EEE5', color: '#3E2723', padding: '4px 8px', flex: 1, minWidth: 0, width: '100%' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            type === 'folder' ? handleCreateFolder(newItemName) : handleCreateFile(newItemName);
          } else if (e.key === 'Escape') {
            cancelInlineCreate();
          }
        }}
        onBlur={() => {
          if (newItemName.trim()) {
            type === 'folder' ? handleCreateFolder(newItemName) : handleCreateFile(newItemName);
          } else {
            cancelInlineCreate();
          }
        }}
      />
    </div>
  );

  const handleDeleteFile = async (id: string) => {
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedFile?.id === id) {
          setSelectedFile(null);
        }
        fetchFileTree();
      }
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
    setContextMenu(null);
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchFileTree();
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
    setContextMenu(null);
  };

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);

    return (
      <div key={folder.id} style={{ marginBottom: '4px' }}>
        <div
          className="flex items-center gap-2 rounded-md cursor-pointer group"
          style={{ padding: '10px 12px', paddingLeft: `${16 + depth * 16}px`, color: '#3E2723' }}
          onClick={() => toggleFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              type: "folder",
              id: folder.id,
            });
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#EBE3D5')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" style={{ color: '#8B7355' }} />
          ) : (
            <ChevronRight className="h-4 w-4" style={{ color: '#8B7355' }} />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" style={{ color: '#9B8F5E' }} />
          ) : (
            <Folder className="h-4 w-4" style={{ color: '#9B8F5E' }} />
          )}
          <span className="text-sm truncate flex-1">{folder.name}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              className="rounded hover:opacity-80 opacity-0 group-hover:opacity-100"
              style={{ padding: '4px' }}
              title="Delete folder"
            >
              <Trash2 className="h-3 w-3" style={{ color: '#C4756C' }} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                startCreatingFile(folder.id);
              }}
              className="rounded hover:bg-[#D9CDBF]"
              style={{ padding: '4px' }}
              title="New file"
            >
              <Plus className="h-3 w-3" style={{ color: '#8B7355' }} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '4px' }}>
            {isCreatingFolder && creatingInFolderId === folder.id && renderInlineInput('folder', depth + 1)}
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {isCreatingFile && creatingInFolderId === folder.id && renderInlineInput('file', depth + 1)}
            {folder.files.map((file) => renderFile(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: FileItem, depth: number = 0) => {
    const isSelected = selectedFile?.id === file.id;

    return (
      <div
        key={file.id}
        className="flex items-center gap-2 rounded-md cursor-pointer group"
        style={{ 
          padding: '10px 12px',
          paddingLeft: `${32 + depth * 16}px`,
          background: isSelected ? '#EBE3D5' : 'transparent',
          marginBottom: '4px'
        }}
        onClick={() => handleSelectFile(file)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            type: "file",
            id: file.id,
          });
        }}
        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#EBE3D5')}
        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'transparent')}
      >
        <FileText className="h-4 w-4" style={{ color: '#9B8F5E' }} />
        <span className="text-sm truncate flex-1" style={{ color: '#3E2723' }}>{file.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteFile(file.id);
          }}
          className="rounded hover:opacity-80 opacity-0 group-hover:opacity-100"
          style={{ padding: '4px' }}
          title="Delete file"
        >
          <Trash2 className="h-3 w-3" style={{ color: '#C4756C' }} />
        </button>
      </div>
    );
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F5EFE7' }}>
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between" style={{ background: '#F5EFE7', borderColor: '#D9CDBF', padding: '0 24px' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: '#9B8F5E' }}>
              <Database className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: '#3E2723' }}>DB-Viz</span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:opacity-80"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#9B8F5E' }}>
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-medium" style={{ color: '#3E2723' }}>{user?.name || "User"}</span>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-md shadow-lg z-50" style={{ background: '#FFFFFF', border: '1px solid #D9CDBF', padding: '8px' }}>
              <div style={{ borderBottom: '1px solid #D9CDBF', padding: '8px 12px 12px' }}>
                <p className="text-sm font-medium" style={{ color: '#3E2723' }}>{user?.name}</p>
                <p className="text-xs" style={{ color: '#8B7355' }}>{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-sm hover:opacity-80 rounded-md"
                style={{ color: '#C4756C', padding: '10px 12px', marginTop: '8px' }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - File Browser */}
        <aside className="flex flex-col relative" style={{ background: '#FFFFFF', borderRight: '1px solid #D9CDBF', width: `${sidebarWidth}px`, minWidth: '150px', maxWidth: '500px' }}>
          {/* Resize Handle */}
          <div
            onMouseDown={startResizing}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#9B8F5E] transition-colors z-10"
            style={{ background: 'transparent' }}
          />
          
          {selectedFile ? (
            <>
              {/* Selected File View with DBML Editor */}
              <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid #D9CDBF' }}>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="flex items-center gap-2 text-sm rounded-md hover:opacity-80"
                  style={{ background: '#EBE3D5', color: '#8B7355', padding: '8px 12px' }}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleSaveFile}
                  className="flex items-center gap-2 text-sm rounded-md hover:opacity-90"
                  style={{ background: hasChanges ? '#9B8F5E' : '#EBE3D5', color: hasChanges ? '#FFFFFF' : '#8B7355', padding: '8px 12px' }}
                >
                  <Save className="h-3 w-3" />
                  {hasChanges ? 'Save' : 'Saved'}
                </button>
              </div>
              
              {/* File name header */}
              <div className="flex items-center gap-2" style={{ padding: '12px 16px', borderBottom: '1px solid #D9CDBF' }}>
                <FileText className="h-4 w-4" style={{ color: '#9B8F5E' }} />
                <span className="text-sm font-medium truncate" style={{ color: '#3E2723' }}>{selectedFile.name}</span>
              </div>
              
              {/* DBML Editor */}
              <div className="flex-1 flex overflow-hidden">
                <style>{`
                  .dbml-editor::-webkit-scrollbar {
                    width: 8px;
                  }
                  .dbml-editor::-webkit-scrollbar-track {
                    background: #F5EEE5;
                  }
                  .dbml-editor::-webkit-scrollbar-thumb {
                    background: #9E8E58;
                    border-radius: 4px;
                  }
                  .dbml-editor::-webkit-scrollbar-thumb:hover {
                    background: #8B7F4E;
                  }
                  .line-numbers::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                {/* Line Numbers */}
                <div 
                  id="line-numbers"
                  className="line-numbers text-xs font-mono text-right select-none overflow-y-scroll"
                  style={{ 
                    background: '#EBE3D5', 
                    color: '#8B7355', 
                    padding: '16px 12px 16px 16px',
                    minWidth: '50px',
                    borderRight: '1px solid #D9CDBF'
                  }}
                >
                  {dbmlContent.split('\n').map((_, i) => (
                    <div key={i} style={{ lineHeight: '1.5' }}>{i + 1}</div>
                  ))}
                  {dbmlContent === '' && <div style={{ lineHeight: '1.5' }}>1</div>}
                </div>
                {/* Editor */}
                <textarea
                  value={dbmlContent}
                  onChange={(e) => {
                    setDbmlContent(e.target.value);
                    setHasChanges(true);
                  }}
                  onScroll={(e) => {
                    const lineNumbers = document.getElementById('line-numbers');
                    if (lineNumbers) {
                      lineNumbers.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  placeholder={`// Define your database schema
Table users {
  id int [pk]
  name varchar
}`}
                  className="dbml-editor flex-1 text-sm font-mono resize-none focus:outline-none"
                  style={{ background: '#F5EEE5', color: '#3E2723', padding: '16px 16px 16px 20px', border: 'none', lineHeight: '1.5', whiteSpace: 'nowrap', overflowX: 'auto' }}
                  spellCheck={false}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between" style={{ height: '48px', padding: '0 16px', borderBottom: '1px solid #D9CDBF' }}>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B7355' }}>Files</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startCreatingFolder(null)}
                    className="rounded-md hover:opacity-80"
                    style={{ background: '#EBE3D5', padding: '6px' }}
                    title="New Folder"
                  >
                    <FolderPlus className="h-4 w-4" style={{ color: '#8B7355' }} />
                  </button>
                  <button
                    onClick={() => startCreatingFile(null)}
                    className="rounded-md hover:opacity-90"
                    style={{ background: '#9B8F5E', padding: '6px' }}
                    title="New File"
                  >
                    <FilePlus className="h-4 w-4 text-white" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto" style={{ padding: '12px' }}>
                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-5 w-5 animate-spin" style={{ color: '#8B7355' }} />
                  </div>
                ) : (
                  <>
                    {/* Inline folder creation at root */}
                    {isCreatingFolder && creatingInFolderId === null && renderInlineInput('folder', 0)}
                    
                    {folders.map((folder) => renderFolder(folder))}
                    
                    {/* Inline file creation at root */}
                    {isCreatingFile && creatingInFolderId === null && renderInlineInput('file', 0)}
                    
                    {rootFiles.map((file) => renderFile(file))}
                    
                    {/* Empty state */}
                    {folders.length === 0 && rootFiles.length === 0 && !isCreatingFile && !isCreatingFolder && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 0', color: '#8B7355' }}>
                        <FileText style={{ width: '48px', height: '48px', marginBottom: '10px', opacity: 0.5 }} />
                        <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>No files yet</p>
                        <p style={{ fontSize: '12px' }}>Create your first DBML file</p>
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
              {/* DB Viewer Header */}
              <div className="flex items-center justify-between" style={{ height: '48px', background: '#FFFFFF', borderBottom: '1px solid #D9CDBF', padding: '0 16px' }}>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" style={{ color: '#9B8F5E' }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8B7355' }}>DB Viewer</span>
                </div>
              </div>
              
              <div className="flex-1 flex items-center justify-center" style={{ background: '#F5EFE7' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <Database style={{ width: '64px', height: '64px', marginBottom: '12px', opacity: 0.3, color: '#8B7355' }} />
                  <h2 style={{ fontSize: '20px', fontWeight: 500, marginBottom: '8px', color: '#3E2723' }}>Select a file</h2>
                  <p style={{ fontSize: '14px', color: '#8B7355' }}>
                    Choose a DBML file from the sidebar to view its diagram
                  </p>
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
          style={{ left: contextMenu.x, top: contextMenu.y, background: '#FFFFFF', border: '1px solid #D9CDBF' }}
        >
          <button
            onClick={() =>
              contextMenu.type === "file"
                ? handleDeleteFile(contextMenu.id)
                : handleDeleteFolder(contextMenu.id)
            }
            className="flex items-center gap-2 px-4 py-2 text-sm w-full hover:opacity-80"
            style={{ color: '#C4756C' }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}


    </div>
  );
}
