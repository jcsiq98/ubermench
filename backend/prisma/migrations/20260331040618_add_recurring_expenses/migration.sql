-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "description" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "day_of_month" INTEGER DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "next_due_date" TIMESTAMP(3) NOT NULL,
    "last_processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_provider_id_idx" ON "recurring_expenses"("provider_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_is_active_next_due_date_idx" ON "recurring_expenses"("is_active", "next_due_date");

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
