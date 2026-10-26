-- AlterTable: add CHECK constraints
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_price_nonneg" CHECK ("price" >= 0),
  ADD CONSTRAINT "subscriptions_custom_days" CHECK ("billing_cycle" <> 'custom' OR "custom_cycle_days" > 0);

-- Drop old indexes and create composite indexes
DROP INDEX IF EXISTS "subscriptions_next_billing_date_idx";
DROP INDEX IF EXISTS "subscriptions_user_id_status_idx";

CREATE INDEX "subscriptions_user_id_deleted_at_status_idx" ON "subscriptions"("user_id", "deleted_at", "status");
CREATE INDEX "subscriptions_status_next_billing_date_idx" ON "subscriptions"("status", "next_billing_date");
