import { z } from 'zod';
import { CONDITION_GRADES, LISTING_STATUSES } from '../db/schema/enums';

export const conditionGradeSchema = z.enum(CONDITION_GRADES, {
  errorMap: () => ({
    message: 'Invalid condition grade. Must be one of: M, NM, VG+, VG, VG-, G+, G, F, P',
  }),
});

export const listingStatusSchema = z.enum(LISTING_STATUSES, {
  errorMap: () => ({
    message: 'Invalid listing status. Must be one of: draft, published, reserved, sold, traded, archived',
  }),
});

export const conditionDescriptions: Record<(typeof CONDITION_GRADES)[number], string> = {
  M: 'Mint (M) - Perfect, unplayed condition.',
  NM: 'Near Mint (NM) - Nearly perfect with no obvious defects.',
  'VG+': 'Very Good Plus (VG+) - Slight signs of wear or minor surface scuffs.',
  VG: 'Very Good (VG) - Visible scuffs or light scratches that do not dominate listening.',
  'VG-': 'Very Good Minus (VG-) - Significant wear or surface noise present.',
  'G+': 'Good Plus (G+) - Plays through without skipping but has significant noise/wear.',
  G: 'Good (G) - Playable without skipping, with noticeable wear and noise.',
  F: 'Fair (F) - Heavy wear, potential skippage or severe noise.',
  P: 'Poor (P) - Unplayable or heavily damaged.',
};
