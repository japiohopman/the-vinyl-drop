import sharp from 'sharp';
import { profileUpdateSchema } from '../src/validators/profile';
import {
  processProfileAvatar,
  MAX_PROFILE_AVATAR_BYTES,
  MAX_PROFILE_AVATAR_FRAMES,
} from '../src/app/utils/imageProcessor';
import {
  clearInMemoryProfileAvatarStorage,
  createProfileAvatarStoragePath,
  deleteProfileAvatarFromStorage,
  getProfileAvatarPublicUrl,
  hasInMemoryProfileAvatar,
  uploadProfileAvatarToStorage,
} from '../src/app/services/profileAvatarStorageService';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOwnerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function twoFrameGifFixture(): Buffer {
  // GIF89a, 1x1 logical screen, two image blocks with independent delays,
  // a NETSCAPE loop extension, and valid 2-bit LZW streams.
  return Buffer.from([
    0x47,0x49,0x46,0x38,0x39,0x61, 0x01,0x00,0x01,0x00, 0x80,0x00,0x00,
    0x00,0x00,0x00, 0xff,0xff,0xff,
    0x21,0xff,0x0b,0x4e,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2e,0x30,0x03,0x01,0x00,0x00,0x00,
    0x21,0xf9,0x04,0x01,0x0a,0x00,0x00,0x00,
    0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,
    0x02,0x44,0x01,0x00,
    0x21,0xf9,0x04,0x01,0x14,0x00,0x00,0x00,
    0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,
    0x02,0x44,0x01,0x00,
    0x3b,
  ]);
}

describe('Profile avatar processing and Storage boundaries (#351)', () => {
  beforeEach(() => clearInMemoryProfileAvatarStorage());

  test('converts a static JPEG to a square transparent WebP without cropping', async () => {
    const jpeg = await sharp({
      create: {
        width: 320,
        height: 160,
        channels: 3,
        background: { r: 40, g: 90, b: 160 },
      },
    }).jpeg().toBuffer();

    const output = await processProfileAvatar(jpeg, 'image/jpeg');
    const metadata = await sharp(output.buffer).metadata();

    expect(output.animated).toBe(false);
    expect(output.contentType).toBe('image/webp');
    expect(output.extension).toBe('webp');
    expect(output.width).toBe(512);
    expect(output.height).toBe(512);
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.exif).toBeUndefined();
  });

  test('preserves animated GIF frames, independent delays and looping', async () => {
    const original = twoFrameGifFixture();
    const originalMetadata = await sharp(original, { animated: true }).metadata();
    expect(originalMetadata.format).toBe('gif');
    expect(originalMetadata.pages).toBe(2);
    expect(originalMetadata.loop).toBe(0);
    expect(originalMetadata.delay).toEqual([100, 200]);
    expect(originalMetadata.hasAlpha).toBe(true);

    const output = await processProfileAvatar(original, 'image/gif');
    const outputMetadata = await sharp(output.buffer, { animated: true }).metadata();

    expect(output.animated).toBe(true);
    expect(output.extension).toBe('gif');
    expect(output.contentType).toBe('image/gif');
    expect(outputMetadata.format).toBe('gif');
    expect(outputMetadata.pages).toBe(2);
    expect(outputMetadata.loop).toBe(originalMetadata.loop);
    expect(outputMetadata.delay).toEqual(originalMetadata.delay);
    expect(outputMetadata.hasAlpha).toBe(true);
  });

  test('rejects MIME spoofing, oversized inputs and malformed images', async () => {
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: 'red' },
    }).jpeg().toBuffer();

    await expect(processProfileAvatar(jpeg, 'image/gif')).rejects.toThrow('do not match');
    await expect(
      processProfileAvatar(Buffer.alloc(MAX_PROFILE_AVATAR_BYTES + 1), 'image/gif')
    ).rejects.toThrow('5 MiB');
    await expect(
      processProfileAvatar(Buffer.from('not-an-image'), 'image/jpeg')
    ).rejects.toThrow();
  });

  test('exports documented safe animation limits', () => {
    expect(MAX_PROFILE_AVATAR_FRAMES).toBe(30);
  });

  test('accepts only HTTPS URLs on the correct music-provider hosts', () => {
    expect(profileUpdateSchema.safeParse({
      username: 'crate_digger',
      soundcloudUrl: 'https://soundcloud.com/crate-digger',
      mixcloudUrl: 'https://www.mixcloud.com/crate-digger',
    }).success).toBe(true);

    for (const soundcloudUrl of [
      'http://soundcloud.com/crate-digger',
      'https://soundcloud.com.attacker.example/profile',
      'https://attacker.example/soundcloud.com',
      'javascript:alert(1)',
      'https://user:password@soundcloud.com/profile',
    ]) {
      expect(profileUpdateSchema.safeParse({
        username: 'crate_digger',
        soundcloudUrl,
      }).success).toBe(false);
    }

    expect(profileUpdateSchema.safeParse({
      username: 'crate_digger',
      mixcloudUrl: 'https://mixcloud.com.attacker.example/profile',
    }).success).toBe(false);
  });

  test("stores the image under the owner's profile namespace and returns a public URL", async () => {
    const storagePath = createProfileAvatarStoragePath(ownerId, 'gif');
    expect(storagePath).toMatch(new RegExp('^profiles/' + ownerId + '/[0-9a-f-]+\\.gif$'));

    await uploadProfileAvatarToStorage(storagePath, twoFrameGifFixture(), 'image/gif', {
      req: { user: { id: ownerId } } as never,
    });

    expect(getProfileAvatarPublicUrl(storagePath)).toContain('/mock-storage/profile-avatars/');
    expect(getProfileAvatarPublicUrl(storagePath)).not.toContain('example.supabase.co');
    expect(hasInMemoryProfileAvatar(storagePath)).toBe(true);
  });

  test('prevents a different authenticated user from uploading or deleting an avatar', async () => {
    const storagePath = createProfileAvatarStoragePath(ownerId, 'webp');
    const otherRequest = { user: { id: otherOwnerId } } as never;

    await expect(
      uploadProfileAvatarToStorage(storagePath, Buffer.from('x'), 'image/webp', { req: otherRequest })
    ).rejects.toThrow('not authorized');
    await expect(
      deleteProfileAvatarFromStorage(storagePath, { req: otherRequest })
    ).rejects.toThrow('not authorized');
  });

  test('removes an uploaded avatar from the isolated test Storage adapter', async () => {
    const storagePath = createProfileAvatarStoragePath(ownerId, 'webp');
    await uploadProfileAvatarToStorage(storagePath, Buffer.from('webp-test'), 'image/webp', {
      req: { user: { id: ownerId } } as never,
    });
    await deleteProfileAvatarFromStorage(storagePath, {
      req: { user: { id: ownerId } } as never,
    });
    expect(getProfileAvatarPublicUrl(storagePath)).toContain('/mock-storage/profile-avatars/');
    expect(hasInMemoryProfileAvatar(storagePath)).toBe(false);
  });
});
