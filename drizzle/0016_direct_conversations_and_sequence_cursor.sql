-- Private messaging extension: direct conversations and transactionally allocated message order.
-- Existing listing conversations and message identities are preserved by in-place backfill.

ALTER TABLE public.conversations RENAME COLUMN buyer_id TO participant_a_id;
--> statement-breakpoint
ALTER TABLE public.conversations RENAME COLUMN buyer_read_at TO participant_a_read_at;
--> statement-breakpoint
ALTER TABLE public.conversations RENAME COLUMN seller_read_at TO participant_b_read_at;
--> statement-breakpoint
ALTER TABLE public.conversations RENAME COLUMN buyer_archived_at TO participant_a_archived_at;
--> statement-breakpoint
ALTER TABLE public.conversations RENAME COLUMN seller_archived_at TO participant_b_archived_at;
--> statement-breakpoint
ALTER TABLE public.conversations RENAME CONSTRAINT conversations_buyer_id_fkey TO conversations_participant_a_id_fkey;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN conversation_type text;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN participant_b_id uuid REFERENCES public.profiles(id) ON DELETE NO ACTION;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN participant_a_read_seq bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN participant_b_read_seq bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN last_message_seq bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.messages ADD COLUMN message_seq bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE public.conversations AS c
SET conversation_type = 'listing',
    participant_b_id = l.seller_id
FROM public.listings AS l
WHERE l.id = c.listing_id;
--> statement-breakpoint
WITH ranked_messages AS (
  SELECT m.id,
         row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC, m.id ASC) AS sequence_number
  FROM public.messages AS m
)
UPDATE public.messages AS m
SET message_seq = ranked_messages.sequence_number
FROM ranked_messages
WHERE ranked_messages.id = m.id;
--> statement-breakpoint
UPDATE public.conversations AS c
SET last_message_seq = COALESCE((
      SELECT MAX(m.message_seq) FROM public.messages AS m WHERE m.conversation_id = c.id
    ), 0),
    participant_a_read_seq = CASE
      WHEN c.participant_a_read_at IS NULL THEN 0
      ELSE COALESCE((
        SELECT MAX(m.message_seq) FROM public.messages AS m
        WHERE m.conversation_id = c.id AND m.created_at < c.participant_a_read_at
      ), 0)
    END,
    participant_b_read_seq = CASE
      WHEN c.participant_b_read_at IS NULL THEN 0
      ELSE COALESCE((
        SELECT MAX(m.message_seq) FROM public.messages AS m
        WHERE m.conversation_id = c.id AND m.created_at < c.participant_b_read_at
      ), 0)
    END;
--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN conversation_type SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN participant_b_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.conversations ALTER COLUMN listing_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT conversations_type_shape_check
  CHECK ((conversation_type = 'listing' AND listing_id IS NOT NULL) OR (conversation_type = 'direct' AND listing_id IS NULL));
--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT conversations_distinct_participants_check
  CHECK (participant_a_id <> participant_b_id);
--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT conversations_direct_pair_order_check
  CHECK (conversation_type <> 'direct' OR participant_a_id < participant_b_id);
--> statement-breakpoint
ALTER TABLE public.conversations ADD CONSTRAINT conversations_read_seq_nonnegative_check
  CHECK (participant_a_read_seq >= 0 AND participant_b_read_seq >= 0 AND last_message_seq >= 0);
--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT messages_message_seq_positive_check CHECK (message_seq > 0);
--> statement-breakpoint
DROP INDEX public.conversations_listing_buyer_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX conversations_listing_participant_a_idx
  ON public.conversations (listing_id, participant_a_id) WHERE conversation_type = 'listing';
--> statement-breakpoint
DROP INDEX public.conversations_buyer_idx;
--> statement-breakpoint
CREATE INDEX conversations_participant_a_idx ON public.conversations (participant_a_id);
--> statement-breakpoint
CREATE INDEX conversations_participant_b_idx ON public.conversations (participant_b_id);
--> statement-breakpoint
CREATE UNIQUE INDEX conversations_direct_pair_unique_idx
  ON public.conversations (participant_a_id, participant_b_id) WHERE conversation_type = 'direct';
--> statement-breakpoint
CREATE UNIQUE INDEX messages_conversation_seq_idx ON public.messages (conversation_id, message_seq);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_conversation_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_seller_id uuid;
  v_status public.listing_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.conversation_type IS NOT DISTINCT FROM OLD.conversation_type
       AND NEW.listing_id IS NOT DISTINCT FROM OLD.listing_id
       AND NEW.participant_a_id IS NOT DISTINCT FROM OLD.participant_a_id
       AND NEW.participant_b_id IS NOT DISTINCT FROM OLD.participant_b_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.participant_a_id = NEW.participant_b_id THEN
    RAISE EXCEPTION 'A conversation must have two distinct participants';
  END IF;

  IF NEW.conversation_type = 'direct' THEN
    IF NEW.listing_id IS NOT NULL OR NEW.participant_a_id >= NEW.participant_b_id THEN
      RAISE EXCEPTION 'Direct conversations require a null listing and an ordered participant pair';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.conversation_type <> 'listing' OR NEW.listing_id IS NULL THEN
    RAISE EXCEPTION 'Conversation context is invalid';
  END IF;

  SELECT l.seller_id, l.status INTO v_seller_id, v_status
  FROM public.listings AS l
  WHERE l.id = NEW.listing_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Listing % does not exist', NEW.listing_id;
  END IF;

  IF v_seller_id <> NEW.participant_b_id THEN
    RAISE EXCEPTION 'Listing conversation participant B must be the Listing seller';
  END IF;

  IF v_seller_id = NEW.participant_a_id THEN
    RAISE EXCEPTION 'Seller % cannot start a conversation on their own listing %', NEW.participant_a_id, NEW.listing_id;
  END IF;

  IF v_status <> 'published'::public.listing_status THEN
    RAISE EXCEPTION 'Conversations can only be started on published listings (listing % is %)', NEW.listing_id, v_status;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_check_conversation_validity ON public.conversations;
--> statement-breakpoint
CREATE TRIGGER trg_check_conversation_validity
BEFORE INSERT OR UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.check_conversation_validity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_message_sender_validity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_participant_a_id uuid;
  v_participant_b_id uuid;
  v_next_seq bigint;
BEGIN
  SELECT c.participant_a_id, c.participant_b_id
    INTO v_participant_a_id, v_participant_b_id
  FROM public.conversations AS c
  WHERE c.id = NEW.conversation_id
  FOR UPDATE;

  IF v_participant_a_id IS NULL THEN
    RAISE EXCEPTION 'Conversation % does not exist', NEW.conversation_id;
  END IF;

  IF NEW.sender_id <> v_participant_a_id AND NEW.sender_id <> v_participant_b_id THEN
    RAISE EXCEPTION 'Sender % is not a participant in conversation %', NEW.sender_id, NEW.conversation_id;
  END IF;

  UPDATE public.conversations AS c
  SET last_message_seq = c.last_message_seq + 1,
      updated_at = now(),
      participant_a_read_seq = CASE WHEN c.participant_a_id = NEW.sender_id THEN c.last_message_seq + 1 ELSE c.participant_a_read_seq END,
      participant_b_read_seq = CASE WHEN c.participant_b_id = NEW.sender_id THEN c.last_message_seq + 1 ELSE c.participant_b_read_seq END,
      participant_a_archived_at = CASE WHEN c.participant_a_id <> NEW.sender_id THEN NULL ELSE c.participant_a_archived_at END,
      participant_b_archived_at = CASE WHEN c.participant_b_id <> NEW.sender_id THEN NULL ELSE c.participant_b_archived_at END
  WHERE c.id = NEW.conversation_id
  RETURNING c.last_message_seq INTO v_next_seq;

  NEW.message_seq := v_next_seq;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_check_message_sender_validity ON public.messages;
--> statement-breakpoint
CREATE TRIGGER trg_check_message_sender_validity
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.check_message_sender_validity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_message_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.message_seq IS DISTINCT FROM OLD.message_seq
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'Message sequence and identity are immutable';
  END IF;
  RETURN NEW;
END;
$;
--> statement-breakpoint
CREATE TRIGGER trg_messages_identity_immutable
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.prevent_message_identity_mutation();
