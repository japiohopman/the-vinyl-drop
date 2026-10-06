CREATE TABLE "physical_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"media_condition" "condition_grade" NOT NULL,
	"sleeve_condition" "condition_grade" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "physical_copies" ADD CONSTRAINT "physical_copies_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "physical_copies" ADD CONSTRAINT "physical_copies_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "physical_copies_release_idx" ON "physical_copies" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "physical_copies_owner_idx" ON "physical_copies" USING btree ("owner_id");--> statement-breakpoint

-- Add nullable physical_copy_id column to listings
ALTER TABLE "listings" ADD COLUMN "physical_copy_id" uuid;--> statement-breakpoint

-- Populate physical_copy_id on listings with a new UUID for each row
UPDATE "listings" SET "physical_copy_id" = gen_random_uuid() WHERE "physical_copy_id" IS NULL;--> statement-breakpoint

-- Create PhysicalCopy records for existing legacy listings using the generated physical_copy_id
INSERT INTO "physical_copies" ("id", "release_id", "owner_id", "media_condition", "sleeve_condition", "created_at", "updated_at")
SELECT "physical_copy_id", "release_id", "seller_id", "media_condition", "sleeve_condition", "created_at", "updated_at"
FROM "listings";--> statement-breakpoint

-- Enforce physical_copy_id non-nullability
ALTER TABLE "listings" ALTER COLUMN "physical_copy_id" SET NOT NULL;--> statement-breakpoint

-- Drop legacy foreign key and index
ALTER TABLE "listings" DROP CONSTRAINT "listings_release_id_releases_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "listings_release_idx";--> statement-breakpoint

-- Drop legacy columns
ALTER TABLE "listings" DROP COLUMN "release_id";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "media_condition";--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN "sleeve_condition";--> statement-breakpoint

-- Add constraints and indexes on listings
ALTER TABLE "listings" ADD CONSTRAINT "listings_physical_copy_id_physical_copies_id_fk" FOREIGN KEY ("physical_copy_id") REFERENCES "public"."physical_copies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_check" CHECK ("price" IS NULL OR "price" >= 0);--> statement-breakpoint
CREATE INDEX "listings_physical_copy_idx" ON "listings" USING btree ("physical_copy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_active_physical_copy_idx" ON "listings" USING btree ("physical_copy_id") WHERE "status" IN ('published', 'reserved');
