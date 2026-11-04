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
  var coverPreviewPlaceholder = coverPreview ? coverPreview.querySelector('[data-discogs-artwork-placeholder]') : null;
  var coverPreviewStatus = coverPreview ? coverPreview.querySelector('[data-discogs-cover-preview-status]') : null;
  var candidateContainer = form.querySelector('[data-discogs-candidates]');
  var formatCharacteristicInputs = Array.prototype.slice.call(form.querySelectorAll('input[name="formatCharacteristics"]'));
  var debounceTimer = null;
  var activeController = null;
  var debounceMs = 450;
  var lookupSequence = 0;
  var lookupPending = false;
  var submitAfterLookup = false;
  var fieldMap = {
    label: 'label', catalogueNumber: 'catalogueNumber', releaseYear: 'releaseYear',
    format: 'format', barcode: 'barcode', country: 'country', countryCode: 'countryCode', genre: 'genre', coverArtUrl: 'coverArtUrl',
    discogsExternalId: 'discogsExternalId'
  };

  function setStatus(message, state) {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || 'idle';
  }

  function setLookupPending(pending) {
    lookupPending = pending;
    form.dataset.lookupPending = pending ? 'true' : 'false';
  }

  function getField(key) {
    return key === 'coverArtUrl' ? coverArtUrlInput : form.querySelector('[data-discogs-field="' + key + '"]');
  }

  function setCoverPreviewMessage(message, state) {
    if (!coverPreview) return;
    coverPreview.dataset.state = state || 'idle';
    if (coverPreviewStatus) coverPreviewStatus.textContent = message;
  }

  function updateCoverPreview(value, hasMatch) {
    if (!coverPreview || !coverPreviewImage) return;

    if (typeof value === 'string' && /^https:\/\//i.test(value)) {
      coverPreview.dataset.state = 'found';
      if (coverPreviewPlaceholder) coverPreviewPlaceholder.hidden = true;
      coverPreviewImage.hidden = false;
      if (coverPreviewStatus) coverPreviewStatus.textContent = 'Discogs catalogue artwork found.';
      coverPreviewImage.onload = function () {
        if (coverPreviewImage.getAttribute('src') === value) {
          setCoverPreviewMessage('Discogs catalogue artwork found.', 'found');
        }
      };
      coverPreviewImage.onerror = function () {
        if (coverPreviewImage.getAttribute('src') !== value) return;
        coverPreviewImage.hidden = true;
        if (coverPreviewPlaceholder) coverPreviewPlaceholder.hidden = false;
        setCoverPreviewMessage('Discogs returned artwork, but the image could not be loaded. You can add a replacement in Edit listing.', 'error');
      };
      coverPreviewImage.src = value;
      return;
    }

    coverPreviewImage.removeAttribute('src');
    coverPreviewImage.hidden = true;
    if (coverPreviewPlaceholder) coverPreviewPlaceholder.hidden = false;
    setCoverPreviewMessage(
      hasMatch
        ? 'Discogs found the release, but no catalogue artwork is available. You can add release artwork later in Edit listing.'
        : 'Artwork will appear here after a confident Discogs match. You can add or replace release artwork later in Edit listing.',
      hasMatch ? 'missing' : 'idle'
    );
  }


  function clearCandidatePicker() {
    if (!candidateContainer) return;
    candidateContainer.replaceChildren();
    candidateContainer.hidden = true;
  }

  function renderCandidatePicker(candidates) {
    if (!candidateContainer) return;
    candidateContainer.replaceChildren();
    candidateContainer.hidden = false;

    candidates.forEach(function (candidate) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'discogs-candidate-option';
      button.setAttribute('aria-pressed', 'false');

      var copy = document.createElement('span');
      copy.className = 'discogs-candidate-option-copy';
      var heading = document.createElement('strong');
      heading.textContent = candidate.artist + ' — ' + candidate.title;
      var format = document.createElement('span');
      format.className = 'discogs-candidate-format';
      format.textContent = 'Format: ' + (candidate.formatLabel || 'Not supplied by Discogs');
      var details = document.createElement('small');
      var metadata = candidate.metadata || {};
      var characteristicLabels = { 'lp': 'LP', '12-inch': '12-inch', '7-inch': '7-inch' };
      var vinylCharacteristics = Array.isArray(metadata.formatCharacteristics)
        ? metadata.formatCharacteristics.map(function (value) { return characteristicLabels[value] || value; })
        : [];
      var detailParts = [
        metadata.releaseYear,
        metadata.label,
        metadata.catalogueNumber,
        vinylCharacteristics.length ? 'Recognized vinyl: ' + vinylCharacteristics.join(', ') : ''
      ].filter(Boolean);
      details.textContent = detailParts.join(' · ') || 'No additional edition details supplied';

      copy.appendChild(heading);
      copy.appendChild(format);
      copy.appendChild(details);
      button.appendChild(copy);

      if (metadata.coverArtUrl && /^https:\/\//i.test(metadata.coverArtUrl)) {
        var artwork = document.createElement('img');
        artwork.src = metadata.coverArtUrl;
        artwork.alt = 'Catalogue artwork for ' + candidate.artist + ' — ' + candidate.title;
        artwork.loading = 'lazy';
        artwork.referrerPolicy = 'no-referrer';
        artwork.addEventListener('error', function () {
          artwork.remove();
        }, { once: true });
        button.insertBefore(artwork, copy);
      } else {
        var noArtwork = document.createElement('span');
        noArtwork.className = 'discogs-candidate-no-artwork';
        noArtwork.textContent = 'No catalogue artwork';
        button.insertBefore(noArtwork, copy);
      }

      button.addEventListener('click', function () {
        // A deliberate edition choice replaces all catalogue-linked fields so
        // artwork and Discogs identity can never drift to a different candidate.
        applyMetadata(metadata, true);
        clearCandidatePicker();

        if (metadata.coverArtUrl && /^https:\/\//i.test(metadata.coverArtUrl)) {
          setStatus('Selected ' + candidate.title + ' · ' + candidate.formatLabel + '. Review the details before continuing.', 'found');
        } else {
          enrichSelectedEditionArtwork(metadata, candidate.title);
        }
      });
      candidateContainer.appendChild(button);
    });
  }

  function clearPreviousAutomaticValues() {
    clearCandidatePicker();
    Object.keys(fieldMap).forEach(function (key) {
      var field = getField(key);
      if (!field) return;
      if (field.dataset.discogsFilled === 'true' && field.dataset.userEdited !== 'true') field.value = '';
      delete field.dataset.discogsFilled;
    });
    formatCharacteristicInputs.forEach(function (input) {
      if (input.dataset.discogsFilled === 'true' && input.dataset.userEdited !== 'true') input.checked = false;
      delete input.dataset.discogsFilled;
    });
    updateCoverPreview(coverArtUrlInput ? coverArtUrlInput.value : '', false);
  }

  formatCharacteristicInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      input.dataset.userEdited = 'true';
    });
  });

  Object.keys(fieldMap).forEach(function (key) {
    var field = getField(key);
    if (!field) return;
    field.addEventListener('input', function () {
      field.dataset.userEdited = 'true';
      if (key === 'country') {
        var countryCodeField = getField('countryCode');
        if (countryCodeField) {
          countryCodeField.value = '';
          delete countryCodeField.dataset.discogsFilled;
        }
      }
    });
  });

  function applyMetadata(metadata, forceSelectedEdition) {
    Object.keys(fieldMap).forEach(function (key) {
      var field = getField(key);
      if (!field || (!forceSelectedEdition && field.dataset.userEdited === 'true')) return;
      var value = metadata[key];
      if (forceSelectedEdition) {
        field.value = value === undefined || value === null ? '' : String(value);
        delete field.dataset.userEdited;
        field.dataset.discogsFilled = 'true';
        return;
      }
      if (value === undefined || value === null || value === '') return;
      field.value = String(value);
      field.dataset.discogsFilled = 'true';
    });

    var selectedCharacteristics = Array.isArray(metadata.formatCharacteristics) ? metadata.formatCharacteristics : [];
    formatCharacteristicInputs.forEach(function (input) {
      if (forceSelectedEdition || input.dataset.userEdited !== 'true') {
        input.checked = selectedCharacteristics.indexOf(input.value) !== -1;
        if (forceSelectedEdition) delete input.dataset.userEdited;
        input.dataset.discogsFilled = 'true';
      }
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
    setCoverPreviewMessage('Looking for release artwork…', 'searching');
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
        setCoverPreviewMessage('Check the artist and title to look up release artwork.', 'error');
        return;
      }
      if (response.status === 503 || !response.ok) {
        if (metadataDetails) metadataDetails.open = true;
        setStatus('Discogs is temporarily unavailable. You can still enter the details manually.', 'error');
        setCoverPreviewMessage('Discogs is temporarily unavailable. You can add release artwork later in Edit listing.', 'error');
        return;
      }
      var result = await response.json();
      if (result && result.found && result.selectionRequired && Array.isArray(result.candidates) && result.candidates.length > 0) {
        renderCandidatePicker(result.candidates);
        if (metadataDetails) metadataDetails.open = true;
        setStatus('Several editions or an unclear physical format were found. Choose the exact edition below, or enter the details manually.', 'empty');
        setCoverPreviewMessage('No edition has been selected yet. Catalogue artwork will follow the edition you choose.', 'idle');
      } else if (result && result.found && result.metadata) {
        applyMetadata(result.metadata);
        clearCandidatePicker();
        setStatus(
          result.matchType === 'track'
            ? 'Discogs track match found. Release details filled in — review or correct them.'
            : 'Discogs release match found. Details filled in — review or correct them.',
          'found'
        );
      } else {
        if (metadataDetails) metadataDetails.open = true;
        setStatus('No confident match found. You can enter the release details manually.', 'empty');
        setCoverPreviewMessage('No release artwork yet. You can add it later in Edit listing.', 'empty');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (metadataDetails) metadataDetails.open = true;
      setStatus('Discogs is temporarily unavailable. You can still enter the details manually.', 'error');
      setCoverPreviewMessage('Discogs is temporarily unavailable. You can add release artwork later in Edit listing.', 'error');
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

  async function enrichSelectedEditionArtwork(metadata, candidateTitle) {
    var externalId = typeof metadata.discogsExternalId === 'string' ? metadata.discogsExternalId : '';
    if (!/^\\d{1,15}$/.test(externalId)) return;

    lookupSequence += 1;
    var sequence = lookupSequence;
    if (activeController) activeController.abort();
    activeController = new AbortController();

    setLookupPending(true);
    setStatus('Selected ' + candidateTitle + '. Retrieving artwork for this exact Discogs edition…', 'searching');
    setCoverPreviewMessage('Retrieving artwork for the selected Discogs edition…', 'searching');

    try {
      var params = new URLSearchParams({ discogsExternalId: externalId });
      var response = await fetch('/releases/lookup-artwork?' + params.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: activeController.signal,
        credentials: 'same-origin'
      });
      if (sequence !== lookupSequence) return;
      if (!response.ok) throw new Error('Discogs artwork lookup unavailable');

      var result = await response.json();
      if (sequence !== lookupSequence) return;
      var selectedReleaseId = getField('discogsExternalId');
      if (!selectedReleaseId || selectedReleaseId.value !== externalId) return;

      if (result && result.found && typeof result.coverArtUrl === 'string' && /^https:\/\//i.test(result.coverArtUrl)) {
        metadata.coverArtUrl = result.coverArtUrl;
        if (coverArtUrlInput) {
          coverArtUrlInput.value = result.coverArtUrl;
          coverArtUrlInput.dataset.discogsFilled = 'true';
          delete coverArtUrlInput.dataset.userEdited;
        }
        updateCoverPreview(result.coverArtUrl, true);
        setStatus('Selected ' + candidateTitle + '. Catalogue artwork found for this edition.', 'found');
      } else {
        updateCoverPreview('', true);
        setCoverPreviewMessage('Discogs has no catalogue artwork for this edition. You can add artwork manually.', 'missing');
        setStatus('Selected ' + candidateTitle + '. No catalogue artwork is available; you can add it manually.', 'empty');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (sequence !== lookupSequence) return;
      var currentReleaseId = getField('discogsExternalId');
      if (!currentReleaseId || currentReleaseId.value !== externalId) return;
      updateCoverPreview('', true);
      setCoverPreviewMessage('Artwork for this edition could not be retrieved. Manual artwork remains available.', 'error');
      setStatus('Selected ' + candidateTitle + '; Discogs artwork could not be retrieved. You can continue manually.', 'error');
    } finally {
      finishLookup(sequence);
    }
  }

  function scheduleLookup() {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    if (activeController) activeController.abort();
    // A submit requested for the previous selection must not auto-submit a new lookup.
    submitAfterLookup = false;
    lookupSequence += 1;
    var sequence = lookupSequence;
    setLookupPending(true);
    setStatus('Waiting for artist and title…', 'idle');
    setCoverPreviewMessage('Waiting for the release lookup…', 'idle');
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