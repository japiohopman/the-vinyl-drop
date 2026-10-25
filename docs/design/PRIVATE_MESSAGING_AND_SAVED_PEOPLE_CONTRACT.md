# Private Messaging and Saved People — Contract

**Status:** Draft for owner review  
**Governing issue:** [#203 — direct conversations and Saved People](https://github.com/japiohopman/the-vinyl-drop/issues/203)  
**Downstream work:** [#204 — direct conversations](https://github.com/japiohopman/the-vinyl-drop/issues/204), [#205 — Saved People](https://github.com/japiohopman/the-vinyl-drop/issues/205)  
**Related constraints:** [#51 — transaction coordination](https://github.com/japiohopman/the-vinyl-drop/issues/51), [#89 — messaging abuse/rate-limit reassessment](https://github.com/japiohopman/the-vinyl-drop/issues/89), [#207 — shared desktop/mobile chat UI](https://github.com/japiohopman/the-vinyl-drop/issues/207)

This is a product/data/security contract only. It does not authorize application implementation, a database migration, staging data changes, deployment, a feature-flag change, or rollout. The current runtime decision remains `MESSAGING_ENABLED=false`.

## 1. Product decisions

1. **Listing conversation:** remains a private conversation about one concrete Listing. It is not a generic user chat or a transaction state machine.
2. **Direct conversation:** connects two distinct users without a Listing. A profile's Message action creates or reuses the single direct thread for that unordered user pair; no fake Listing is created.
3. **Saved People:** a private, owner-controlled list of profiles to find again. This is not Follow. Saving/removing a person does not notify them, publish a follower count, or create/change a conversation.
4. **Follow and social feed:** excluded. Public follow graphs, follower counts, new-drop notifications and feed behavior require a separate approved use case.
5. **Transaction coordination:** buy/trade intents remain anchored to a Listing conversation. A direct conversation must not be used as a substitute Listing or as a transaction anchor. Reconcile #51 against this contract before implementation.
6. **Release:** all routes remain authenticated and behind the existing fail-closed `MESSAGING_ENABLED` guard. Source code, CI success, or a staging deployment does not authorize enabling messaging.

## 2. Conversation data model

Keep one `conversations` table and one `messages` table. Do not introduce a second messaging subsystem.

### Conversation fields and invariants

The target model has:

- `conversation_type`: exactly `listing` or `direct`, enforced by a database constraint.
- `participant_a_id` and `participant_b_id`: non-null foreign keys to `profiles.id`. These are the authorization source for both conversation types.
- `listing_id`: non-null for `listing`; NULL for `direct`.
- Per-participant `read_at` timestamps retained for compatibility/audit, `last_read_message_seq` watermarks used for authoritative unread state, and per-participant `archived_at` timestamps. A read cursor identifies messages by sequence rather than a wall-clock timestamp alone.

For a **listing** conversation, A is the existing buyer and B is the Listing's seller. The row must reference that real Listing; the seller must match the Listing owner and must not be the buyer. Preserve the existing published-Listing check when a new listing conversation is created, and preserve the existing per-`(listing, buyer)` uniqueness rule.

For a **direct** conversation, `listing_id` must be NULL and the participants must be distinct. Normalize the pair in deterministic order (A = lower UUID, B = higher UUID), and enforce that order with a database CHECK constraint equivalent to `conversation_type <> 'direct' OR participant_a_id < participant_b_id`. Enforce uniqueness with a partial unique index on `(participant_a_id, participant_b_id)` where `conversation_type = 'direct'`. This database-level ordering check means an alternate write path cannot insert the reversed pair; application ordering alone is insufficient. Repeated or concurrent starts from either direction must return the same conversation ID.

Conversation identity/context (type, participant IDs, Listing ID) must not be mutable after creation. Validate the legal shapes with CHECK constraints where possible and a trigger where validation requires looking up the Listing seller. A CHECK constraint alone cannot enforce a cross-table seller relationship.

### Message integrity and authorization

- A message sender must be one of the two stored participants for either type. The database trigger remains a second line of defense; the authenticated server service must also authorize the participant before read, send, mark-read or archive operations.
- For listing conversations, retain the current listing-specific invariants and regression coverage. Do not relax the existing seller/buyer checks to make direct messages work.
- For direct conversations, validate both participants without joining through a fabricated or required Listing.
- Keep the trigger functions pinned to an empty `search_path`, schema-qualify referenced database objects, and avoid security-definer or grant changes unless separately reviewed.
- Keep the 4,000-character non-empty message-body limit. Assign every message a database-enforced, monotonically increasing per-conversation `message_seq` under a transaction that locks the conversation row, with uniqueness on `(conversation_id, message_seq)`. Use `message_seq` as the authoritative order and read-cursor tie-breaker; backfill existing messages in their current `(created_at, id)` order so historical ordering is preserved. Serialize sequence allocation and read-cursor advancement per conversation.
- Never return message content to a non-participant. Continue non-enumerating 404 behavior for a third party attempting to read or mutate a thread.

## 3. Inbox, read and archive semantics

The inbox model must carry `conversation_type` and optional Listing/release context. Listing conversations show the actual Listing/release context. Direct conversations show the other participant and must not render fabricated Listing/release details. Shared clients, including the desktop widget and the future fixed mobile panel (#207), must treat Listing/release metadata as optional.

Read and archive state is independent for each participant and each conversation:

- Archiving hides the thread only from the archiving participant; it does not delete messages or change the other participant's state.
- Explicit mark-read advances only the current participant's `last_read_message_seq` to the last message explicitly acknowledged as read. The server validates that the sequence belongs to the conversation and cannot move the cursor backwards. `read_at` records the wall-clock action time for compatibility/audit; it is not the authoritative unread cutoff. Opening, closing, minimizing or restoring a chat panel must not silently change read/archive state.
- Unread totals count only incoming messages with `message_seq` greater than that participant's cursor; a sender's own messages are not unread for that sender. A concurrent message not included in the mark-read action must retain a higher sequence and remain unread. Tests must cover equal timestamps, concurrent send/mark-read, cursor boundaries and monotonic cursor updates.
- Sending a message updates the thread's activity time, marks the sender's outgoing message as read for the sender, and clears the recipient's archive state so the new message reappears in their inbox.
- Reopening an archived thread from a participant's own profile action clears only that caller's archive state. It must not change the other participant's state.
- These rules apply to both conversation types; existing listing-specific behavior must remain intact.

## 4. Notification event contract

The current shared `NotificationEvent` requires `listingId`, which is not valid for direct conversations. Update the type as a discriminated event contract when #204 is implemented:

- Listing-related events such as `comment.created` and `favorite.created` continue to require a Listing ID.
- `message.created` is a discriminated event contract: `conversationType: 'listing'` requires the actual `listingId`, while `conversationType: 'direct'` must omit `listingId`. Both variants identify actor, recipient, conversation ID, message ID, creation time and conversation type. Direct events must never use a fabricated Listing ID, and Listing events must never omit real Listing context.
- Never include the message body in notification events or logs. Deliver the event only to the other participant and reject self-messaging.

## 5. Saved People data and privacy (#205)

Use a separate `saved_people` relation with:

- `owner_user_id` and `saved_user_id`, both referencing `profiles.id`;
- `created_at` with a server/database default;
- a unique constraint on `(owner_user_id, saved_user_id)`;
- a CHECK constraint prohibiting `owner_user_id = saved_user_id`.

Saving/removing must be idempotent and performed through authenticated server-side services. The list is returned only to its owner: do not expose a public profile's saved-by list, a follower count, or an endpoint that lets another user enumerate a person's contacts. Save/remove must not send notifications or mutate conversations, messages, read state or archive state.

Because a saved relationship is disposable user preference—not audit or transaction history—both foreign keys should use explicit `ON DELETE CASCADE` behavior so deleting either profile removes the relationship row. Test both cases.

Keep the table on the server-side data path. Enable RLS, revoke direct Data API table access from `PUBLIC`, `anon` and `authenticated`, and verify effective grants. Do not introduce client-side Supabase access to `saved_people`, `conversations` or `messages`.

## 6. Abuse controls and release boundary

The current code has no shared rate-limit store, and [#89](https://github.com/japiohopman/the-vinyl-drop/issues/89) explicitly says numeric limits and the store/proxy strategy have not been approved. Therefore this contract invents **no numeric rate limits**.

Before any runtime enablement of private messaging, #89 must be explicitly reassessed to approve the covered routes, first-contact/message thresholds, counter-store approach, Render proxy/IP behavior and failure behavior. Limits must protect both first-contact creation and repeated first messages across different recipient pairs; pair uniqueness alone is not a rate limiter. Do not trust arbitrary client-supplied forwarded-IP headers.

The existing contact path and manual review can be a controlled-pilot reporting procedure only if the owner explicitly approves it under #89. This does not count as a complete in-app moderation system. Before a wider cohort or public enablement, require a separately reviewed block/report capability and an accountable report-triage process. At minimum, a block must prevent new direct-thread initiation and further sends between the pair; report records must be private and accessible only to authorized reviewers, and should reference the conversation without copying message bodies by default. Before broad rollout, explicitly decide whether blocks also prevent messaging in Listing-bound conversations; do not silently change that marketplace behavior in #204.

No rate threshold, block/report implementation, or rollout approval is granted by this document. Keep `MESSAGING_ENABLED=false` until the separate release decision is recorded.

## 7. Migration, compatibility and rollback

The source journal currently ends at migration `0015`; re-check the journal when implementation starts and use the next append-only migration number then. Never rewrite an applied migration.

The initial schema change must preserve all existing listing conversations, messages, IDs and timestamps, and preserve each participant's current read/archive state exactly. Backfill each conversation's `message_seq` in the existing `(created_at, id)` order, preserving historical message order. Preserve each legacy `read_at` and `archived_at` value exactly; initialize the new read cursor to the highest sequence whose message has `created_at < legacy read_at`. The existing unread query treats messages with `created_at >= read_at` as unread, so equal-timestamp messages must remain unread after backfill; a NULL legacy `read_at` remains an unset cursor/all incoming messages unread. Verify the per-message unread classification before and after backfill. Use an expand/backfill/compatibility path rather than immediately dropping legacy columns, validate the backfill, then introduce constraints/indexes/triggers. If a migration renames fields in place, prove rollback compatibility and specify a safe forward-fix path; do not assume a destructive down migration is safe.

Keep `MESSAGING_ENABLED=false` throughout migration and rollout verification. Do not run a live migration, change flags, or mutate staging data from CI. A human-controlled staging migration/verification needs separate explicit authorization and exact target confirmation.

## 8. Required verification

### Isolated CI/migration tests

- Backfill an existing listing conversation and verify the buyer/seller mapping and all four legacy read/archive timestamps survive unchanged, historical messages retain their `(created_at, id)` order through `message_seq`, and per-message unread classification is preserved—including same-timestamp and NULL-read-watermark cases.
- Test monotonic per-conversation message-sequence allocation under concurrent sends and a concurrent send/mark-read race; an unseen message must remain beyond the read cursor and count as unread.
- Reject illegal conversation shapes: listing without Listing, direct with a Listing, self-conversation, wrong listing seller, and duplicate direct pairs in both participant orders.
- Race concurrent direct-thread creation from both directions and assert exactly one row/thread ID.
- Test sender authorization in the database trigger for both types, third-party HTTP 404 behavior, CSRF/same-origin checks for mutations, authentication and disabled-feature guard behavior (including zero messaging-table queries while disabled).
- Preserve existing listing tests for published/draft eligibility, buyer/seller flow, listing uniqueness, archived-thread reopening and notifications.
- Test direct and listing inbox rendering, optional Listing/release context, participant-scoped unread totals, explicit read state, independent archive state, and recipient unarchive on a new message.
- Test Saved People duplicate/idempotent requests, self-link rejection, owner-only reads, invalid/missing profile handling, cascades on either profile deletion, and no conversation/message/notification side effects.
- Verify RLS and effective Data API grants for the new table and existing private messaging tables. Local PGlite tests alone do not prove live Supabase grants.

### Release evidence

Require lint, typecheck, full tests, database migration verification, build and Phase Safety Gate on the final code PR head. After separate human approval, verify the intended staging schema, trigger definitions and effective grants with read-only checks. CI results are not evidence that staging was migrated. Runtime feature activation is a separate owner-controlled decision.

## 9. Dependencies and non-goals

- #204 implements direct-thread creation and messaging only after this contract is accepted.
- #205 implements Saved People after #203 and after #204 provides a real direct thread.
- #51 remains Listing-anchored and must be reconciled before transaction implementation.
- #207 should consume the shared typed conversation view model, with optional Listing/release context for direct threads.
- No payment/checkout/escrow, public Follow, follower feed, push/email notification delivery, new realtime service, moderation dashboard, schema migration, deployment, live data change, or feature-flag activation is included here.

## Source review basis

Reviewed the current main-branch schema and implementation in `src/db/schema/conversations.ts`, `src/db/schema/messages.ts`, `src/app/repositories/messagingRepository.ts`, `src/app/services/messagingService.ts`, `src/app/controllers/messagingController.ts`, `src/app/services/notificationHooks.ts`, migrations `0008`, `0010` and `0012`, and the existing `test/messaging.test.ts`. The review confirmed that current conversations require `listing_id`, store only `buyer_id`, derive the seller through the Listing, use role-specific read/archive state, and emit message events with a required Listing ID. The inbox currently orders messages by `(created_at, id)` while unread queries compare timestamps only, which motivates the explicit sequence/read-cursor contract above. These assumptions need to change together; changing only the profile CTA would be incorrect.
