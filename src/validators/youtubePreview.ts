const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

/**
 * Convert a seller-supplied YouTube watch/share URL to one canonical video ID.
 * A blank string clears the optional preview; missing/non-string input is invalid.
 * Embed URLs, playlists, non-HTTPS URLs, markup, and non-YouTube hosts are rejected.
 */
export function normalizeYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string') {
    throw new Error('Enter a YouTube watch or share URL.');
  }

  const value = input.trim();
  if (value === '') return null;
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (value.length > 2048 || value.includes('<') || value.includes('>') || hasControlCharacter) {
    throw new Error('Enter a valid YouTube watch or share URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid YouTube watch or share URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Use a secure YouTube watch or share URL.');
  }

  if (url.searchParams.has('list') || url.searchParams.has('listType')) {
    throw new Error('Playlist URLs are not supported; enter a single-video YouTube link.');
  }

  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    videoId = match?.[1] ?? null;
  } else if (ALLOWED_YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      const values = url.searchParams.getAll('v');
      if (values.length === 1 && !url.searchParams.has('list') && !url.searchParams.has('listType')) {
        videoId = values[0];
      }
    } else {
      const match = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/);
      videoId = match?.[1] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error('Enter a single-video YouTube watch or share URL (not an embed or playlist URL).');
  }

  return videoId;
}
