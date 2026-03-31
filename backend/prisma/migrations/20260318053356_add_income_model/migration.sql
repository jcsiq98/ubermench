-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "client_name" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incomes_provider_id_idx" ON "incomes"("provider_id");

-- CreateIndex
CREATE INDEX "incomes_provider_id_date_idx" ON "incomes"("provider_id", "date");

-- CreateIndex
CREATE INDEX "incomes_date_idx" ON "incomes"("date");

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
