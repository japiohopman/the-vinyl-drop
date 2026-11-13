CREATE TYPE "public"."release_content_type" AS ENUM('music', 'non_music');--> statement-breakpoint
CREATE TYPE "public"."special_pressing_characteristic" AS ENUM(
  'picture_disc',
  'solid_colour',
  'translucent',
  'multi_colour',
  'splatter',
  'marble',
  'glitter',
  'glow_in_the_dark',
  'metallic',
  'shaped'
);--> statement-breakpoint
ALTER TABLE "releases"
  ADD COLUMN "content_type" "release_content_type" DEFAULT 'music' NOT NULL;--> statement-breakpoint
ALTER TABLE "physical_copies"
  ADD COLUMN "special_pressing" boolean DEFAULT false NOT NULL,
  ADD COLUMN "special_pressing_characteristics" "special_pressing_characteristic"[] DEFAULT '{}'::"special_pressing_characteristic"[] NOT NULL,
  ADD COLUMN "special_pressing_details" text;--> statement-breakpoint
ALTER TABLE "physical_copies"
  ADD CONSTRAINT "physical_copies_special_pressing_check"
  CHECK (
    (
      "special_pressing" = false
      AND cardinality("special_pressing_characteristics") = 0
      AND "special_pressing_details" IS NULL
    )
    OR (
      "special_pressing" = true
      AND cardinality("special_pressing_characteristics") > 0
    )
  );--> statement-breakpoint
COMMENT ON COLUMN "releases"."content_type" IS
  'Seller-confirmed content classification for the shared release; defaults to music and may be non-music.';--> statement-breakpoint
COMMENT ON COLUMN "physical_copies"."special_pressing" IS
  'Seller-confirmed special pressing marker for this physical copy only.';--> statement-breakpoint
COMMENT ON COLUMN "physical_copies"."special_pressing_characteristics" IS
  'Controlled characteristics selected for this physical copy; shaped denotes any non-standard record silhouette.';--> statement-breakpoint
COMMENT ON COLUMN "physical_copies"."special_pressing_details" IS
  'Optional seller-authored public description of this copy''s special pressing, up to 1000 characters at application validation.';
