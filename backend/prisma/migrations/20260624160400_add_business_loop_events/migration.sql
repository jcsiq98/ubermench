-- Business loop attribution (A3): delegated reactivation/collection outcomes.

CREATE TYPE "BusinessLoopType" AS ENUM ('REACTIVATION', 'COLLECTION');

CREATE TYPE "BusinessLoopStatus" AS ENUM ('PROPOSED', 'SENT', 'CONVERTED');

CREATE TABLE "business_loop_events" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "client_name" TEXT,
  "type" "BusinessLoopType" NOT NULL,
  "status" "BusinessLoopStatus" NOT NULL DEFAULT 'PROPOSED',
  "message" TEXT NOT NULL,
  "source_payment_link_id" TEXT,
  "source_appointment_id" TEXT,
  "source_income_id" TEXT,
  "amount" DECIMAL(12, 2),
  "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "converted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "business_loop_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_loop_events_provider_id_type_status_idx"
  ON "business_loop_events"("provider_id", "type", "status");

CREATE INDEX "business_loop_events_provider_id_created_at_idx"
  ON "business_loop_events"("provider_id", "created_at");

CREATE INDEX "business_loop_events_provider_id_contact_id_idx"
  ON "business_loop_events"("provider_id", "contact_id");

CREATE INDEX "business_loop_events_source_payment_link_id_idx"
  ON "business_loop_events"("source_payment_link_id");

ALTER TABLE "business_loop_events"
  ADD CONSTRAINT "business_loop_events_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_loop_events"
  ADD CONSTRAINT "business_loop_events_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_loop_events"
  ADD CONSTRAINT "business_loop_events_source_payment_link_id_fkey"
  FOREIGN KEY ("source_payment_link_id") REFERENCES "payment_links"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_loop_events"
  ADD CONSTRAINT "business_loop_events_source_appointment_id_fkey"
  FOREIGN KEY ("source_appointment_id") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_loop_events"
  ADD CONSTRAINT "business_loop_events_source_income_id_fkey"
  FOREIGN KEY ("source_income_id") REFERENCES "incomes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
