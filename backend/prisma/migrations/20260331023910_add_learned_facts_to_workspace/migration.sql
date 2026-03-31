-- AlterTable
ALTER TABLE "workspace_profiles" ADD COLUMN     "learned_facts" JSONB NOT NULL DEFAULT '[]';
