-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data Migration: migrate existing users.push_token to device_tokens
INSERT INTO "device_tokens" ("id", "user_id", "token", "platform", "last_seen_at", "created_at")
SELECT gen_random_uuid()::text, "id", "push_token", 'unknown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "push_token" IS NOT NULL AND "push_token" <> '';

-- AlterTable: drop push_token from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "push_token";
