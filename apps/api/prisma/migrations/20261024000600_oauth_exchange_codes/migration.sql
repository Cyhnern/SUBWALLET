-- CreateTable
CREATE TABLE "oauth_exchange_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_exchange_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_exchange_codes_code_key" ON "oauth_exchange_codes"("code");
