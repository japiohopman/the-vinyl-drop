(() => {
  const form = document.querySelector('form[action$="/photos"][enctype="multipart/form-data"]');
  if (!(form instanceof HTMLFormElement)) return;

  const fileInput = form.querySelector('#photoFile');
  const roleSelect = form.querySelector('#newPhotoRole');
  const cropper = document.querySelector('#square-cover-cropper');
  const sourceCanvas = document.querySelector('#square-cover-source');
  const resultCanvas = document.querySelector('#square-cover-result');
  const zoomControl = document.querySelector('#square-cover-zoom');
  const positionControl = document.querySelector('#square-cover-position');
  const status = document.querySelector('#square-cover-status');

  if (!(fileInput instanceof HTMLInputElement) ||
      !(roleSelect instanceof HTMLSelectElement) ||
      !(cropper instanceof HTMLElement) ||
      !(sourceCanvas instanceof HTMLCanvasElement) ||
      !(resultCanvas instanceof HTMLCanvasElement) ||
      !(zoomControl instanceof HTMLInputElement) ||
      !(positionControl instanceof HTMLInputElement) ||
      !(status instanceof HTMLElement)) return;

  const sourceContext = sourceCanvas.getContext('2d');
  const resultContext = resultCanvas.getContext('2d');
  if (!sourceContext || !resultContext) return;

  let image = null;
  let objectUrl = null;
  let sourceFile = null;
  let processing = false;
  const maxUploadBytes = 5 * 1024 * 1024;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? 'var(--color-error-border)' : 'var(--color-ink-muted)';
  }

  function clearCropper() {
    cropper.hidden = true;
    image = null;
    sourceFile = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  }

  function cropGeometry() {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const baseSide = Math.min(width, height);
    const side = Math.max(1, Math.round(baseSide * Number(zoomControl.value) / 100));
    const position = Number(positionControl.value) / 100;
    return {
      left: width > height ? Math.round((width - side) * position) : Math.round((width - side) / 2),
      top: height > width ? Math.round((height - side) * position) : Math.round((height - side) / 2),
      side,
      width,
      height
    };
  }

  function redraw() {
    if (!image) return;
    const maxPreview = 320;
    const scale = Math.min(maxPreview / image.naturalWidth, maxPreview / image.naturalHeight, 1);
    sourceCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    sourceCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);

    const crop = cropGeometry();
    const x = crop.left * scale;
    const y = crop.top * scale;
    const side = crop.side * scale;

    sourceContext.fillStyle = 'rgba(0, 0, 0, 0.45)';
    sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceContext.clearRect(x, y, side, side);
    sourceContext.drawImage(image, crop.left, crop.top, crop.side, crop.side, x, y, side, side);
    sourceContext.strokeStyle = '#f60f4b';
    sourceContext.lineWidth = Math.max(2, 3 * scale);
    sourceContext.strokeRect(x + 1, y + 1, side - 2, side - 2);

    resultContext.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultContext.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, resultCanvas.width, resultCanvas.height);
    positionControl.disabled = crop.width === crop.height;
    setStatus(crop.width === crop.height
      ? 'De bron is al vierkant. Controleer of alle randen van de hoes zichtbaar zijn.'
      : crop.width < crop.height
        ? 'Schuif verticaal om de volledige hoes in het vierkant te plaatsen.'
        : 'Schuif horizontaal om de volledige hoes in het vierkant te plaatsen.');
  }

  function preparePreview() {
    if (roleSelect.value !== 'front_cover') {
      clearCropper();
      return;
    }
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      clearCropper();
      return;
    }
    if (file.size > maxUploadBytes) {
      clearCropper();
      cropper.hidden = false;
      setStatus('Kies eerst een foto van maximaal 5 MiB.', true);
      return;
    }
    sourceFile = file;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    image = new Image();
    image.onload = redraw;
    image.onerror = () => {
      image = null;
      cropper.hidden = false;
      setStatus('Deze foto kan niet worden voorvertoond. Kies een JPEG-, PNG- of WebP-foto.', true);
    };
    cropper.hidden = false;
    image.src = objectUrl;
  }

  fileInput.addEventListener('change', () => {
    delete form.dataset.squareCropReady;
    preparePreview();
  });
  roleSelect.addEventListener('change', preparePreview);
  zoomControl.addEventListener('input', redraw);
  positionControl.addEventListener('input', redraw);

  form.addEventListener('submit', (event) => {
    if (roleSelect.value !== 'front_cover' || form.dataset.squareCropReady === 'true') return;
    if (!image || !sourceFile) {
      event.preventDefault();
      setStatus('Selecteer een foto en bekijk de vierkante uitsnede voordat je uploadt.', true);
      return;
    }
    event.preventDefault();
    if (processing) return;
    processing = true;
    setStatus('Vierkante foto voorbereiden…');
    const crop = cropGeometry();
    const output = document.createElement('canvas');
    output.width = 1024;
    output.height = 1024;
    const context = output.getContext('2d');
    if (!context) {
      processing = false;
      setStatus('De uitsnede kan niet worden gemaakt in deze browser.', true);
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, output.width, output.height);
    output.toBlob((blob) => {
      if (!blob) {
        processing = false;
        setStatus('De vierkante foto kon niet worden gemaakt. Probeer een andere foto.', true);
        return;
      }
      const stem = sourceFile.name.replace(/\.[^.]+$/, '') || 'album-cover';
      const croppedFile = new File([blob], stem + '-square.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      fileInput.files = transfer.files;
      form.dataset.squareCropReady = 'true';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      form.requestSubmit();
    }, 'image/jpeg', 0.92);
  });

  roleSelect.addEventListener('change', () => {
    delete form.dataset.squareCropReady;
  });
})();