-- CreateTable
CREATE TABLE "shared_account_invites" (
    "id" TEXT NOT NULL,
    "shared_account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "SharedAccountRole" NOT NULL DEFAULT 'member',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_account_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_account_invites_token_hash_key" ON "shared_account_invites"("token_hash");

-- CreateIndex
CREATE INDEX "shared_account_invites_email_idx" ON "shared_account_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shared_account_invites_shared_account_id_email_key" ON "shared_account_invites"("shared_account_id", "email");

-- AddForeignKey
ALTER TABLE "shared_account_invites" ADD CONSTRAINT "shared_account_invites_shared_account_id_fkey" FOREIGN KEY ("shared_account_id") REFERENCES "shared_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
