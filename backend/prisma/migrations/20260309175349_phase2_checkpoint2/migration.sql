-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('NO_SHOW', 'POOR_QUALITY', 'OVERCHARGE', 'DAMAGE', 'THEFT', 'HARASSMENT', 'SAFETY', 'FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ServicePhotoType" AS ENUM ('BEFORE', 'AFTER', 'EVIDENCE');

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'VERIFICATION_IN_PROGRESS';

-- CreateTable
CREATE TABLE "verification_results" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "face_match_score" DOUBLE PRECISION,
    "ine_valid" BOOLEAN,
    "liveness_score" DOUBLE PRECISION,
    "decision" TEXT NOT NULL,
    "raw_response" JSONB,
    "external_id" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "reported_id" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "is_safety" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_photos" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "type" "ServicePhotoType" NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_locations" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sos_alerts" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_results_application_id_idx" ON "verification_results"("application_id");

-- CreateIndex
CREATE INDEX "reports_reported_id_idx" ON "reports"("reported_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_booking_id_idx" ON "reports"("booking_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at");

-- CreateIndex
CREATE INDEX "service_photos_booking_id_idx" ON "service_photos"("booking_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_user_id_idx" ON "emergency_contacts"("user_id");

-- CreateIndex
CREATE INDEX "provider_locations_booking_id_idx" ON "provider_locations"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_locations_provider_id_key" ON "provider_locations"("provider_id");

-- CreateIndex
CREATE INDEX "sos_alerts_booking_id_idx" ON "sos_alerts"("booking_id");

-- CreateIndex
CREATE INDEX "sos_alerts_triggered_by_idx" ON "sos_alerts"("triggered_by");

-- AddForeignKey
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "provider_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_photos" ADD CONSTRAINT "service_photos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_photos" ADD CONSTRAINT "service_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_locations" ADD CONSTRAINT "provider_locations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
