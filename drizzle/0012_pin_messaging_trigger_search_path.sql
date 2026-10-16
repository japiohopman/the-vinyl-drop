-- Migration: 0012_pin_messaging_trigger_search_path.sql
-- Pin the private messaging validation triggers to an empty search_path and
-- schema-qualify every relation/type reference without changing trigger semantics.
-- This is source-only until the human-owned staging gate authorizes migration.

CREATE OR REPLACE FUNCTION public.check_conversation_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_seller_id uuid;
  v_status public.listing_status;
BEGIN
  SELECT l.seller_id, l.status
    INTO v_seller_id, v_status
    FROM public.listings AS l
    WHERE l.id = NEW.listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing % does not exist', NEW.listing_id;
  END IF;

  IF v_seller_id = NEW.buyer_id THEN
    RAISE EXCEPTION 'Seller % cannot start a conversation on their own listing %', NEW.buyer_id, NEW.listing_id;
  END IF;

  IF v_status <> 'published'::public.listing_status THEN
    RAISE EXCEPTION 'Conversations can only be started on published listings (listing % is %)', NEW.listing_id, v_status;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_message_sender_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_buyer_id uuid;
  v_seller_id uuid;
BEGIN
  SELECT c.buyer_id, l.seller_id
    INTO v_buyer_id, v_seller_id
    FROM public.conversations AS c
    JOIN public.listings AS l ON l.id = c.listing_id
    WHERE c.id = NEW.conversation_id;

  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'Conversation % does not exist', NEW.conversation_id;
  END IF;

  IF NEW.sender_id <> v_buyer_id AND NEW.sender_id <> v_seller_id THEN
    RAISE EXCEPTION 'Sender % is neither buyer nor seller of conversation %', NEW.sender_id, NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;
