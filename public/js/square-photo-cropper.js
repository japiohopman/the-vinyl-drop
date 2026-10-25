(() => {
  const form = document.querySelector('form[action$="/photos"][enctype="multipart/form-data"]');
  if (!(form instanceof HTMLFormElement)) return;

  const fileInput = form.querySelector('#photoFile');
  const roleSelect = form.querySelector('#newPhotoRole');
  const roleGuidance = form.querySelector('#photo-role-guidance');
  const selectionPreview = form.querySelector('#photo-selection-preview');
  const fileInfo = form.querySelector('#selected-photo-info');
  const originalPreview = form.querySelector('#photo-original-preview');
  const cropper = form.querySelector('#square-cover-cropper');
  const sourceCanvas = form.querySelector('#square-cover-source');
  const resultCanvas = form.querySelector('#square-cover-result');
  const zoomControl = form.querySelector('#square-cover-zoom');
  const positionControl = form.querySelector('#square-cover-position');
  const cropTitle = form.querySelector('#square-cover-title');
  const cropDescription = form.querySelector('#square-cover-description');
  const status = form.querySelector('#square-cover-status');

  if (!(fileInput instanceof HTMLInputElement) ||
      !(roleSelect instanceof HTMLSelectElement) ||
      !(roleGuidance instanceof HTMLElement) ||
      !(selectionPreview instanceof HTMLElement) ||
      !(fileInfo instanceof HTMLElement) ||
      !(originalPreview instanceof HTMLImageElement) ||
      !(cropper instanceof HTMLElement) ||
      !(sourceCanvas instanceof HTMLCanvasElement) ||
      !(resultCanvas instanceof HTMLCanvasElement) ||
      !(zoomControl instanceof HTMLInputElement) ||
      !(positionControl instanceof HTMLInputElement) ||
      !(cropTitle instanceof HTMLElement) ||
      !(cropDescription instanceof HTMLElement) ||
      !(status instanceof HTMLElement)) return;

  const sourceContext = sourceCanvas.getContext('2d');
  const resultContext = resultCanvas.getContext('2d');
  if (!sourceContext || !resultContext) return;

  let image = null;
  let objectUrl = null;
  let sourceFile = null;
  let processing = false;
  let previewError = false;
  let previewSequence = 0;
  const maxUploadBytes = 5 * 1024 * 1024;

  function isCoverRole() {
    return roleSelect.value === 'front_cover' || roleSelect.value === 'back_cover';
  }

  function coverSideLabel() {
    return roleSelect.value === 'front_cover' ? 'front cover' : 'back cover';
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? 'var(--color-error-border)' : 'var(--color-ink-muted)';
  }

  function updateRoleGuidance() {
    const selectedOption = roleSelect.options[roleSelect.selectedIndex];
    const roleHint = selectedOption && selectedOption.dataset.guidance;
    roleGuidance.textContent = roleHint || 'Choose a photo type first. Front and back covers show a square crop preview; other photo types keep their original framing.';

    if (isCoverRole()) {
      const side = coverSideLabel();
      cropTitle.textContent = 'Square ' + side + ' crop';
      cropDescription.textContent = 'Adjust the crop until the complete ' + side + ' fits inside the square. The square preview is the image that will be saved for Crate Dig.';
    }
  }

  function clearCanvas(canvas, context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function clearPreview() {
    previewSequence += 1;
    processing = false;
    previewError = false;
    cropper.hidden = true;
    selectionPreview.hidden = true;
    originalPreview.hidden = true;
    originalPreview.removeAttribute('src');
    fileInfo.textContent = '';
    image = null;
    sourceFile = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    clearCanvas(sourceCanvas, sourceContext);
    clearCanvas(resultCanvas, resultContext);
  }

  function formatFileSize(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + ' MiB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KiB';
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
    if (!image || !isCoverRole()) return;
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
      ? 'The source is already square. Check that the whole sleeve is visible.'
      : crop.width < crop.height
        ? 'Move the slider vertically to position the square along the full sleeve.'
        : 'Move the slider horizontally to position the square over the full sleeve.');
  }

  function preparePreview() {
    clearPreview();
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    sourceFile = file;
    selectionPreview.hidden = false;
    fileInfo.textContent = file.name + ' · ' + formatFileSize(file.size);
    const coverRole = isCoverRole();
    cropper.hidden = !coverRole;

    if (file.size > maxUploadBytes) {
      fileInfo.textContent += ' — larger than 5 MiB. Choose a smaller file.';
      fileInfo.style.color = 'var(--color-error-border)';
      if (coverRole) setStatus('Choose a photo no larger than 5 MiB.', true);
      return;
    }
    fileInfo.style.color = 'var(--color-ink-muted)';

    const currentSequence = previewSequence;
    const currentUrl = URL.createObjectURL(file);
    objectUrl = currentUrl;
    const previewImage = new Image();
    image = previewImage;
    if (coverRole) setStatus('Preparing the square crop preview…');

    previewImage.onload = () => {
      if (previewSequence !== currentSequence || image !== previewImage || objectUrl !== currentUrl) return;
      fileInfo.textContent = file.name + ' · ' + formatFileSize(file.size) + ' · ' +
        previewImage.naturalWidth + ' × ' + previewImage.naturalHeight + ' px';
      if (coverRole) {
        redraw();
      } else {
        originalPreview.src = currentUrl;
        originalPreview.hidden = false;
      }
    };
    previewImage.onerror = () => {
      if (previewSequence !== currentSequence || image !== previewImage) return;
      image = null;
      previewError = true;
      fileInfo.textContent = file.name + ' — this image could not be previewed. Choose a JPEG, PNG or WebP file.';
      fileInfo.style.color = 'var(--color-error-border)';
      if (coverRole) setStatus('This image cannot be previewed. Choose a JPEG, PNG or WebP file.', true);
    };
    previewImage.src = currentUrl;
  }

  fileInput.addEventListener('change', () => {
    delete form.dataset.squareCropReady;
    preparePreview();
  });

  roleSelect.addEventListener('change', () => {
    delete form.dataset.squareCropReady;
    updateRoleGuidance();
    preparePreview();
  });

  zoomControl.addEventListener('input', redraw);
  positionControl.addEventListener('input', redraw);

  form.addEventListener('submit', (event) => {
    if (sourceFile && sourceFile.size > maxUploadBytes) {
      event.preventDefault();
      if (isCoverRole()) {
        setStatus('Choose a photo no larger than 5 MiB.', true);
      } else {
        fileInfo.textContent = sourceFile.name + ' — larger than 5 MiB. Choose a smaller file.';
        fileInfo.style.color = 'var(--color-error-border)';
      }
      return;
    }
    if (!isCoverRole() || form.dataset.squareCropReady === 'true') return;
    if (previewError) {
      event.preventDefault();
      setStatus('This photo cannot be previewed. Choose a valid JPEG, PNG or WebP file.', true);
      return;
    }
    if (!image || !sourceFile || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      event.preventDefault();
      setStatus(
        image && sourceFile
          ? 'Wait for the photo preview to finish loading before uploading.'
          : 'Select a photo and review the square crop preview before uploading.',
        true
      );
      return;
    }
    event.preventDefault();
    if (processing) return;
    processing = true;
    setStatus('Preparing the square image…');
    const cropSequence = previewSequence;
    const cropSource = sourceFile;
    const cropImage = image;
    const cropRole = roleSelect.value;
    const crop = cropGeometry();
    const output = document.createElement('canvas');
    output.width = 1024;
    output.height = 1024;
    const context = output.getContext('2d');
    if (!context) {
      processing = false;
      setStatus('The crop cannot be created in this browser.', true);
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(cropImage, crop.left, crop.top, crop.side, crop.side, 0, 0, output.width, output.height);
    output.toBlob((blob) => {
      // A new selection/role invalidates work started for the previous photo.
      if (previewSequence !== cropSequence || sourceFile !== cropSource ||
          image !== cropImage || roleSelect.value !== cropRole) return;

      if (!blob) {
        processing = false;
        setStatus('The square image could not be created. Try a different photo.', true);
        return;
      }
      const stem = cropSource.name.replace(/\.[^.]+$/, '') || 'album-cover';
      const croppedFile = new File([blob], stem + '-' + cropRole + '-square.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now()
      });
      const transfer = new DataTransfer();
      transfer.items.add(croppedFile);
      fileInput.files = transfer.files;
      form.dataset.squareCropReady = 'true';
      processing = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      form.requestSubmit();
    }, 'image/jpeg', 0.92);
  });

  // Open a single focused upload dialog from the matching front/back slot.
  const uploadDialog = document.querySelector('#photoUploadDialog');
  const helpDialog = document.querySelector('#photoHelpDialog');
  const uploadTitle = document.querySelector('#photoUploadTitle');
  const altTextInput = form.querySelector('#altText');
  const roleField = form.querySelector('.photo-role-field');

  function openAccessibleDialog(dialog) {
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeAccessibleDialog(dialog) {
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  document.querySelectorAll('[data-open-photo-upload]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (!(trigger instanceof HTMLButtonElement) ||
          !(uploadDialog instanceof HTMLDialogElement)) return;

      const requestedRole = trigger.dataset.photoRole || '';
      const label = trigger.dataset.photoLabel || 'Additional photo';
      const isDirectCoverSlot = requestedRole === 'front_cover' || requestedRole === 'back_cover';
      if (roleField instanceof HTMLElement) roleField.hidden = isDirectCoverSlot;
      roleSelect.value = requestedRole === 'optional' ? '' : requestedRole;
      fileInput.value = '';
      if (altTextInput instanceof HTMLInputElement) altTextInput.value = '';
      delete form.dataset.squareCropReady;
      updateRoleGuidance();
      preparePreview();

      if (uploadTitle instanceof HTMLElement) {
        uploadTitle.textContent = requestedRole === 'optional'
          ? 'Add an additional photo'
          : 'Upload ' + label.toLowerCase();
      }
      openAccessibleDialog(uploadDialog);
      if (isDirectCoverSlot) {
        fileInput.focus();
      } else {
        roleSelect.focus();
      }
    });
  });

  document.querySelectorAll('[data-close-photo-upload]').forEach((trigger) => {
    trigger.addEventListener('click', () => closeAccessibleDialog(uploadDialog));
  });

  document.querySelectorAll('[data-open-photo-help]').forEach((trigger) => {
    trigger.addEventListener('click', () => openAccessibleDialog(helpDialog));
  });

  document.querySelectorAll('[data-close-photo-help]').forEach((trigger) => {
    trigger.addEventListener('click', () => closeAccessibleDialog(helpDialog));
  });

  [uploadDialog, helpDialog].forEach((dialog) => {
    if (!(dialog instanceof HTMLDialogElement)) return;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeAccessibleDialog(dialog);
    });
  });

  if (uploadDialog instanceof HTMLDialogElement &&
      uploadDialog.dataset.openOnLoad === 'true') {
    openAccessibleDialog(uploadDialog);
    roleSelect.focus();
  }

  updateRoleGuidance();

  // Warn about old portrait cover images because the new crop is not retroactive.
  document.querySelectorAll('.listing-photo-card[data-photo-role]').forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    const role = card.getAttribute('data-photo-role');
    const photoImage = card.querySelector('.listing-photo-image');
    const warning = card.querySelector('.listing-photo-square-warning');
    if (!(photoImage instanceof HTMLImageElement) || !(warning instanceof HTMLElement)) return;
    if (role !== 'front_cover' && role !== 'back_cover') return;

    const checkSquare = () => {
      if (photoImage.naturalWidth > 0 && photoImage.naturalHeight > 0 &&
          photoImage.naturalWidth !== photoImage.naturalHeight) {
        const side = role === 'front_cover' ? 'front-cover' : 'back-cover';
        warning.textContent = 'This saved ' + side + ' photo is not square. Delete it and upload it again with the same role to use the crop preview.';
        warning.hidden = false;
      }
    };
    photoImage.addEventListener('load', checkSquare);
    if (photoImage.complete) checkSquare();
  });
})();
