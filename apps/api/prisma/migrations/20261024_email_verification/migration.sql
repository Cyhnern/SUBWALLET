-- AlterTable
ALTER TABLE "users" ADD COLUMN "verification_token" TEXT,
ADD COLUMN "verification_token_expires_at" TIMESTAMP(3);
