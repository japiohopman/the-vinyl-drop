import { pgEnum } from 'drizzle-orm/pg-core';

export const CONDITION_GRADES = ['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P'] as const;
export type ConditionGrade = (typeof CONDITION_GRADES)[number];

export const LISTING_STATUSES = ['draft', 'published', 'reserved', 'sold', 'traded', 'archived'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const conditionGradeEnum = pgEnum('condition_grade', CONDITION_GRADES);
export const listingStatusEnum = pgEnum('listing_status', LISTING_STATUSES);

export const RELEASE_CONTENT_TYPES = ['music', 'non_music'] as const;
export type ReleaseContentType = (typeof RELEASE_CONTENT_TYPES)[number];
export const releaseContentTypeEnum = pgEnum('release_content_type', RELEASE_CONTENT_TYPES);

export const SPECIAL_PRESSING_CHARACTERISTICS = [
  'picture_disc', 'solid_colour', 'translucent', 'multi_colour', 'splatter',
  'marble', 'glitter', 'glow_in_the_dark', 'metallic', 'shaped',
] as const;
export type SpecialPressingCharacteristic = (typeof SPECIAL_PRESSING_CHARACTERISTICS)[number];
export const specialPressingCharacteristicEnum = pgEnum('special_pressing_characteristic', SPECIAL_PRESSING_CHARACTERISTICS);
