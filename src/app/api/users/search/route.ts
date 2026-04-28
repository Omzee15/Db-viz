import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json(
        { success: false, error: "Query too short" },
        { status: 400 }
      );
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        NOT: { id: session.userId },
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 8,
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error("User search error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to search user" },
      { status: 500 }
    );
  }
}
