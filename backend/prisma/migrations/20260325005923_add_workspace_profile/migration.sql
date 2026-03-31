-- CreateTable
CREATE TABLE "workspace_profiles" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "services" JSONB NOT NULL DEFAULT '[]',
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "auto_reply" JSONB NOT NULL DEFAULT '{"enabled":false,"message":""}',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_profiles_provider_id_key" ON "workspace_profiles"("provider_id");

-- CreateIndex
CREATE INDEX "workspace_profiles_provider_id_idx" ON "workspace_profiles"("provider_id");

-- AddForeignKey
ALTER TABLE "workspace_profiles" ADD CONSTRAINT "workspace_profiles_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
