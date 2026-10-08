import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import fs from 'fs';
import path from 'path';
import * as schema from '../src/db/schema';
import * as listingRepository from '../src/app/repositories/listingRepository';
import * as commentRepository from '../src/app/repositories/commentRepository';
import { getSellerPublishedListings } from '../src/app/services/listingService';

async function main() {
  console.log('🔄 Running discovery semantics verification against isolated PGlite engine...');

  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  const drizzleDir = path.join(process.cwd(), 'drizzle');
  const sqlFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    await pglite.exec(sql);
  }

  // 1. Condition filter media OR sleeve
  const seller1 = '11111111-1111-4111-8111-111111111111';
  const rel1 = '22222222-2222-4222-8222-222222222222';
  await db.insert(schema.profiles).values({ id: seller1, username: 'seller1', displayName: 'Seller One' });
  await db.insert(schema.releases).values({ id: rel1, artist: 'Artist One', title: 'Title One', label: 'Label One' });

  const copyA = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller1, mediaCondition: 'VG+', sleeveCondition: 'M' }).returning())[0];
  const copyB = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller1, mediaCondition: 'NM', sleeveCondition: 'VG+' }).returning())[0];
  const copyC = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller1, mediaCondition: 'M', sleeveCondition: 'M' }).returning())[0];

  const listA = (await db.insert(schema.listings).values({ physicalCopyId: copyA.id, sellerId: seller1, price: 2000, status: 'published' }).returning())[0];
  const listB = (await db.insert(schema.listings).values({ physicalCopyId: copyB.id, sellerId: seller1, price: 2500, status: 'published' }).returning())[0];
  await db.insert(schema.listings).values({ physicalCopyId: copyC.id, sellerId: seller1, price: 3000, status: 'published' });

  const condRes = await listingRepository.searchListings({ condition: 'VG+' }, db as any);
  if (condRes.totalCount !== 2 || !condRes.records.some(r => r.listing.id === listA.id) || !condRes.records.some(r => r.listing.id === listB.id)) {
    throw new Error('Condition filter did not match media OR sleeve condition correctly');
  }
  console.log('  ✅ Repository condition filter OR matching verified');

  // 2. Price sorting with NULL trade-only
  const seller2 = '33333333-3333-4333-8333-333333333333';
  await db.insert(schema.profiles).values({ id: seller2, username: 'seller2', displayName: 'Seller Two' });

  const copy2a = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller2, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];
  const copy2b = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller2, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];
  const copy2c = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller2, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];
  const copy2d = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller2, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];

  const listLow = (await db.insert(schema.listings).values({ physicalCopyId: copy2a.id, sellerId: seller2, price: 1000, status: 'published', createdAt: new Date('2025-01-01T10:00:00Z') }).returning())[0];
  const listHigh = (await db.insert(schema.listings).values({ physicalCopyId: copy2b.id, sellerId: seller2, price: 3000, status: 'published', createdAt: new Date('2025-01-02T10:00:00Z') }).returning())[0];
  const listTradeOld = (await db.insert(schema.listings).values({ physicalCopyId: copy2c.id, sellerId: seller2, price: null, tradeAvailable: true, status: 'published', createdAt: new Date('2025-01-01T00:00:00Z') }).returning())[0];
  const listTradeNew = (await db.insert(schema.listings).values({ physicalCopyId: copy2d.id, sellerId: seller2, price: null, tradeAvailable: true, status: 'published', createdAt: new Date('2025-01-03T00:00:00Z') }).returning())[0];

  const ascRes = await listingRepository.searchListings({ sellerId: seller2, sort: 'price_asc' }, db as any);
  const ascIds = ascRes.records.map(r => r.listing.id);
  if (JSON.stringify(ascIds) !== JSON.stringify([listLow.id, listHigh.id, listTradeNew.id, listTradeOld.id])) {
    throw new Error(`price_asc failed: expected [${[listLow.id, listHigh.id, listTradeNew.id, listTradeOld.id]}], got [${ascIds}]`);
  }

  const descRes = await listingRepository.searchListings({ sellerId: seller2, sort: 'price_desc' }, db as any);
  const descIds = descRes.records.map(r => r.listing.id);
  if (JSON.stringify(descIds) !== JSON.stringify([listHigh.id, listLow.id, listTradeNew.id, listTradeOld.id])) {
    throw new Error(`price_desc failed: expected [${[listHigh.id, listLow.id, listTradeNew.id, listTradeOld.id]}], got [${descIds}]`);
  }
  console.log('  ✅ Repository price_asc and price_desc NULL trade-only sorting verified');

  // 3. Seller profile service 12-item page limit
  const seller3 = '55555555-5555-4555-8555-555555555555';
  const username3 = 'seller3_page12';
  await db.insert(schema.profiles).values({ id: seller3, username: username3, displayName: 'Seller Three' });

  for (let i = 0; i < 15; i++) {
    const copy = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller3, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];
    await db.insert(schema.listings).values({ physicalCopyId: copy.id, sellerId: seller3, price: 1000 + i * 100, status: 'published' });
  }

  const p1 = await getSellerPublishedListings(username3, { page: 1 }, db as any);
  if (p1.items.length !== 12 || p1.totalCount !== 15 || p1.limit !== 12 || p1.totalPages !== 2) {
    throw new Error(`Seller profile page 1 limit contract failed: got items=${p1.items.length}, total=${p1.totalCount}, limit=${p1.limit}`);
  }
  const p2 = await getSellerPublishedListings(username3, { page: 2 }, db as any);
  if (p2.items.length !== 3 || p2.page !== 2) {
    throw new Error(`Seller profile page 2 failed: got items=${p2.items.length}`);
  }
  console.log('  ✅ Seller profile listing service 12-item pagination contract verified');

  // 4. Comment repository 50-item bound & chronological ASC order
  const seller4 = '77777777-7777-4777-8777-777777777777';
  await db.insert(schema.profiles).values({ id: seller4, username: 'seller4', displayName: 'Seller Four' });
  const copy4 = (await db.insert(schema.physicalCopies).values({ releaseId: rel1, ownerId: seller4, mediaCondition: 'VG', sleeveCondition: 'VG' }).returning())[0];
  const listing4 = (await db.insert(schema.listings).values({ physicalCopyId: copy4.id, sellerId: seller4, price: 2000, status: 'published' }).returning())[0];

  const baseTime = new Date('2025-01-01T00:00:00Z').getTime();
  for (let i = 0; i < 60; i++) {
    await db.insert(schema.comments).values({ listingId: listing4.id, authorId: seller4, content: `Comment ${i}`, createdAt: new Date(baseTime + i * 10000) });
  }

  const comments = await commentRepository.findCommentsByListingId(listing4.id, { limit: 50 }, db as any);
  if (comments.length !== 50) {
    throw new Error(`Expected 50 comments, got ${comments.length}`);
  }
  if (comments[0].content !== 'Comment 10' || comments[49].content !== 'Comment 59') {
    throw new Error(`Comment bounds failed: first='${comments[0].content}', last='${comments[49].content}'`);
  }
  if (new Date(comments[0].createdAt).getTime() >= new Date(comments[49].createdAt).getTime()) {
    throw new Error('Comments are not in chronological ASC order');
  }
  console.log('  ✅ Comment repository 50-item retrieval bound and chronological order verified');

  await pglite.close();
  console.log('🎉 Discovery semantics implementation-layer verification completed successfully!');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
