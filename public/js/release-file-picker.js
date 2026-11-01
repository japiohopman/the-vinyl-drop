(function () {
  const input = document.getElementById('releaseCoverArt');
  const fileName = document.getElementById('releaseCoverArtFilename');
  const overridePreview = document.querySelector('[data-release-cover-override-preview]');
  const overrideImage = overridePreview ? overridePreview.querySelector('[data-release-cover-override-image]') : null;
  const clearOverrideButton = document.querySelector('[data-clear-release-cover-override]');
  let objectUrl = null;

  if (!(input instanceof HTMLInputElement) || !fileName) return;

  function clearObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clearOverride() {
    input.value = '';
    fileName.textContent = 'No file selected';
    clearObjectUrl();
    if (overrideImage) overrideImage.removeAttribute('src');
    if (overridePreview) overridePreview.hidden = true;
  }

  input.addEventListener('change', function () {
    const selectedFiles = Array.from(input.files || []);
    fileName.textContent = selectedFiles.length
      ? selectedFiles.map((file) => file.name).join(', ')
      : 'No file selected';

    clearObjectUrl();
    if (selectedFiles.length && overrideImage && overridePreview) {
      objectUrl = URL.createObjectURL(selectedFiles[0]);
      overrideImage.src = objectUrl;
      overridePreview.hidden = false;
    } else if (overrideImage && overridePreview) {
      overrideImage.removeAttribute('src');
      overridePreview.hidden = true;
    }
  });

  if (clearOverrideButton) {
    clearOverrideButton.addEventListener('click', clearOverride);
  }

  window.addEventListener('pagehide', clearObjectUrl, { once: true });
})();