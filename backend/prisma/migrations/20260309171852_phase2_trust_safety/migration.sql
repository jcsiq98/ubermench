-- AlterTable
ALTER TABLE "provider_applications" ADD COLUMN     "approved_tier" INTEGER,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "saved_addresses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_scores" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "last_calculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_score_history" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "previous_score" DOUBLE PRECISION NOT NULL,
    "new_score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_addresses_user_id_idx" ON "saved_addresses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_scores_provider_id_key" ON "trust_scores"("provider_id");

-- CreateIndex
CREATE INDEX "trust_scores_score_idx" ON "trust_scores"("score");

-- CreateIndex
CREATE INDEX "trust_score_history_provider_id_idx" ON "trust_score_history"("provider_id");

-- CreateIndex
CREATE INDEX "trust_score_history_created_at_idx" ON "trust_score_history"("created_at");

-- CreateIndex
CREATE INDEX "bookings_customer_id_status_idx" ON "bookings"("customer_id", "status");

-- CreateIndex
CREATE INDEX "bookings_provider_id_status_idx" ON "bookings"("provider_id", "status");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "provider_applications_verification_status_idx" ON "provider_applications"("verification_status");

-- CreateIndex
CREATE INDEX "provider_applications_phone_idx" ON "provider_applications"("phone");

-- CreateIndex
CREATE INDEX "provider_profiles_tier_idx" ON "provider_profiles"("tier");

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
