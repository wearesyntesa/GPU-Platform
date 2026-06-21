ALTER TABLE "users" RENAME COLUMN "username" TO "full_name";--> statement-breakpoint
UPDATE "users"
SET "email" = lower(
  COALESCE(
    NULLIF(trim("email"), ''),
    regexp_replace(lower(trim("full_name")), '[^a-z0-9._%+-]+', '.', 'g') || '@syntesa.net'
  )
);--> statement-breakpoint
DELETE FROM "user_sessions";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
