(function () {
  const input = document.getElementById('releaseCoverArt');
  const fileName = document.getElementById('releaseCoverArtFilename');
  const overridePreview = document.querySelector('[data-release-cover-override-preview]');
  const overrideImage = overridePreview ? overridePreview.querySelector('[data-release-cover-override-image]') : null;
  const clearOverrideButton = document.querySelector('[data-clear-release-cover-override]');
  let previewSequence = 0;

  if (!(input instanceof HTMLInputElement) || !fileName) return;

  function clearOverride() {
    previewSequence += 1;
    input.value = '';
    fileName.textContent = 'No file selected';
    if (overrideImage) overrideImage.removeAttribute('src');
    if (overridePreview) overridePreview.hidden = true;
  }

  input.addEventListener('change', function () {
    const selectedFiles = Array.from(input.files || []);
    fileName.textContent = selectedFiles.length
      ? selectedFiles.map((file) => file.name).join(', ')
      : 'No file selected';

    previewSequence += 1;
    const currentSequence = previewSequence;
    if (!selectedFiles.length || !overrideImage || !overridePreview) {
      if (overrideImage) overrideImage.removeAttribute('src');
      if (overridePreview) overridePreview.hidden = true;
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', function () {
      if (currentSequence !== previewSequence || typeof reader.result !== 'string') return;
      overrideImage.src = reader.result;
      overridePreview.hidden = false;
    });
    reader.addEventListener('error', function () {
      if (currentSequence !== previewSequence) return;
      overridePreview.hidden = true;
      fileName.textContent = selectedFiles[0].name + ' — preview unavailable';
    });
    reader.readAsDataURL(selectedFiles[0]);
  });

  if (clearOverrideButton) {
    clearOverrideButton.addEventListener('click', clearOverride);
  }
})();