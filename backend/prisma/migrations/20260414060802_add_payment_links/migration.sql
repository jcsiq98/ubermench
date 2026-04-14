-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYMENT_LINK';

-- CreateTable
CREATE TABLE "payment_links" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "client_name" TEXT,
    "client_phone" TEXT,
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_session_id" TEXT,
    "stripe_payment_url" TEXT,
    "income_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_stripe_session_id_key" ON "payment_links"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_income_id_key" ON "payment_links"("income_id");

-- CreateIndex
CREATE INDEX "payment_links_provider_id_idx" ON "payment_links"("provider_id");

-- CreateIndex
CREATE INDEX "payment_links_stripe_session_id_idx" ON "payment_links"("stripe_session_id");

-- CreateIndex
CREATE INDEX "payment_links_status_idx" ON "payment_links"("status");

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_income_id_fkey" FOREIGN KEY ("income_id") REFERENCES "incomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
