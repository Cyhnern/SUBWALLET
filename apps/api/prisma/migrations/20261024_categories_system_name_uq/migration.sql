-- CreateUniqueIndex
CREATE UNIQUE INDEX "categories_system_name_uq" ON "categories" ("name") WHERE "is_system";
