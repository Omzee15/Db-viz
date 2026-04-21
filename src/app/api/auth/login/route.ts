import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  console.log("[Login] POST request received");
  
  try {
    console.log("[Login] Parsing request body...");
    const body = await request.json();
    const { email, password } = body;
    console.log("[Login] Email provided:", email ? "yes" : "no");
    console.log("[Login] Password provided:", password ? "yes" : "no");

    if (!email || !password) {
      console.log("[Login] Missing email or password");
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    console.log("[Login] Querying database for user:", email);
    const user = await prisma.user.findUnique({
      where: { email, isActive: true },
    });
    console.log("[Login] User found:", !!user);

    if (!user) {
      console.log("[Login] No active user found with email:", email);
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    console.log("[Login] Comparing passwords...");
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    console.log("[Login] Password valid:", validPassword);

    if (!validPassword) {
      console.log("[Login] Invalid password for user:", email);
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      );
    }

    console.log("[Login] Signing JWT token...");
    const token = await signToken({ userId: user.id, email: user.email });
    console.log("[Login] Token signed successfully");

    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    console.log("[Login] Login successful for:", email);
    return response;
  } catch (error) {
    console.error("[Login] ERROR:", error);
    console.error("[Login] Error name:", (error as Error)?.name);
    console.error("[Login] Error message:", (error as Error)?.message);
    console.error("[Login] Error stack:", (error as Error)?.stack);
    return NextResponse.json(
      { success: false, error: "Failed to login", details: (error as Error)?.message },
      { status: 500 }
    );
  }
}
