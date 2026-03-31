-- CreateTable
CREATE TABLE "service_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'MX',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_service_zones" (
    "provider_id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,

    CONSTRAINT "provider_service_zones_pkey" PRIMARY KEY ("provider_id","zone_id")
);

-- CreateIndex
CREATE INDEX "service_zones_city_idx" ON "service_zones"("city");

-- CreateIndex
CREATE INDEX "service_zones_state_idx" ON "service_zones"("state");

-- CreateIndex
CREATE UNIQUE INDEX "service_zones_name_city_key" ON "service_zones"("name", "city");

-- AddForeignKey
ALTER TABLE "provider_service_zones" ADD CONSTRAINT "provider_service_zones_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_service_zones" ADD CONSTRAINT "provider_service_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "service_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
