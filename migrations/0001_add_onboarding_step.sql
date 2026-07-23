-- Add onboarding_step column to tenants table
-- Tracks the highest onboarding step the owner has completed server-side,
-- so progress survives browser/storage clears and cross-device use.
-- 0 = not started, 1 = business details saved

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "onboarding_step" integer NOT NULL DEFAULT 0;

-- Migrate existing tenants: any tenant that already exists has presumably
-- completed business details, so advance them to step 1 so they don't
-- see Step 0 again.
UPDATE "tenants" SET "onboarding_step" = 1 WHERE "onboarding_step" = 0;
