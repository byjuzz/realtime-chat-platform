-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rooms" ADD COLUMN "creatorId" TEXT;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "guest_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
