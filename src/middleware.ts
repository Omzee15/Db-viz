import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/api/auth/login", "/api/auth/register", "/api/health"];
  
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // If user is authenticated and trying to access login, redirect to dashboard
    if (pathname === "/login") {
      const token = request.cookies.get("token")?.value;
      if (token) {
        const payload = await verifyToken(token);
        if (payload) {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // Check for guest mode cookie - allow dashboard access for guests
  const guestMode = request.cookies.get("guestMode")?.value;
  if (guestMode === "true" && pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Check authentication for protected routes
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/api/folders/:path*",
    "/api/files/:path*",
    "/api/auth/me",
  ],
};
