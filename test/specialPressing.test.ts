import ejs from 'ejs';
import path from 'path';
import { createListingFromReleaseSchema, updateListingDetailsSchema } from '../src/validators/listing';
import { releaseSchema } from '../src/validators/release';
import { buildListingCardViewModel } from '../src/app/view-models/listingCardViewModel';

const validCopyInput = {
  releaseId: '10000000-0000-4000-8000-000000000001',
  mediaCondition: 'NM',
  sleeveCondition: 'VG+',
};

describe('Special Pressing and Release content classification', () => {
  it('defaults legacy-style listing input to an ordinary Music release and copy', () => {
    const copy = createListingFromReleaseSchema.parse(validCopyInput);
    const release = releaseSchema.parse({ artist: 'Test Artist', title: 'Test Release' });

    expect(copy.specialPressing).toBe(false);
    expect(copy.specialPressingCharacteristics).toEqual([]);
    expect(release.contentType).toBe('music');
  });

  it('accepts the generic Shaped characteristic and seller-authored product details', () => {
    const parsed = createListingFromReleaseSchema.parse({
      ...validCopyInput,
      specialPressing: 'true',
      specialPressingCharacteristics: ['shaped'],
      specialPressingDetails: 'A custom heart-shaped die-cut; only 300 made.',
      notes: 'Private cleaning note',
    });

    expect(parsed.specialPressing).toBe(true);
    expect(parsed.specialPressingCharacteristics).toEqual(['shaped']);
    expect(parsed.specialPressingDetails).toContain('heart-shaped');
    expect(parsed.notes).toBe('Private cleaning note');
  });

  it('requires at least one characteristic when Special Pressing is selected', () => {
    const result = createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: 'true',
    });

    expect(result.success).toBe(false);
  });

  it('rejects characteristics or public details when Special Pressing is not selected', () => {
    expect(createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: false,
      specialPressingCharacteristics: ['shaped'],
    }).success).toBe(false);

    expect(createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: false,
      specialPressingDetails: 'A heart-shaped record',
    }).success).toBe(false);
  });

  it('rejects duplicates, unknown characteristics and overlong seller details', () => {
    expect(createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: true,
      specialPressingCharacteristics: ['shaped', 'shaped'],
    }).success).toBe(false);

    expect(createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: true,
      specialPressingCharacteristics: ['heart'],
    }).success).toBe(false);

    expect(createListingFromReleaseSchema.safeParse({
      ...validCopyInput,
      specialPressing: true,
      specialPressingCharacteristics: ['shaped'],
      specialPressingDetails: 'x'.repeat(1001),
    }).success).toBe(false);
  });

  it('allows sellers to correct Release content type independently of copy characteristics', () => {
    const parsedRelease = releaseSchema.parse({
      artist: 'Test Artist',
      title: 'Spoken Word Release',
      contentType: 'non_music',
    });
    const parsedUpdate = updateListingDetailsSchema.parse({
      releaseContentType: 'non_music',
      specialPressing: true,
      specialPressingCharacteristics: ['picture_disc'],
      specialPressingDetails: 'Printed image on the vinyl surface.',
    });

    expect(parsedRelease.contentType).toBe('non_music');
    expect(parsedUpdate.releaseContentType).toBe('non_music');
    expect(parsedUpdate.specialPressingCharacteristics).toEqual(['picture_disc']);
  });

  it('renders the Special Pressing marker and selected characteristics on listing cards', async () => {
    const html = await ejs.renderFile(path.join(process.cwd(), 'views/partials/listing-card.ejs'), {
      listing: {
        id: 'listing-shaped',
        title: 'Special record',
        artist: 'Test Artist',
        format: '12-inch',
        priceFormatted: '€20.00',
        isTrade: false,
        mediaCondition: 'NM',
        sleeveCondition: 'VG+',
        specialPressing: true,
        specialPressingCharacteristics: ['shaped'],
        contentType: 'non_music',
        sellerUsername: 'seller',
        sellerLocation: 'Eindhoven',
      },
      mode: 'grid',
      getIconSvg: () => '',
    });

    expect(html).toContain('Special Pressing');
    expect(html).toContain('Shaped');
    expect(html).toContain('Non-Music');
  });

  it('adds classification flags to cards without changing ordinary-copy defaults', () => {
    const ordinary = buildListingCardViewModel({
      id: 'listing-ordinary',
      title: 'Ordinary release',
      artist: 'Test Artist',
      mediaCondition: 'NM',
      sleeveCondition: 'VG+',
    });
    const special = buildListingCardViewModel({
      id: 'listing-special',
      title: 'Special record',
      artist: 'Test Artist',
      mediaCondition: 'NM',
      sleeveCondition: 'VG+',
      specialPressing: true,
      specialPressingCharacteristics: ['shaped'],
      contentType: 'non_music',
    });

    expect(ordinary.specialPressing).toBe(false);
    expect(ordinary.contentType).toBe('music');
    expect(special.specialPressing).toBe(true);
    expect(special.specialPressingCharacteristics).toEqual(['shaped']);
    expect(special.contentType).toBe('non_music');
  });
});
