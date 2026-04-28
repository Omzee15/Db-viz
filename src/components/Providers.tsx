"use client";

import { GuestProvider } from "@/lib/guest-context";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <GuestProvider>{children}</GuestProvider>;
}
