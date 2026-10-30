import fs from 'fs';
import path from 'path';
import { runInNewContext } from 'vm';

type PreferenceApi = {
  get(key: string): unknown;
  getAll(): Record<string, unknown>;
  set(key: string, value: unknown): boolean;
  subscribe(listener: (values: Record<string, unknown>, key: string) => void): () => void;
};

type SoundApi = {
  play(name: string): boolean;
};

const preferencesSource = fs.readFileSync(
  path.join(process.cwd(), 'public/js/user-preferences.js'),
  'utf8'
);
const soundsSource = fs.readFileSync(
  path.join(process.cwd(), 'public/js/dig-sounds.js'),
  'utf8'
);

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { values.set(key, value); }),
  };
  return { storage, values };
}

function loadPreferences(localStorage: Storage | ReturnType<typeof createStorage>['storage']): PreferenceApi {
  const sandbox = { localStorage };
  runInNewContext(preferencesSource, sandbox);
  return (sandbox as typeof sandbox & { VinylDropPreferences: PreferenceApi }).VinylDropPreferences;
}

describe('shared browser preferences', () => {
  it('defaults sound effects to on and exposes a reusable preference snapshot', () => {
    const { storage } = createStorage();
    const preferences = loadPreferences(storage);
    expect(preferences.get('soundEffectsEnabled')).toBe(true);
    expect(preferences.getAll()).toEqual({ soundEffectsEnabled: true });
  });

  it('reads and persists the disabled choice for later pages and settings surfaces', () => {
    const { storage, values } = createStorage({
      'tvd:preferences:v1': JSON.stringify({ soundEffectsEnabled: false }),
    });
    const preferences = loadPreferences(storage);
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
    const unavailableStorage = {
      getItem: jest.fn(() => { throw new Error('Storage unavailable'); }),
      setItem: jest.fn(() => { throw new Error('Storage unavailable'); }),
    };
    const preferences = loadPreferences(unavailableStorage);
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

  function createSoundSandbox(withAudio = true) {
    const { storage } = createStorage();
    const preferences = loadPreferences(storage);
    const sandbox: Record<string, unknown> = { VinylDropPreferences: preferences };
    if (withAudio) sandbox.Audio = MockAudio;
    MockAudio.instances = [];
    runInNewContext(soundsSource, sandbox);
    return {
      sounds: (sandbox as typeof sandbox & { DigSounds: SoundApi }).DigSounds,
      preferences,
    };
  }

  it('does not play sounds when the shared preference is disabled', () => {
    const { sounds, preferences } = createSoundSandbox();
    preferences.set('soundEffectsEnabled', false);

    expect(MockAudio.instances).toHaveLength(2);
    expect(sounds.play('flip')).toBe(false);
    expect(MockAudio.instances.every((audio) => audio.play.mock.calls.length === 0)).toBe(true);
  });

  it('uses quiet project-owned assets and safely absorbs a blocked playback promise', async () => {
    const { sounds } = createSoundSandbox();
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
    const { sounds } = createSoundSandbox(false);
    expect(sounds.play('flip')).toBe(false);
  });

  it('includes the copied placeholder assets in the project bundle', () => {
    expect(fs.statSync(path.join(process.cwd(), 'public/assets/sounds/dig/sleeve-flip.wav')).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(process.cwd(), 'public/assets/sounds/dig/record-change.mp3')).size).toBeGreaterThan(0);
  });
});
