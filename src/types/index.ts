export interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  children: Folder[];
  files: DBFile[];
  createdAt: string;
}

export interface DBFile {
  id: string;
  name: string;
  content: string;
  layoutData: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileTreeResponse {
  folders: Folder[];
  rootFiles: DBFile[];
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
}
