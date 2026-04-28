import { NextResponse } from "next/server";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    databaseUrlExists: !!process.env.DATABASE_URL,
    databaseUrlLength: process.env.DATABASE_URL?.length ?? 0,
    databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + "...",
  };

  try {
    // Dynamic import to catch initialization errors
    const { prisma } = await import("@/lib/prisma");
    diagnostics.prismaImported = true;

    // Test connection with a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    diagnostics.dbConnected = true;
    diagnostics.queryResult = result;

    return NextResponse.json({
      success: true,
      message: "Database connection successful",
      diagnostics,
    });
  } catch (error) {
    diagnostics.prismaImported = false;
    diagnostics.error = {
      name: (error as Error)?.name,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack?.split("\n").slice(0, 5),
    };

    console.error("[Health] Database connection failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed",
        diagnostics,
      },
      { status: 500 }
    );
  }
}
