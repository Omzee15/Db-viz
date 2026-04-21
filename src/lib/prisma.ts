import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  
  console.log("[Prisma] Initializing client...");
  console.log("[Prisma] DATABASE_URL exists:", !!connectionString);
  console.log("[Prisma] DATABASE_URL length:", connectionString?.length ?? 0);
  console.log("[Prisma] NODE_ENV:", process.env.NODE_ENV);
  
  if (!connectionString) {
    console.error("[Prisma] ERROR: DATABASE_URL is not set!");
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  try {
    const adapter = new PrismaNeon({ connectionString });
    console.log("[Prisma] Adapter created successfully");
    
    const client = new PrismaClient({
      adapter,
      log: ["query", "error", "warn"],
    });
    console.log("[Prisma] Client created successfully");
    return client;
  } catch (error) {
    console.error("[Prisma] ERROR creating client:", error);
    throw error;
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
