-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('MANUAL', 'INCOME', 'APPOINTMENT', 'PAYMENT_LINK');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "incomes" ADD COLUMN "contact_id" TEXT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "contact_id" TEXT;

-- AlterTable
ALTER TABLE "payment_links" ADD COLUMN "contact_id" TEXT;

-- CreateIndex
CREATE INDEX "contacts_provider_id_idx" ON "contacts"("provider_id");

-- CreateIndex
CREATE INDEX "contacts_provider_id_name_idx" ON "contacts"("provider_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_provider_id_phone_key" ON "contacts"("provider_id", "phone");

-- CreateIndex
CREATE INDEX "incomes_provider_id_contact_id_idx" ON "incomes"("provider_id", "contact_id");

-- CreateIndex
CREATE INDEX "appointments_provider_id_contact_id_idx" ON "appointments"("provider_id", "contact_id");

-- CreateIndex
CREATE INDEX "payment_links_provider_id_contact_id_idx" ON "payment_links"("provider_id", "contact_id");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
