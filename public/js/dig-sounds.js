(function attachDigSounds(root) {
  const preferences = root && root.VinylDropPreferences;
  const definitions = Object.freeze({
    flip: Object.freeze({
      src: '/assets/sounds/dig/sleeve-flip.wav',
      volume: 0.12,
    }),
    recordChange: Object.freeze({
      src: '/assets/sounds/dig/record-change.mp3',
      volume: 0.08,
    }),
  });
  const players = Object.create(null);

  function createPlayer(name) {
    if (!root || typeof root.Audio !== 'function') return null;
    const definition = definitions[name];
    if (!definition) return null;

    try {
      const audio = new root.Audio(definition.src);
      audio.preload = 'auto';
      audio.volume = definition.volume;
      return audio;
    } catch {
      return null;
    }
  }

  Object.keys(definitions).forEach((name) => {
    players[name] = createPlayer(name);
  });

  function play(name) {
    if (!preferences || typeof preferences.get !== 'function') return false;
    if (preferences.get('soundEffectsEnabled') === false) return false;
    const audio = players[name];
    if (!audio || typeof audio.play !== 'function') return false;

    try {
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  const api = Object.freeze({ play });
  if (root) root.DigSounds = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
