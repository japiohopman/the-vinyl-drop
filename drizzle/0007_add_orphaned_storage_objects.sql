CREATE TABLE IF NOT EXISTS "orphaned_storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid REFERENCES "public"."listings"("id") ON DELETE cascade,
	"photo_id" uuid,
	"storage_path" text NOT NULL,
	"reason" text NOT NULL,
	"error_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
