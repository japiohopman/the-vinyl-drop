const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

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
  if (value.length > 2048 || /[<>\u0000-\u001f]/.test(value)) {
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
