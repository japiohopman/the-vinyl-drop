import fs from 'fs';
import path from 'path';

type PreferenceApi = {
  get(key: string): unknown;
  getAll(): Record<string, unknown>;
  set(key: string, value: unknown): boolean;
  subscribe(listener: (values: Record<string, unknown>, key: string) => void): () => void;
};

const originalDescriptors = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  Audio: Object.getOwnPropertyDescriptor(globalThis, 'Audio'),
  VinylDropPreferences: Object.getOwnPropertyDescriptor(globalThis, 'VinylDropPreferences'),
};

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  return { storage, values };
}

function loadPreferences(): PreferenceApi {
  const modulePath = require.resolve('../public/js/user-preferences');
  delete require.cache[modulePath];
  return require('../public/js/user-preferences') as PreferenceApi;
}

function restoreGlobal(name: 'localStorage' | 'Audio' | 'VinylDropPreferences') {
  const descriptor = originalDescriptors[name];
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as unknown as Record<string, unknown>)[name];
}

describe('shared browser preferences', () => {
  beforeEach(() => {
    jest.resetModules();
    installStorage();
  });

  afterEach(() => {
    restoreGlobal('localStorage');
    restoreGlobal('VinylDropPreferences');
    restoreGlobal('Audio');
  });

  it('defaults sound effects to on and exposes a reusable preference snapshot', () => {
    const preferences = loadPreferences();
    expect(preferences.get('soundEffectsEnabled')).toBe(true);
    expect(preferences.getAll()).toEqual({ soundEffectsEnabled: true });
  });

  it('reads and persists the disabled choice for later pages and settings surfaces', () => {
    const { storage, values } = installStorage({
      'tvd:preferences:v1': JSON.stringify({ soundEffectsEnabled: false }),
    });
    const preferences = loadPreferences();
    expect(preferences.get('soundEffectsEnabled')).toBe(false);

    const notifications: string[] = [];
    const unsubscribe = preferences.subscribe((_values, key) => notifications.push(key));
    expect(preferences.set('soundEffectsEnabled', true)).toBe(true);
    expect(preferences.set('unknownPreference', true)).toBe(false);
    unsubscribe();

    expect(JSON.parse(values.get('tvd:preferences:v1') || '{}')).toEqual({ soundEffectsEnabled: true });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(notifications).toEqual(['soundEffectsEnabled']);
  });

  it('keeps a working in-memory preference when browser storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('Storage unavailable'); },
    });
    const preferences = loadPreferences();
    expect(preferences.get('soundEffectsEnabled')).toBe(true);
    expect(preferences.set('soundEffectsEnabled', false)).toBe(true);
    expect(preferences.get('soundEffectsEnabled')).toBe(false);
  });
});

describe('Dig sound playback', () => {
  class MockAudio {
    static instances: MockAudio[] = [];
    currentTime = 0;
    volume = 1;
    preload = 'none';
    play = jest.fn(() => Promise.resolve());

    constructor(public src: string) {
      MockAudio.instances.push(this);
    }
  }

  beforeEach(() => {
    jest.resetModules();
    MockAudio.instances = [];
    installStorage();
    const preferences = loadPreferences();
    Object.defineProperty(globalThis, 'VinylDropPreferences', { configurable: true, value: preferences });
    Object.defineProperty(globalThis, 'Audio', { configurable: true, value: MockAudio });
  });

  afterEach(() => {
    restoreGlobal('localStorage');
    restoreGlobal('VinylDropPreferences');
    restoreGlobal('Audio');
  });

  function loadSounds() {
    const modulePath = require.resolve('../public/js/dig-sounds');
    delete require.cache[modulePath];
    return require('../public/js/dig-sounds') as { play(name: string): boolean };
  }

  it('does not play sounds when the shared preference is disabled', () => {
    const preferences = (globalThis as typeof globalThis & { VinylDropPreferences: PreferenceApi }).VinylDropPreferences;
    preferences.set('soundEffectsEnabled', false);
    const sounds = loadSounds();

    expect(MockAudio.instances).toHaveLength(2);
    expect(sounds.play('flip')).toBe(false);
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it('uses quiet project-owned assets and safely absorbs a blocked playback promise', async () => {
    const sounds = loadSounds();
    expect(sounds.play('flip')).toBe(true);
    expect(sounds.play('recordChange')).toBe(true);
    expect(MockAudio.instances.map((audio) => audio.src)).toEqual([
      '/assets/sounds/dig/sleeve-flip.wav',
      '/assets/sounds/dig/record-change.mp3',
    ]);
    expect(MockAudio.instances.map((audio) => audio.volume)).toEqual([0.12, 0.08]);

    MockAudio.instances[0].play.mockImplementation(() => Promise.reject(new Error('Playback blocked')));
    expect(sounds.play('flip')).toBe(true);
    await Promise.resolve();
  });

  it('returns safely when the browser has no Audio constructor', () => {
    restoreGlobal('Audio');
    const sounds = loadSounds();
    expect(sounds.play('flip')).toBe(false);
  });

  it('includes the copied placeholder assets in the project bundle', () => {
    expect(fs.statSync(path.join(process.cwd(), 'public/assets/sounds/dig/sleeve-flip.wav')).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(process.cwd(), 'public/assets/sounds/dig/record-change.mp3')).size).toBeGreaterThan(0);
  });
});
