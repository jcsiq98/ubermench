-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "client_name" TEXT,
    "client_phone" TEXT,
    "description" TEXT,
    "address" TEXT,
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_provider_id_idx" ON "appointments"("provider_id");

-- CreateIndex
CREATE INDEX "appointments_provider_id_scheduled_at_idx" ON "appointments"("provider_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_scheduled_at_idx" ON "appointments"("scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
