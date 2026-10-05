import { pgEnum } from 'drizzle-orm/pg-core';

export const CONDITION_GRADES = ['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const LISTING_STATUSES = ['draft', 'published', 'reserved', 'sold', 'traded', 'archived'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const conditionGradeEnum = pgEnum('condition_grade', CONDITION_GRADES);
export const listingStatusEnum = pgEnum('listing_status', LISTING_STATUSES);
