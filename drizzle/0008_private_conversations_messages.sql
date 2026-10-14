CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL REFERENCES "listings"("id") ON DELETE NO ACTION,
  "buyer_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE NO ACTION,
  "buyer_read_at" timestamp with time zone,
  "seller_read_at" timestamp with time zone,
  "buyer_archived_at" timestamp with time zone,
  "seller_archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_listing_buyer_idx" ON "conversations" ("listing_id", "buyer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_listing_idx" ON "conversations" ("listing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_buyer_idx" ON "conversations" ("buyer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_updated_at_idx" ON "conversations" ("updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE NO ACTION,
  "sender_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE NO ACTION,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messages_body_length_check" CHECK (length(trim("body")) > 0 AND length("body") <= 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_id_idx" ON "messages" ("conversation_id", "created_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_sender_idx" ON "messages" ("sender_id");
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "conversations" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "messages" FROM anon, authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_conversation_validity()
RETURNS trigger AS $$
DECLARE
  v_seller_id uuid;
  v_status listing_status;
BEGIN
  SELECT seller_id, status INTO v_seller_id, v_status
  FROM listings
  WHERE id = NEW.listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing % does not exist', NEW.listing_id;
  END IF;

  IF v_seller_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'Seller % cannot start a conversation on their own listing %', NEW.buyer_id, NEW.listing_id;
  END IF;

  IF v_status <> 'published'::listing_status THEN
    RAISE EXCEPTION 'Conversations can only be started on published listings (listing % is %)', NEW.listing_id, v_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_check_conversation_validity ON "conversations";
--> statement-breakpoint
CREATE TRIGGER trg_check_conversation_validity
BEFORE INSERT ON "conversations"
FOR EACH ROW EXECUTE FUNCTION check_conversation_validity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_message_sender_validity()
RETURNS trigger AS $$
DECLARE
  v_buyer_id uuid;
  v_seller_id uuid;
BEGIN
  SELECT c.buyer_id, l.seller_id INTO v_buyer_id, v_seller_id
  FROM conversations c
  JOIN listings l ON l.id = c.listing_id
  WHERE c.id = NEW.conversation_id;

  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Conversation % does not exist', NEW.conversation_id;
  END IF;

  IF NEW.sender_id <> v_buyer_id AND NEW.sender_id <> v_seller_id THEN
    RAISE EXCEPTION 'Sender % is neither buyer nor seller of conversation %', NEW.sender_id, NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_check_message_sender_validity ON "messages";
--> statement-breakpoint
CREATE TRIGGER trg_check_message_sender_validity
BEFORE INSERT ON "messages"
FOR EACH ROW EXECUTE FUNCTION check_message_sender_validity();
