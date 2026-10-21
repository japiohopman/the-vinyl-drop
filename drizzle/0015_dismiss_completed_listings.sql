ALTER TABLE "listings"
  ADD COLUMN "dismissed_at" timestamptz;

CREATE INDEX "listings_seller_dismissed_idx"
  ON "listings" USING btree ("seller_id", "dismissed_at");
