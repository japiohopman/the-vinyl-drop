(function () {
  'use strict';
  var form = document.querySelector('[data-discogs-lookup-form]');
  if (!form) return;
  var artistInput = form.querySelector('[data-discogs-lookup-artist]');
  var titleInput = form.querySelector('[data-discogs-lookup-title]');
  var status = document.getElementById('discogsLookupStatus');
  var coverArtUrlInput = document.getElementById('discogsCoverArtUrl');
  var metadataDetails = document.getElementById('releaseMetadataDetails');
  var coverPreview = form.querySelector('[data-discogs-cover-preview]');
  var coverPreviewImage = coverPreview ? coverPreview.querySelector('img') : null;
  var coverPreviewStatus = coverPreview ? coverPreview.querySelector('[data-discogs-cover-preview-status]') : null;
  var submitButton = form.querySelector('button[type="submit"]');
  var manualArtworkInput = form.querySelector('#releaseCoverArt');
  var manualArtworkFilename = form.querySelector('#releaseCoverArtFilename');
  var manualArtworkPreview = form.querySelector('[data-release-cover-override-preview]');
  var manualArtworkPreviewImage = manualArtworkPreview ? manualArtworkPreview.querySelector('[data-release-cover-override-image]') : null;
  var debounceTimer = null;
  var activeController = null;
  var debounceMs = 450;
  var lookupSequence = 0;
  var lookupPending = false;
  var submitAfterLookup = false;
  var fieldMap = {
    label: 'label', catalogueNumber: 'catalogueNumber', releaseYear: 'releaseYear',
    format: 'format', barcode: 'barcode', country: 'country', genre: 'genre', coverArtUrl: 'coverArtUrl'
  };

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || 'idle';
  }

  function setLookupPending(pending) {
    lookupPending = pending;
    if (submitButton) submitButton.disabled = pending;
    form.dataset.lookupPending = pending ? 'true' : 'false';
  }

  function getField(key) {
    return key === 'coverArtUrl' ? coverArtUrlInput : form.querySelector('[data-discogs-field="' + key + '"]');
  }

  function updateCoverPreview(value, hasMatch) {
    if (!coverPreview || !coverPreviewImage) return;
    if (typeof value === 'string' && /^https:\/\//i.test(value)) {
      coverPreview.hidden = false;
      coverPreviewImage.hidden = false;
      if (coverPreviewStatus) coverPreviewStatus.textContent = 'Discogs catalogue artwork found.';
      coverPreviewImage.onload = function () {
        if (coverPreviewStatus && coverPreviewImage.getAttribute('src') === value) {
          coverPreviewStatus.textContent = 'Discogs catalogue artwork found.';
        }
      };
      coverPreviewImage.onerror = function () {
        if (coverPreviewImage.getAttribute('src') !== value) return;
        coverPreviewImage.hidden = true;
        if (coverPreviewStatus) {
          coverPreviewStatus.textContent = 'Discogs found the release, but its artwork could not be loaded. You can use your own artwork below.';
        }
      };
      coverPreviewImage.src = value;
    } else {
      coverPreviewImage.removeAttribute('src');
      coverPreviewImage.hidden = true;
      coverPreview.hidden = !hasMatch;
      if (coverPreviewStatus) {
        coverPreviewStatus.textContent = hasMatch
          ? 'Discogs matched this release, but no catalogue artwork is available. You can add your own artwork in Release details.'
          : '';
      }
    }
  }

  function clearManualArtworkForNewRelease() {
    if (!manualArtworkInput || !manualArtworkInput.files || manualArtworkInput.files.length === 0) return;
    manualArtworkInput.value = '';
    if (manualArtworkFilename) manualArtworkFilename.textContent = 'No file selected';
    if (manualArtworkPreviewImage) manualArtworkPreviewImage.removeAttribute('src');
    if (manualArtworkPreview) manualArtworkPreview.hidden = true;
  }

  function clearPreviousAutomaticValues() {
    Object.keys(fieldMap).forEach(function (key) {
      var field = getField(key);
      if (!field) return;
      if (field.dataset.discogsFilled === 'true' && field.dataset.userEdited !== 'true') field.value = '';
      delete field.dataset.discogsFilled;
    });
    updateCoverPreview(coverArtUrlInput ? coverArtUrlInput.value : '', false);
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
    updateCoverPreview(coverArtUrlInput ? coverArtUrlInput.value : '', true);
    if (metadataDetails) metadataDetails.open = true;
  }

  async function lookup(sequence) {
    if (activeController) activeController.abort();
    activeController = null;
    var artist = artistInput ? artistInput.value.trim() : '';
    var title = titleInput ? titleInput.value.trim() : '';
    clearPreviousAutomaticValues();
    if (artist.length < 2 || title.length < 2) {
      setStatus('Enter an artist and title to check Discogs.', 'idle');
      finishLookup(sequence);
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
        if (metadataDetails) metadataDetails.open = true;
        setStatus('Check the artist and title, then try again.', 'error');
        return;
      }
      if (response.status === 503 || !response.ok) {
        if (metadataDetails) metadataDetails.open = true;
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
        if (metadataDetails) metadataDetails.open = true;
        setStatus('No confident match found. You can enter the release details manually.', 'empty');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (metadataDetails) metadataDetails.open = true;
      setStatus('Discogs is temporarily unavailable. You can still enter the details manually.', 'error');
    } finally {
      finishLookup(sequence);
    }
  }

  function finishLookup(sequence) {
    if (sequence !== lookupSequence) return;
    activeController = null;
    setLookupPending(false);
    if (submitAfterLookup) {
      submitAfterLookup = false;
      form.requestSubmit();
    }
  }

  function scheduleLookup() {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    if (activeController) activeController.abort();
    clearManualArtworkForNewRelease();
    lookupSequence += 1;
    var sequence = lookupSequence;
    setLookupPending(true);
    setStatus('Waiting for artist and title…', 'idle');
    debounceTimer = window.setTimeout(function () {
      debounceTimer = null;
      lookup(sequence);
    }, debounceMs);
  }

  form.addEventListener('submit', function (event) {
    if (!lookupPending) return;
    event.preventDefault();
    submitAfterLookup = true;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
      lookup(lookupSequence);
    }
  });

  if (artistInput) artistInput.addEventListener('input', scheduleLookup);
  if (titleInput) titleInput.addEventListener('input', scheduleLookup);
})();