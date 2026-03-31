-- CreateTable
CREATE TABLE "conversation_logs" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_logs_phone_idx" ON "conversation_logs"("phone");

-- CreateIndex
CREATE INDEX "conversation_logs_phone_created_at_idx" ON "conversation_logs"("phone", "created_at");

-- CreateIndex
CREATE INDEX "conversation_logs_created_at_idx" ON "conversation_logs"("created_at");

-- CreateIndex
CREATE INDEX "conversation_logs_intent_idx" ON "conversation_logs"("intent");
