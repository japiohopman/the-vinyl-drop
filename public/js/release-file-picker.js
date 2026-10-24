(function () {
  const input = document.getElementById('releaseCoverArt');
  const fileName = document.getElementById('releaseCoverArtFilename');

  if (!(input instanceof HTMLInputElement) || !fileName) return;

  input.addEventListener('change', function () {
    const selectedFiles = Array.from(input.files || []);
    fileName.textContent = selectedFiles.length
      ? selectedFiles.map((file) => file.name).join(', ')
      : 'No file selected';
  });
})();
