-- AlterTable
ALTER TABLE "provider_applications" ADD COLUMN     "acquisition_source" TEXT;

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN     "total_messages" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_activity_at" TIMESTAMP(3);
