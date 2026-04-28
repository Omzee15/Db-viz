"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface GuestFile {
  id: string;
  name: string;
  content: string;
  layoutData: string;
  folderId: null;
  createdAt: string;
  updatedAt: string;
}

interface GuestContextType {
  isGuest: boolean;
  guestFiles: GuestFile[];
  setGuestMode: (isGuest: boolean) => void;
  addGuestFile: (name: string) => GuestFile;
  updateGuestFile: (id: string, content: string, layoutData: string) => void;
  deleteGuestFile: (id: string) => void;
  getGuestFile: (id: string) => GuestFile | undefined;
}

const GuestContext = createContext<GuestContextType | undefined>(undefined);

// Helper to set cookie
function setCookie(name: string, value: string, days: number = 1) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

// Helper to delete cookie
function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// Helper to get cookie
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);
  const [guestFiles, setGuestFiles] = useState<GuestFile[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Check cookie for guest mode on mount
    const guestMode = getCookie("guestMode");
    if (guestMode === "true") {
      setIsGuest(true);
    }
    setIsInitialized(true);
  }, []);

  const setGuestMode = (guest: boolean) => {
    setIsGuest(guest);
    if (guest) {
      setCookie("guestMode", "true", 1); // 1 day expiry
      sessionStorage.setItem("guestMode", "true");
    } else {
      deleteCookie("guestMode");
      sessionStorage.removeItem("guestMode");
      setGuestFiles([]);
    }
  };

  const addGuestFile = (name: string): GuestFile => {
    const newFile: GuestFile = {
      id: `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      content: "",
      layoutData: "{}",
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setGuestFiles((prev) => [...prev, newFile]);
    return newFile;
  };

  const updateGuestFile = (id: string, content: string, layoutData: string) => {
    setGuestFiles((prev) =>
      prev.map((file) =>
        file.id === id
          ? { ...file, content, layoutData, updatedAt: new Date().toISOString() }
          : file
      )
    );
  };

  const deleteGuestFile = (id: string) => {
    setGuestFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const getGuestFile = (id: string) => {
    return guestFiles.find((file) => file.id === id);
  };

  // Don't render children until initialization is complete to prevent hydration mismatch
  if (!isInitialized) {
    return null;
  }

  return (
    <GuestContext.Provider
      value={{
        isGuest,
        guestFiles,
        setGuestMode,
        addGuestFile,
        updateGuestFile,
        deleteGuestFile,
        getGuestFile,
      }}
    >
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest() {
  const context = useContext(GuestContext);
  if (context === undefined) {
    throw new Error("useGuest must be used within a GuestProvider");
  }
  return context;
}
