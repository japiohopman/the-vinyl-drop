import { ListingStatus } from '../db/schema/enums';

export class InvalidLifecycleTransitionError extends Error {
  public readonly currentStatus: ListingStatus;
  public readonly targetStatus: ListingStatus;

  constructor(currentStatus: ListingStatus, targetStatus: ListingStatus, reason?: string) {
    const detail = reason ? `: ${reason}` : '';
    super(`Cannot transition listing from status '${currentStatus}' to '${targetStatus}'${detail}`);
    this.name = 'InvalidLifecycleTransitionError';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

/**
 * Terminal listing statuses that cannot undergo further field updates or status transitions.
 */
export const TERMINAL_LISTING_STATUSES: readonly ListingStatus[] = ['sold', 'traded', 'archived'] as const;

export function isTerminalListingStatus(status: ListingStatus): boolean {
  return TERMINAL_LISTING_STATUSES.includes(status);
}

/**
 * Explicit state transition map for listing lifecycle states.
 * Note: 'archived', 'sold', and 'traded' are terminal states to prevent recycling or modifying completed offers.
 */
export const LISTING_TRANSITION_MAP: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['published', 'archived'],
  published: ['reserved', 'sold', 'traded', 'draft', 'archived'],
  reserved: ['sold', 'traded', 'published', 'archived'],
  sold: [],
  traded: [],
  archived: [],
} as const;

/**
 * Returns list of allowed target statuses from current listing status.
 */
export function getAllowedNextStatuses(currentStatus: ListingStatus): readonly ListingStatus[] {
  return LISTING_TRANSITION_MAP[currentStatus] || [];
}

/**
 * Checks whether transitioning from `currentStatus` to `targetStatus` is structurally allowed.
 */
export function canTransitionListingStatus(currentStatus: ListingStatus, targetStatus: ListingStatus): boolean {
  if (currentStatus === targetStatus) {
    return true; // No-op transition is permitted
  }
  const allowed = LISTING_TRANSITION_MAP[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Validates a status transition and resulting state invariants.
 * Validates terminal immutability, structural transition rules, and business state invariants.
 * Throws InvalidLifecycleTransitionError if transition or target state is invalid.
 */
export function validateListingTransition(params: {
  currentStatus: ListingStatus;
  targetStatus: ListingStatus;
  price?: number | null;
  tradeAvailable?: boolean;
}): void {
  const { currentStatus, targetStatus, price, tradeAvailable } = params;

  // Terminal listings are immutable and cannot undergo field updates or status transitions
  if (isTerminalListingStatus(currentStatus)) {
    throw new InvalidLifecycleTransitionError(
      currentStatus,
      targetStatus,
      `Listing in terminal state '${currentStatus}' is immutable and cannot be updated.`
    );
  }

  if (currentStatus !== targetStatus && !canTransitionListingStatus(currentStatus, targetStatus)) {
    throw new InvalidLifecycleTransitionError(
      currentStatus,
      targetStatus,
      `Direct transition from '${currentStatus}' to '${targetStatus}' is not permitted.`
    );
  }

  // Business invariant checks for the target resulting state
  if (targetStatus === 'published') {
    const hasPrice = price !== null && price !== undefined && price > 0;
    const isTrade = tradeAvailable === true;
    if (!hasPrice && !isTrade) {
      throw new InvalidLifecycleTransitionError(
        currentStatus,
        targetStatus,
        'Listing must have a price greater than 0 or trade availability enabled when published.'
      );
    }
  }

  if (targetStatus === 'traded' && tradeAvailable !== true) {
    throw new InvalidLifecycleTransitionError(
      currentStatus,
      targetStatus,
      "Listing cannot be in 'traded' status when trade availability is disabled."
    );
  }
}
