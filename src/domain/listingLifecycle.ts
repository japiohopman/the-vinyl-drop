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
 * Explicit state transition map for listing lifecycle states.
 */
export const LISTING_TRANSITION_MAP: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['published', 'archived'],
  published: ['reserved', 'sold', 'traded', 'draft', 'archived'],
  reserved: ['sold', 'traded', 'published', 'archived'],
  sold: ['archived'],
  traded: ['archived'],
  archived: ['draft'],
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
 * Validates a status transition against both structural state machine rules and business invariants.
 * Throws InvalidLifecycleTransitionError if transition is invalid.
 */
export function validateListingTransition(params: {
  currentStatus: ListingStatus;
  targetStatus: ListingStatus;
  price?: number | null;
  tradeAvailable?: boolean;
}): void {
  const { currentStatus, targetStatus, price, tradeAvailable } = params;

  if (currentStatus === targetStatus) {
    return;
  }

  if (!canTransitionListingStatus(currentStatus, targetStatus)) {
    throw new InvalidLifecycleTransitionError(
      currentStatus,
      targetStatus,
      `Direct transition from '${currentStatus}' to '${targetStatus}' is not permitted.`
    );
  }

  // Business invariant checks for specific target statuses
  if (targetStatus === 'published') {
    const hasPrice = price !== null && price !== undefined && price > 0;
    const isTrade = tradeAvailable === true;
    if (!hasPrice && !isTrade) {
      throw new InvalidLifecycleTransitionError(
        currentStatus,
        targetStatus,
        'Listing must have a price greater than 0 or trade availability enabled before publishing.'
      );
    }
  }

  if (targetStatus === 'traded' && tradeAvailable !== true) {
    throw new InvalidLifecycleTransitionError(
      currentStatus,
      targetStatus,
      "Listing cannot be transitioned to 'traded' when trade availability is disabled."
    );
  }
}
