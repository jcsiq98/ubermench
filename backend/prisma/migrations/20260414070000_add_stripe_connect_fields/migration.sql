-- CreateEnum
CREATE TYPE "StripeOnboardingStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'RESTRICTED');

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN "stripe_account_id" TEXT,
ADD COLUMN "stripe_onboarding_status" "StripeOnboardingStatus" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_stripe_account_id_key" ON "provider_profiles"("stripe_account_id");
