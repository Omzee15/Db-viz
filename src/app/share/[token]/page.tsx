"use client";

import { useState, useEffect, use } from "react";
import DBViewer from "@/components/DBViewer";
import { Database, User, Loader2, AlertTriangle, FileText, Folder, LogIn } from "lucide-react";

interface SharedFile {
  id: string;
  name: string;
  content: string;
  layoutData: string;
}

interface SharedData {
  type: "file" | "folder";
  id: string;
  name: string;
  ownerName: string;
  content?: string;
  layoutData?: string;
  files?: SharedFile[];
}

export default function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SharedData | null>(null);
  const [selectedFile, setSelectedFile] = useState<SharedFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
          // If it's a file, set it as selected
          if (json.data.type === "file") {
            setSelectedFile({
              id: json.data.id,
              name: json.data.name,
              content: json.data.content,
              layoutData: json.data.layoutData,
            });
          } else if (json.data.files?.length > 0) {
            // Auto-select first file in folder
            setSelectedFile(json.data.files[0]);
          }
        } else {
          setError(json.error || "Failed to load shared content");
        }
      } catch {
        setError("Failed to load shared content");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#FAF7F2" }}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#9B8F5E" }} />
          <p className="text-sm" style={{ color: "#8B7355" }}>
            Loading shared visualization...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#FAF7F2" }}
      >
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <AlertTriangle className="h-12 w-12" style={{ color: "#C4756C" }} />
          <h1 className="text-lg font-semibold" style={{ color: "#3E2723" }}>
            Link Not Found
          </h1>
          <p className="text-sm" style={{ color: "#8B7355" }}>
            {error || "This share link may have expired or been revoked."}
          </p>
          <a
            href="/login"
            className="text-sm underline hover:opacity-70"
            style={{ color: "#9B8F5E" }}
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF7F2" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between border-b"
        style={{ background: "#FFFFFF", borderColor: "#D9CDBF", padding: "16px 32px" }}
      >
        <div className="flex items-center gap-4">
          {data.type === "folder" ? (
            <Folder className="h-6 w-6" style={{ color: "#9B8F5E" }} />
          ) : (
            <Database className="h-6 w-6" style={{ color: "#9B8F5E" }} />
          )}
          <h1 className="text-lg font-semibold" style={{ color: "#3E2723" }}>
            {data.name}
          </h1>
          <span
            className="text-xs rounded"
            style={{ background: "#F5EEE5", color: "#8B7355", padding: "6px 12px" }}
          >
            View Only
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" style={{ color: "#8B7355" }} />
            <span className="text-sm" style={{ color: "#8B7355" }}>
              Shared by {data.ownerName}
            </span>
          </div>
          <a
            href={`/login?shareToken=${token}`}
            className="flex items-center gap-2 text-sm rounded-lg hover:opacity-90"
            style={{ background: "#9B8F5E", color: "#FFFFFF", padding: "10px 18px" }}
          >
            <LogIn className="h-4 w-4" />
            Login
          </a>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar for folder view */}
        {data.type === "folder" && data.files && (
          <aside
            className="w-64 border-r overflow-y-auto"
            style={{ background: "#FFFFFF", borderColor: "#D9CDBF" }}
          >
            <div className="p-4">
              <p className="text-xs font-medium mb-3" style={{ color: "#8B7355" }}>
                Files in folder
              </p>
              <ul className="space-y-1">
                {data.files.map((file) => (
                  <li key={file.id}>
                    <button
                      onClick={() => setSelectedFile(file)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:opacity-80"
                      style={{
                        background: selectedFile?.id === file.id ? "#F5EEE5" : "transparent",
                        color: "#3E2723",
                      }}
                    >
                      <FileText className="h-4 w-4" style={{ color: "#9B8F5E" }} />
                      <span className="text-sm truncate">{file.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {data.files.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: "#A89B7B" }}>
                  No files in this folder
                </p>
              )}
            </div>
          </aside>
        )}

        {/* Viewer */}
        <div className="flex-1">
          {selectedFile ? (
            <DBViewer
              dbmlContent={selectedFile.content}
              fileName={selectedFile.name}
              layoutData={selectedFile.layoutData}
              onLayoutChange={() => {}} // Read-only, no saving
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm" style={{ color: "#8B7355" }}>
                Select a file to view its diagram
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
