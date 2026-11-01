(function attachOptionsExperience(root) {
  const document = root && root.document;
  if (!document) return;
  const page = document.querySelector('[data-options-page]');
  const preferences = root.VinylDropPreferences;
  if (!page || !preferences) return;

  const status = page.querySelector('[data-options-status]');
  function announce(message) {
    if (status) status.textContent = message;
  }

  function bindBooleanPreference(key) {
    const control = page.querySelector('[data-preference="' + key + '"]');
    if (!control || control.type !== 'checkbox') return;
    control.checked = preferences.get(key) === true;
    control.addEventListener('change', () => {
      if (!preferences.set(key, control.checked)) {
        control.checked = preferences.get(key) === true;
        announce('That setting could not be changed.');
        return;
      }
      announce('Preference updated for this browser.');
    });
  }

  bindBooleanPreference('soundEffectsEnabled');
  bindBooleanPreference('tutorialsEnabled');

  const hapticsSetting = page.querySelector('[data-haptics-setting]');
  const hapticsUnavailable = page.querySelector('[data-haptics-unavailable]');
  const hapticsSupported = Boolean(root.navigator && typeof root.navigator.vibrate === 'function');
  if (hapticsSetting) hapticsSetting.hidden = !hapticsSupported;
  if (hapticsUnavailable) hapticsUnavailable.hidden = hapticsSupported;
  if (hapticsSupported) bindBooleanPreference('hapticFeedbackEnabled');

  const themeChoices = Array.from(page.querySelectorAll('[data-theme-choice]'));
  function syncThemeChoices() {
    const selectedTheme = preferences.get('theme');
    themeChoices.forEach((choice) => {
      choice.checked = choice.value === selectedTheme;
    });
  }
  themeChoices.forEach((choice) => {
    choice.addEventListener('change', () => {
      if (!choice.checked) return;
      if (!preferences.set('theme', choice.value)) {
        syncThemeChoices();
        announce('That theme is not available.');
        return;
      }
      syncThemeChoices();
      announce('Theme updated for this browser.');
    });
  });
  preferences.subscribe((_values, key) => {
    if (key === 'theme') syncThemeChoices();
    if (key === 'soundEffectsEnabled' || key === 'hapticFeedbackEnabled' || key === 'tutorialsEnabled') {
      const control = page.querySelector('[data-preference="' + key + '"]');
      if (control && control.type === 'checkbox') control.checked = preferences.get(key) === true;
    }
  });
  syncThemeChoices();
  page.dataset.optionsReady = 'true';
})(window);
