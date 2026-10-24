(function () {
  'use strict';
  var form = document.querySelector('[data-discogs-lookup-form]');
  if (!form) return;
  var artistInput = form.querySelector('[data-discogs-lookup-artist]');
  var titleInput = form.querySelector('[data-discogs-lookup-title]');
  var status = document.getElementById('discogsLookupStatus');
  var coverArtUrlInput = document.getElementById('discogsCoverArtUrl');
  var debounceTimer = null;
  var activeController = null;
  var debounceMs = 450;
  var fieldMap = {
    label: 'label', catalogueNumber: 'catalogueNumber', releaseYear: 'releaseYear',
    format: 'format', barcode: 'barcode', country: 'country', genre: 'genre', coverArtUrl: 'coverArtUrl'
  };

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || 'idle';
  }

  function getField(key) {
    return key === 'coverArtUrl' ? coverArtUrlInput : form.querySelector('[data-discogs-field="' + key + '"]');
  }

  function clearPreviousAutomaticValues() {
    Object.keys(fieldMap).forEach(function (key) {
      var field = getField(key);
      if (!field) return;
      if (field.dataset.discogsFilled === 'true' && field.dataset.userEdited !== 'true') field.value = '';
      delete field.dataset.discogsFilled;
    });
  }

  Object.keys(fieldMap).forEach(function (key) {
    var field = getField(key);
    if (!field) return;
    field.addEventListener('input', function () { field.dataset.userEdited = 'true'; });
  });

  function applyMetadata(metadata) {
    Object.keys(fieldMap).forEach(function (key) {
      var field = getField(key);
      if (!field || field.dataset.userEdited === 'true') return;
      var value = metadata[key];
      if (value === undefined || value === null || value === '') return;
      field.value = String(value);
      field.dataset.discogsFilled = 'true';
    });
  }

  async function lookup() {
    if (activeController) activeController.abort();
    activeController = null;
    var artist = artistInput ? artistInput.value.trim() : '';
    var title = titleInput ? titleInput.value.trim() : '';
    clearPreviousAutomaticValues();
    if (artist.length < 2 || title.length < 2) {
      setStatus('Enter an artist and title to check Discogs.', 'idle');
      return;
    }

    activeController = new AbortController();
    setStatus('Checking Discogs…', 'searching');
    try {
      var params = new URLSearchParams({ artist: artist, title: title });
      var response = await fetch('/releases/lookup-metadata?' + params.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: activeController.signal,
        credentials: 'same-origin'
      });
      if (response.status === 400) {
        setStatus('Check the artist and title, then try again.', 'error');
        return;
      }
      if (response.status === 503 || !response.ok) {
        setStatus('Discogs is temporarily unavailable. You can still enter the details manually.', 'error');
        return;
      }
      var result = await response.json();
      if (result && result.found && result.metadata) {
        applyMetadata(result.metadata);
        setStatus(
          result.matchType === 'track'
            ? 'Discogs track match found. Release details filled in — review or correct them.'
            : 'Discogs release match found. Details filled in — review or correct them.',
          'found'
        );
      } else {
        setStatus('No confident match found. You can enter the release details manually.', 'empty');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      setStatus('Discogs is temporarily unavailable. You can still enter the details manually.', 'error');
    }
  }

  function scheduleLookup() {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    if (activeController) activeController.abort();
    setStatus('Waiting for artist and title…', 'idle');
    debounceTimer = window.setTimeout(function () {
      debounceTimer = null;
      lookup();
    }, debounceMs);
  }
  if (artistInput) artistInput.addEventListener('input', scheduleLookup);
  if (titleInput) titleInput.addEventListener('input', scheduleLookup);
})();
