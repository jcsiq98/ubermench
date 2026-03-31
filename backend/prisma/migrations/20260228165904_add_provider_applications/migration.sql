-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'DOCS_SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "provider_applications" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "bio" TEXT,
    "years_experience" INTEGER NOT NULL DEFAULT 0,
    "categories" TEXT[],
    "service_zones" TEXT[],
    "ine_photo_front" TEXT,
    "ine_photo_back" TEXT,
    "selfie_photo" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_notes" TEXT,
    "onboarding_step" TEXT NOT NULL DEFAULT 'WELCOME',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_applications_phone_key" ON "provider_applications"("phone");
