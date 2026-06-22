-- Add FX metadata while preserving Expense.amount as the MXN ledger amount.
ALTER TABLE "expenses"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN "original_amount" DECIMAL(12, 2),
ADD COLUMN "original_currency" TEXT,
ADD COLUMN "exchange_rate" DECIMAL(18, 8),
ADD COLUMN "exchange_rate_provider" TEXT,
ADD COLUMN "exchange_rate_date" TIMESTAMP(3);
