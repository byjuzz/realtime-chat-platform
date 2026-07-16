import { PrismaClient } from "@prisma/client";

/**
 * Singleton de PrismaClient. Necesario porque `tsx watch` recarga módulos
 * en caliente en desarrollo — sin cachear la instancia en globalThis se
 * abriría un PrismaClient nuevo (y una conexión nueva) en cada guardado.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export async function isDatabaseReady(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
