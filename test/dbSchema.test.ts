import { getTableColumns, getTableName } from 'drizzle-orm';
import { getDb } from '../src/db';
import {
  CONDITION_GRADES,
  LISTING_STATUSES,
  comments,
  listingPhotos,
  listings,
  profiles,
  releases,
} from '../src/db/schema';

describe('Drizzle Database Schema Boundaries', () => {
  it('should define correct table names', () => {
    expect(getTableName(profiles)).toBe('profiles');
    expect(getTableName(releases)).toBe('releases');
    expect(getTableName(listings)).toBe('listings');
    expect(getTableName(listingPhotos)).toBe('listing_photos');
    expect(getTableName(comments)).toBe('comments');
  });

  it('should have required columns for profiles table', () => {
    const columns = getTableColumns(profiles);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('username');
    expect(columns).toHaveProperty('displayName');
    expect(columns).toHaveProperty('avatarUrl');
    expect(columns).toHaveProperty('bio');
    expect(columns).toHaveProperty('location');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should have required columns for releases table', () => {
    const columns = getTableColumns(releases);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('artist');
    expect(columns).toHaveProperty('title');
    expect(columns).toHaveProperty('label');
    expect(columns).toHaveProperty('catalogueNumber');
    expect(columns).toHaveProperty('releaseYear');
    expect(columns).toHaveProperty('country');
    expect(columns).toHaveProperty('format');
    expect(columns).toHaveProperty('barcode');
    expect(columns).toHaveProperty('genre');
    expect(columns).toHaveProperty('externalSource');
    expect(columns).toHaveProperty('externalId');
    expect(columns).toHaveProperty('lastImportedAt');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should have required columns for listings table including minor unit integer price', () => {
    const columns = getTableColumns(listings);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('releaseId');
    expect(columns).toHaveProperty('sellerId');
    expect(columns).toHaveProperty('price');
    expect(columns.price.dataType).toBe('number'); // integer minor unit
    expect(columns).toHaveProperty('currency');
    expect(columns).toHaveProperty('mediaCondition');
    expect(columns).toHaveProperty('sleeveCondition');
    expect(columns).toHaveProperty('tradeAvailable');
    expect(columns).toHaveProperty('description');
    expect(columns).toHaveProperty('status');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should have required columns for listing_photos table', () => {
    const columns = getTableColumns(listingPhotos);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('listingId');
    expect(columns).toHaveProperty('storagePath');
    expect(columns).toHaveProperty('displayOrder');
    expect(columns).toHaveProperty('altText');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should have required columns for comments table', () => {
    const columns = getTableColumns(comments);
    expect(columns).toHaveProperty('id');
    expect(columns).toHaveProperty('listingId');
    expect(columns).toHaveProperty('authorId');
    expect(columns).toHaveProperty('content');
    expect(columns).toHaveProperty('createdAt');
    expect(columns).toHaveProperty('updatedAt');
  });

  it('should specify exact controlled condition grade and listing status vocabularies', () => {
    expect(CONDITION_GRADES).toEqual(['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P']);
    expect(LISTING_STATUSES).toEqual(['draft', 'published', 'reserved', 'sold', 'traded', 'archived']);
  });

  it('should throw clear error from getDb() when DATABASE_URL is unconfigured', () => {
    expect(() => getDb()).toThrow('DATABASE_URL environment variable is missing.');
  });
});
