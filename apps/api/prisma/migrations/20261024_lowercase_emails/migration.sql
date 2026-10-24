-- Lowercase all user emails for normalization
UPDATE "users" SET "email" = LOWER("email");
