(() => {
  const form = document.querySelector('form[action$="/photos"][enctype="multipart/form-data"]');
  if (!(form instanceof HTMLFormElement)) return;

  const core = window.TVDPhotoEditorCore;
  const fileInput = form.querySelector('#photoFile');
  const originalFileInput = form.querySelector('#photoOriginalFile');
  const editorStateInput = form.querySelector('#photoEditorState');
  const editorSourceNotice = form.querySelector('#photo-editor-source-notice');
  const roleSelect = form.querySelector('#newPhotoRole');
  const roleGuidance = form.querySelector('#photo-role-guidance');
  const selectionPreview = form.querySelector('#photo-selection-preview');
  const fileInfo = form.querySelector('#selected-photo-info');
  const originalPreview = form.querySelector('#photo-original-preview');
  const cropper = form.querySelector('#square-cover-cropper');
  const sourceStage = form.querySelector('#square-cover-source-stage');
  const sourceCanvas = form.querySelector('#square-cover-source');
  const overlay = form.querySelector('#square-cover-overlay');
  const shade = form.querySelector('#square-cover-shade');
  const polygon = form.querySelector('#square-cover-polygon');
  const resultCanvas = form.querySelector('#square-cover-result');
  const magnifier = form.querySelector('#square-cover-magnifier');
  const magnifierCanvas = form.querySelector('#square-cover-magnifier-canvas');
  const histogramCanvas = form.querySelector('#square-cover-histogram');
  const cropTitle = form.querySelector('#square-cover-title');
  const cropDescription = form.querySelector('#square-cover-description');
  const status = form.querySelector('#square-cover-status');
  const handles = Array.from(form.querySelectorAll('[data-corner-handle]'));
  const beforeAfterButton = form.querySelector('[data-toggle-photo-before-after]');
  const undoButton = form.querySelector('[data-photo-editor-undo]');
  const redoButton = form.querySelector('[data-photo-editor-redo]');
  const resetButton = form.querySelector('[data-photo-editor-reset]');
  const adjustmentControls = Array.from(form.querySelectorAll('[data-photo-adjustment]'));

  if (!core || !(fileInput instanceof HTMLInputElement) ||
      !(originalFileInput instanceof HTMLInputElement) ||
      !(editorStateInput instanceof HTMLInputElement) ||
      !(editorSourceNotice instanceof HTMLElement) ||
      !(roleSelect instanceof HTMLSelectElement) ||
      !(roleGuidance instanceof HTMLElement) ||
      !(selectionPreview instanceof HTMLElement) ||
      !(fileInfo instanceof HTMLElement) ||
      !(originalPreview instanceof HTMLImageElement) ||
      !(cropper instanceof HTMLElement) ||
      !(sourceStage instanceof HTMLElement) ||
      !(sourceCanvas instanceof HTMLCanvasElement) ||
      !(overlay instanceof SVGElement) ||
      !(shade instanceof SVGPathElement) ||
      !(polygon instanceof SVGPolygonElement) ||
      !(resultCanvas instanceof HTMLCanvasElement) ||
      !(magnifier instanceof HTMLElement) ||
      !(magnifierCanvas instanceof HTMLCanvasElement) ||
      !(histogramCanvas instanceof HTMLCanvasElement) ||
      !(cropTitle instanceof HTMLElement) ||
      !(cropDescription instanceof HTMLElement) ||
      !(status instanceof HTMLElement) ||
      handles.length !== 4 || adjustmentControls.length === 0) return;

  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const resultContext = resultCanvas.getContext('2d');
  const magnifierContext = magnifierCanvas.getContext('2d');
  const histogramContext = histogramCanvas.getContext('2d');
  if (!sourceContext || !resultContext || !magnifierContext || !histogramContext) return;

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const PREVIEW_MAX_DIMENSION = 320;
  const PROCESS_MAX_DIMENSION = 2048;
  const OUTPUT_DIMENSION = 1536;
  const HANDLE_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
  const newUploadAction = form.dataset.newAction || form.getAttribute('action') || form.action;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  let image = null;
  let objectUrl = null;
  let sourceFile = null;
  let points = [];
  let processing = false;
  let previewError = false;
  let previewSequence = 0;
  let previewFrame = 0;
  let activeCorner = -1;
  let dragStartState = null;
  let controlStartState = null;
  let showBefore = false;
  let undoStack = [];
  let redoStack = [];

  function isCoverRole() {
    return roleSelect.value === 'front_cover' || roleSelect.value === 'back_cover';
  }

  function coverSideLabel() {
    return roleSelect.value === 'front_cover' ? 'front cover' : 'back cover';
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.state = isError ? 'error' : 'ready';
  }

  function readAdjustments() {
    const values = { ...core.DEFAULT_ADJUSTMENTS };
    adjustmentControls.forEach((control) => {
      const key = control.dataset.photoAdjustment;
      const value = Number(control.value);
      if (!key || !Number.isFinite(value)) return;
      if (key === 'exposure') values.exposure = value / 50;
      else if (key === 'gamma') values.gamma = value / 100;
      else values[key] = value;
    });
    return values;
  }

  function updateAdjustmentOutputs() {
    adjustmentControls.forEach((control) => {
      const key = control.dataset.photoAdjustment;
      const output = form.querySelector('[data-photo-adjustment-value="' + key + '"]');
      if (!(output instanceof HTMLOutputElement)) return;
      const value = Number(control.value);
      output.value = key === 'exposure'
        ? (value > 0 ? '+' : '') + (value / 50).toFixed(1) + ' EV'
        : key === 'gamma'
          ? (value / 100).toFixed(2)
          : (value > 0 ? '+' : '') + String(value);
    });
  }

  function cloneState() {
    return {
      points: points.map((point) => ({ x: point.x, y: point.y })),
      adjustments: readAdjustments(),
    };
  }

  function statesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function updateHistoryButtons() {
    if (undoButton instanceof HTMLButtonElement) undoButton.disabled = undoStack.length === 0;
    if (redoButton instanceof HTMLButtonElement) redoButton.disabled = redoStack.length === 0;
  }

  function pushUndo(state) {
    if (!state) return;
    if (undoStack.length >= 30) undoStack.shift();
    undoStack.push(state);
    redoStack = [];
    updateHistoryButtons();
  }

  function restoreState(state) {
    points = state.points.map((point) => ({ x: point.x, y: point.y }));
    adjustmentControls.forEach((control) => {
      const key = control.dataset.photoAdjustment;
      if (!key) return;
      const value = state.adjustments[key];
      if (typeof value !== 'number') return;
      control.value = String(key === 'exposure' ? Math.round(value * 50) :
        key === 'gamma' ? Math.round(value * 100) : value);
    });
    showBefore = false;
    if (beforeAfterButton instanceof HTMLButtonElement) {
      beforeAfterButton.setAttribute('aria-pressed', 'false');
      beforeAfterButton.textContent = 'Show before';
    }
    updateAdjustmentOutputs();
    updateOverlay();
    updateHistoryButtons();
    schedulePreview();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(cloneState());
    restoreState(undoStack.pop());
  }

  function redo() {
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    if (undoStack.length >= 30) undoStack.shift();
    undoStack.push(cloneState());
    restoreState(nextState);
  }

  function clearCanvas(canvas, context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function clearPreview() {
    previewSequence += 1;
    delete form.dataset.photoEditorReady;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    processing = false;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    previewError = false;
    cropper.hidden = true;
    selectionPreview.hidden = true;
    originalPreview.hidden = true;
    originalPreview.removeAttribute('src');
    fileInfo.textContent = '';
    image = null;
    sourceFile = null;
    points = [];
    activeCorner = -1;
    dragStartState = null;
    controlStartState = null;
    showBefore = false;
    undoStack = [];
    redoStack = [];
    originalFileInput.value = '';
    if (!form.dataset.editingPhotoId) editorStateInput.value = '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    sourceStage.style.aspectRatio = '';
    clearCanvas(sourceCanvas, sourceContext);
    clearCanvas(resultCanvas, resultContext);
    clearCanvas(magnifierCanvas, magnifierContext);
    clearCanvas(histogramCanvas, histogramContext);
    magnifier.hidden = true;
    overlay.setAttribute('viewBox', '0 0 1 1');
    shade.setAttribute('d', '');
    polygon.setAttribute('points', '');
    handles.forEach((handle) => {
      handle.style.left = '50%';
      handle.style.top = '50%';
      handle.disabled = true;
    });
    updateHistoryButtons();
  }

  function formatFileSize(bytes) {
    return bytes >= 1024 * 1024
      ? (bytes / (1024 * 1024)).toFixed(1) + ' MiB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KiB';
  }

  function updateRoleGuidance() {
    const selectedOption = roleSelect.options[roleSelect.selectedIndex];
    const roleHint = selectedOption && selectedOption.dataset.guidance;
    roleGuidance.textContent = roleHint
      ? roleHint + ' The editor also supports four-corner framing and light/colour adjustments; extra photos keep their natural proportions.'
      : 'Choose a photo type first. The editor supports four-corner framing and light/colour adjustments; cover photos are flattened to a square and extra photos keep their natural proportions.';

    if (isCoverRole()) {
      const side = coverSideLabel();
      cropTitle.textContent = 'Square ' + side + ' correction';
      cropDescription.textContent =
        'Move each corner onto the sleeve edge. The four selected points are flattened into the square preview below.';
    } else {
      cropTitle.textContent = 'Photo framing correction';
      cropDescription.textContent =
        'Move the four corners to frame the visible photo. The corrected image keeps the selected photo proportions.';
    }
  }

  function updateOverlay() {
    if (!image || points.length !== 4) return;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    overlay.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    const inner = points.map((point) => point.x + ',' + point.y).join(' ');
    const innerPath = points.map((point, index) =>
      (index === 0 ? 'M' : 'L') + point.x + ' ' + point.y
    ).join(' ') + ' Z';
    shade.setAttribute('d', 'M0 0H' + width + 'V' + height + 'H0Z ' + innerPath);
    shade.setAttribute('fill-rule', 'evenodd');
    polygon.setAttribute('points', inner);

    handles.forEach((handle, index) => {
      const point = points[index];
      handle.style.left = (point.x / width * 100) + '%';
      handle.style.top = (point.y / height * 100) + '%';
      handle.disabled = false;
      handle.setAttribute('aria-label',
        'Adjust ' + HANDLE_LABELS[index] + ' sleeve corner. Use arrow keys to move; hold Shift for larger steps.');
    });
  }

  function drawMagnifier(index) {
    if (index < 0 || !points[index]) {
      magnifier.hidden = true;
      return;
    }

    const point = points[index];
    const cropSize = 64;
    const half = cropSize / 2;
    clearCanvas(magnifierCanvas, magnifierContext);
    magnifierContext.fillStyle = '#f3efe7';
    magnifierContext.fillRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
    magnifierContext.drawImage(
      sourceCanvas,
      clamp(point.x - half, 0, Math.max(0, sourceCanvas.width - cropSize)),
      clamp(point.y - half, 0, Math.max(0, sourceCanvas.height - cropSize)),
      Math.min(cropSize, sourceCanvas.width),
      Math.min(cropSize, sourceCanvas.height),
      0,
      0,
      magnifierCanvas.width,
      magnifierCanvas.height
    );
    magnifierContext.strokeStyle = '#f60f4b';
    magnifierContext.lineWidth = 1;
    magnifierContext.beginPath();
    magnifierContext.moveTo(magnifierCanvas.width / 2, 0);
    magnifierContext.lineTo(magnifierCanvas.width / 2, magnifierCanvas.height);
    magnifierContext.moveTo(0, magnifierCanvas.height / 2);
    magnifierContext.lineTo(magnifierCanvas.width, magnifierCanvas.height / 2);
    magnifierContext.stroke();
    magnifier.hidden = false;
  }

  function drawHistogram(data) {
    const bins = new Uint32Array(48);
    let maximum = 1;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      const bin = Math.min(bins.length - 1, Math.floor(luminance / 256 * bins.length));
      bins[bin] += 1;
      if (bins[bin] > maximum) maximum = bins[bin];
    }

    clearCanvas(histogramCanvas, histogramContext);
    histogramContext.fillStyle = '#fffdf8';
    histogramContext.fillRect(0, 0, histogramCanvas.width, histogramCanvas.height);
    histogramContext.fillStyle = '#151515';
    const barWidth = histogramCanvas.width / bins.length;
    bins.forEach((count, index) => {
      const barHeight = (count / maximum) * (histogramCanvas.height - 4);
      histogramContext.fillRect(
        Math.floor(index * barWidth),
        histogramCanvas.height - barHeight,
        Math.max(1, Math.ceil(barWidth)),
        barHeight
      );
    });
  }

  function getProcessingDimensions() {
    if (!image) return { width: 2, height: 2 };
    const scale = Math.min(
      PROCESS_MAX_DIMENSION / image.naturalWidth,
      PROCESS_MAX_DIMENSION / image.naturalHeight,
      1
    );
    return {
      width: Math.max(2, Math.round(image.naturalWidth * scale)),
      height: Math.max(2, Math.round(image.naturalHeight * scale)),
    };
  }

  function getOutputDimensions(maximumDimension = OUTPUT_DIMENSION) {
    if (isCoverRole()) return { width: maximumDimension, height: maximumDimension };
    if (points.length !== 4) return { width: maximumDimension, height: maximumDimension };
    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const width = (distance(points[0], points[1]) + distance(points[3], points[2])) / 2;
    const height = (distance(points[0], points[3]) + distance(points[1], points[2])) / 2;
    const aspect = width / Math.max(1, height);
    if (!Number.isFinite(aspect) || aspect <= 0) return { width: maximumDimension, height: maximumDimension };
    return aspect >= 1
      ? { width: maximumDimension, height: Math.max(2, Math.round(maximumDimension / aspect)) }
      : { width: Math.max(2, Math.round(maximumDimension * aspect)), height: maximumDimension };
  }

  function syncEditorState() {
    if (!image || points.length !== 4) return;
    const dimensions = getProcessingDimensions();
    editorStateInput.value = JSON.stringify({
      version: 1,
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      corners: points.map((point) => ({
        x: point.x * dimensions.width / sourceCanvas.width,
        y: point.y * dimensions.height / sourceCanvas.height,
      })),
      adjustments: readAdjustments(),
    });
  }

  function applyStoredEditorState() {
    if (!editorStateInput.value || !image) return false;
    try {
      const state = JSON.parse(editorStateInput.value);
      const dimensions = getProcessingDimensions();
      if (state.version !== 1 || state.sourceWidth !== dimensions.width ||
          state.sourceHeight !== dimensions.height || !Array.isArray(state.corners) ||
          state.corners.length !== 4 || !state.adjustments) return false;
      const restoredPoints = state.corners.map((point) => ({
        x: Number(point.x) * sourceCanvas.width / dimensions.width,
        y: Number(point.y) * sourceCanvas.height / dimensions.height,
      }));
      if (!core.isValidQuad(restoredPoints, sourceCanvas.width, sourceCanvas.height)) return false;
      points = restoredPoints;
      adjustmentControls.forEach((control) => {
        const key = control.dataset.photoAdjustment;
        const value = state.adjustments[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        control.value = String(key === 'exposure' ? value * 50 : key === 'gamma' ? value * 100 : value);
      });
      updateAdjustmentOutputs();
      return true;
    } catch {
      return false;
    }
  }

  function renderPreview() {
    if (!image || !points.length) return;
    try {
      const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

      if (showBefore) {
        clearCanvas(resultCanvas, resultContext);
        resultContext.fillStyle = '#fffdf8';
        resultContext.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
        const scale = Math.min(
          resultCanvas.width / sourceCanvas.width,
          resultCanvas.height / sourceCanvas.height
        );
        const width = sourceCanvas.width * scale;
        const height = sourceCanvas.height * scale;
        resultContext.drawImage(
          sourceCanvas,
          (resultCanvas.width - width) / 2,
          (resultCanvas.height - height) / 2,
          width,
          height
        );
        drawHistogram(source.data);
        syncEditorState();
        setStatus('Original photo — your corner and tonal edits are preserved.');
        return;
      }

      const result = core.rectifyImageData(
        source,
        points,
        resultCanvas.width,
        resultCanvas.height,
        readAdjustments()
      );
      const frame = resultContext.createImageData(result.width, result.height);
      frame.data.set(result.data);
      resultContext.putImageData(frame, 0, 0);
      drawHistogram(result.data);
      updateAdjustmentOutputs();
      syncEditorState();
      setStatus('Preview updated. The saved file will contain these pixel adjustments.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The preview could not be rendered.', true);
    }
  }

  function schedulePreview() {
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      renderPreview();
    });
  }

  function buildProcessingCanvas() {
    const scale = Math.min(
      PROCESS_MAX_DIMENSION / image.naturalWidth,
      PROCESS_MAX_DIMENSION / image.naturalHeight,
      1
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image processing is not available in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const scaledPoints = points.map((point) => ({
      x: point.x * canvas.width / sourceCanvas.width,
      y: point.y * canvas.height / sourceCanvas.height,
    }));

    return { canvas, context, points: scaledPoints };
  }

  async function createUploadFile(originalFile) {
    if (!originalFile || typeof originalFile.name !== 'string') {
      throw new Error('Select a photo before preparing the corrected image.');
    }
    const processingSource = buildProcessingCanvas();
    const source = processingSource.context.getImageData(
      0,
      0,
      processingSource.canvas.width,
      processingSource.canvas.height
    );
    const outputDimensions = getOutputDimensions(OUTPUT_DIMENSION);
    const output = core.rectifyImageData(
      source,
      processingSource.points,
      outputDimensions.width,
      outputDimensions.height,
      readAdjustments()
    );
    const canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The corrected image cannot be created in this browser.');
    const frame = context.createImageData(output.width, output.height);
    frame.data.set(output.data);
    context.putImageData(frame, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('The corrected image could not be encoded. Try another photo.'));
          return;
        }
        const stem = originalFile.name.replace(/\.[^.]+$/, '') || 'album-cover';
        resolve(new File([blob], stem + '-' + roleSelect.value + '-square.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }));
      }, 'image/jpeg', 0.92);
    });
  }

  function preparePreview() {
    clearPreview();
    delete form.dataset.photoEditorReady;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    sourceFile = file;
    if (!form.dataset.editingPhotoId) {
      const originalTransfer = new DataTransfer();
      originalTransfer.items.add(file);
      originalFileInput.files = originalTransfer.files;
    }
    selectionPreview.hidden = false;
    fileInfo.textContent = file.name + ' · ' + formatFileSize(file.size);
    const coverRole = isCoverRole();
    cropper.hidden = false;
    if (!coverRole) updateRoleGuidance();

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      fileInfo.textContent += ' — choose a JPEG, PNG or WebP image.';
      fileInfo.style.color = 'var(--color-error-border)';
      previewError = true;
      setStatus('Choose a JPEG, PNG or WebP image.', true);
      return;
    }

    if (!form.dataset.editingPhotoId && file.size > MAX_UPLOAD_BYTES) {
      fileInfo.textContent += ' — larger than 5 MiB. Choose a smaller file.';
      fileInfo.style.color = 'var(--color-error-border)';
      previewError = true;
      setStatus('Choose a photo no larger than 5 MiB.', true);
      return;
    }
    fileInfo.style.color = 'var(--color-ink-muted)';

    const currentSequence = previewSequence;
    const currentUrl = URL.createObjectURL(file);
    objectUrl = currentUrl;
    const previewImage = new Image();
    image = previewImage;
    setStatus('Preparing your four-corner preview…');

    previewImage.onload = () => {
      if (previewSequence !== currentSequence || image !== previewImage || objectUrl !== currentUrl) return;
      fileInfo.textContent = file.name + ' · ' + formatFileSize(file.size) + ' · ' +
        previewImage.naturalWidth + ' × ' + previewImage.naturalHeight + ' px';

      {
        const scale = Math.min(
          PREVIEW_MAX_DIMENSION / previewImage.naturalWidth,
          PREVIEW_MAX_DIMENSION / previewImage.naturalHeight,
          1
        );
        sourceCanvas.width = Math.max(2, Math.round(previewImage.naturalWidth * scale));
        sourceCanvas.height = Math.max(2, Math.round(previewImage.naturalHeight * scale));
        sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceContext.drawImage(previewImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceStage.style.aspectRatio = sourceCanvas.width + ' / ' + sourceCanvas.height;
        points = core.createDefaultCorners(sourceCanvas.width, sourceCanvas.height);
        if (form.dataset.editingPhotoId) applyStoredEditorState();
        const previewDimensions = getOutputDimensions(512);
        resultCanvas.width = previewDimensions.width;
        resultCanvas.height = previewDimensions.height;
        updateOverlay();
        renderPreview();
        updateHistoryButtons();
      }
    };

    previewImage.onerror = () => {
      if (previewSequence !== currentSequence || image !== previewImage) return;
      image = null;
      previewError = true;
      fileInfo.textContent = file.name + ' — this image could not be previewed. Choose a JPEG, PNG or WebP file.';
      fileInfo.style.color = 'var(--color-error-border)';
      setStatus('This photo cannot be previewed. Choose a JPEG, PNG or WebP file.', true);
    };
    previewImage.src = currentUrl;
  }

  function moveCorner(index, x, y) {
    const candidate = points.map((point) => ({ x: point.x, y: point.y }));
    candidate[index] = {
      x: clamp(x, 0, sourceCanvas.width),
      y: clamp(y, 0, sourceCanvas.height),
    };
    if (!core.isValidQuad(candidate, sourceCanvas.width, sourceCanvas.height)) {
      setStatus('Keep the four corners in order and inside the sleeve outline.', true);
      return false;
    }
    points = candidate;
    updateOverlay();
    schedulePreview();
    return true;
  }

  function pointerPosition(event) {
    const rect = sourceStage.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * sourceCanvas.width / rect.width,
      y: (event.clientY - rect.top) * sourceCanvas.height / rect.height,
    };
  }

  function onPointerMove(event) {
    if (activeCorner < 0 || !image) return;
    const position = pointerPosition(event);
    if (moveCorner(activeCorner, position.x, position.y)) {
      drawMagnifier(activeCorner);
    }
  }

  function onPointerUp() {
    if (activeCorner < 0) return;
    const changed = dragStartState && !statesEqual(dragStartState, cloneState());
    if (changed) pushUndo(dragStartState);
    activeCorner = -1;
    dragStartState = null;
    magnifier.hidden = true;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    updateHistoryButtons();
  }

  handles.forEach((handle, index) => {
    handle.disabled = true;
    handle.addEventListener('pointerdown', (event) => {
      if (!image || !isCoverRole()) return;
      event.preventDefault();
      activeCorner = index;
      dragStartState = cloneState();
      handle.setPointerCapture?.(event.pointerId);
      drawMagnifier(index);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });

    handle.addEventListener('keydown', (event) => {
      const directions = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction || !image) return;
      event.preventDefault();
      const before = cloneState();
      const step = event.shiftKey ? 5 : 1;
      const moved = moveCorner(
        index,
        points[index].x + direction[0] * step,
        points[index].y + direction[1] * step
      );
      if (moved && !statesEqual(before, cloneState())) pushUndo(before);
    });
  });

  adjustmentControls.forEach((control) => {
    control.addEventListener('pointerdown', () => {
      controlStartState = cloneState();
    });
    control.addEventListener('keydown', () => {
      if (!controlStartState) controlStartState = cloneState();
    });
    control.addEventListener('input', () => {
      updateAdjustmentOutputs();
      schedulePreview();
    });
    control.addEventListener('change', () => {
      if (controlStartState && !statesEqual(controlStartState, cloneState())) {
        pushUndo(controlStartState);
      }
      controlStartState = null;
    });
  });

  if (beforeAfterButton instanceof HTMLButtonElement) {
    beforeAfterButton.addEventListener('click', () => {
      showBefore = !showBefore;
      beforeAfterButton.setAttribute('aria-pressed', String(showBefore));
      beforeAfterButton.textContent = showBefore ? 'Show after' : 'Show before';
      schedulePreview();
    });
  }

  if (undoButton instanceof HTMLButtonElement) undoButton.addEventListener('click', undo);
  if (redoButton instanceof HTMLButtonElement) redoButton.addEventListener('click', redo);

  if (resetButton instanceof HTMLButtonElement) {
    resetButton.addEventListener('click', () => {
      if (!image) return;
      pushUndo(cloneState());
      points = core.createDefaultCorners(sourceCanvas.width, sourceCanvas.height);
      adjustmentControls.forEach((control) => {
        const key = control.dataset.photoAdjustment;
        const value = core.DEFAULT_ADJUSTMENTS[key];
        if (typeof value !== 'number') return;
        control.value = String(key === 'exposure' ? value * 50 :
          key === 'gamma' ? value * 100 : value);
      });
      showBefore = false;
      if (beforeAfterButton instanceof HTMLButtonElement) {
        beforeAfterButton.setAttribute('aria-pressed', 'false');
        beforeAfterButton.textContent = 'Show before';
      }
      updateAdjustmentOutputs();
      updateOverlay();
      schedulePreview();
    });
  }

  fileInput.addEventListener('change', preparePreview);

  roleSelect.addEventListener('change', () => {
    updateRoleGuidance();
    preparePreview();
  });

  form.addEventListener('submit', (event) => {
    if (form.dataset.photoEditorReady === 'true') return;

    if (sourceFile && (previewError || (!form.dataset.editingPhotoId && sourceFile.size > MAX_UPLOAD_BYTES))) {
      event.preventDefault();
      if (isCoverRole()) {
        setStatus(
          previewError ? 'This photo cannot be previewed. Choose a valid JPEG, PNG or WebP file.' :
            'Choose a photo no larger than 5 MiB.',
          true
        );
      } else {
        fileInfo.textContent = sourceFile.name + ' — choose a valid image no larger than 5 MiB.';
        fileInfo.style.color = 'var(--color-error-border)';
      }
      return;
    }
    event.preventDefault();
    if (processing) return;
    if (!image || !sourceFile || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      setStatus(
        image && sourceFile
          ? 'Wait for the photo preview to finish loading before uploading.'
          : 'Select a photo and review the four-corner preview before uploading.',
        true
      );
      return;
    }
    if (!core.isValidQuad(points, sourceCanvas.width, sourceCanvas.height)) {
      setStatus('Move the four corners onto the sleeve edges before uploading.', true);
      return;
    }

    processing = true;
    setStatus('Correcting perspective and preparing the full-resolution image…');
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    const cropSequence = previewSequence;
    const cropSource = sourceFile;
    const cropImage = image;
    const cropRole = roleSelect.value;

    createUploadFile(cropSource).then((correctedFile) => {
      // A changed selection or closed dialog invalidates an in-flight encode.
      if (previewSequence !== cropSequence || sourceFile !== cropSource ||
          image !== cropImage || roleSelect.value !== cropRole) return;
      if (correctedFile.size > MAX_UPLOAD_BYTES) {
        throw new Error('The corrected photo exceeds the 5 MiB upload limit. Choose a smaller source image; your original selection is unchanged.');
      }
      const transfer = new DataTransfer();
      transfer.items.add(correctedFile);
      fileInput.files = transfer.files;
      form.dataset.photoEditorReady = 'true';
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      form.requestSubmit();
    }).catch((error) => {
      processing = false;
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      setStatus(error instanceof Error ? error.message : 'The corrected photo could not be created.', true);
    });
  });

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

  function resetPhotoEditorForm() {
    fileInput.value = '';
    originalFileInput.value = '';
    editorStateInput.value = '';
    delete form.dataset.editingPhotoId;
    form.action = newUploadAction;
    roleSelect.required = true;
    const fileTrigger = form.querySelector('.photo-file-trigger');
    if (fileTrigger instanceof HTMLElement) fileTrigger.hidden = false;
    if (roleField instanceof HTMLElement) roleField.hidden = false;
    roleGuidance.hidden = false;
    editorSourceNotice.hidden = true;
    if (altTextInput instanceof HTMLInputElement) {
      altTextInput.value = '';
      altTextInput.placeholder = 'Describe what is visible, e.g. a crease or Side A label';
      altTextInput.required = true;
    }
    if (uploadTitle instanceof HTMLElement) uploadTitle.textContent = 'Upload a photo';
    clearPreview();
    updateRoleGuidance();
  }

  document.querySelectorAll('[data-open-photo-upload]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      if (!(trigger instanceof HTMLButtonElement) ||
          !(uploadDialog instanceof HTMLDialogElement)) return;

      delete form.dataset.editingPhotoId;
      form.action = newUploadAction;
      originalFileInput.value = '';
      editorStateInput.value = '';
      editorSourceNotice.hidden = true;
      const fileTrigger = form.querySelector('.photo-file-trigger');
      if (fileTrigger instanceof HTMLElement) fileTrigger.hidden = false;

      const requestedRole = trigger.dataset.photoRole || '';
      const label = trigger.dataset.photoLabel || 'Additional photo';
      const isDirectCoverSlot = requestedRole === 'front_cover' || requestedRole === 'back_cover';
      if (roleField instanceof HTMLElement) roleField.hidden = isDirectCoverSlot;
      roleGuidance.hidden = isDirectCoverSlot;
      roleSelect.required = true;
      roleSelect.value = requestedRole === 'optional' ? '' : requestedRole;
      fileInput.value = '';
      if (altTextInput instanceof HTMLInputElement) {
        altTextInput.value = '';
        if (requestedRole === 'front_cover') {
          altTextInput.placeholder = 'Front cover of the record sleeve';
          altTextInput.required = false;
        } else if (requestedRole === 'back_cover') {
          altTextInput.placeholder = 'Back cover of the record sleeve';
          altTextInput.required = false;
        } else {
          altTextInput.placeholder = 'Describe what is visible, e.g. a crease or Side A label';
          altTextInput.required = true;
        }
      }
      updateRoleGuidance();
      preparePreview();

      if (uploadTitle instanceof HTMLElement) {
        uploadTitle.textContent = requestedRole === 'optional'
          ? 'Add an additional photo'
          : 'Upload ' + label.toLowerCase();
      }
      openAccessibleDialog(uploadDialog);
      if (isDirectCoverSlot) {
        const fileTrigger = form.querySelector('.photo-file-trigger');
        if (fileTrigger instanceof HTMLElement) fileTrigger.focus();
      } else {
        roleSelect.focus();
      }
    });
  });

  document.querySelectorAll('[data-open-existing-photo-editor]').forEach((trigger) => {
    trigger.addEventListener('click', async () => {
      if (!(trigger instanceof HTMLButtonElement) ||
          !(uploadDialog instanceof HTMLDialogElement) ||
          !trigger.dataset.editorSourceUrl ||
          !trigger.dataset.photoId) return;

      trigger.disabled = true;
      try {
        const sourceResponse = await fetch(trigger.dataset.editorSourceUrl, {
          credentials: 'same-origin',
          headers: { Accept: 'image/webp' },
        });
        if (!sourceResponse.ok) {
          throw new Error(sourceResponse.status === 401 || sourceResponse.status === 403
            ? 'You are not allowed to edit this photo.'
            : 'The private photo source could not be loaded. Please try again.');
        }
        const sourceBlob = await sourceResponse.blob();
        const sourceFileForEdit = new File(
          [sourceBlob],
          'listing-photo-source.webp',
          { type: 'image/webp', lastModified: Date.now() }
        );

        const stateAttribute = trigger.dataset.editorState || '';
        let storedState = '';
        if (stateAttribute && stateAttribute !== '""') {
          try {
            const parsedState = JSON.parse(stateAttribute);
            if (parsedState && typeof parsedState === 'object') storedState = JSON.stringify(parsedState);
          } catch {
            storedState = '';
          }
        }

        form.dataset.editingPhotoId = trigger.dataset.photoId;
        form.action = trigger.dataset.editorSourceUrl.replace(/\/editor-source$/, '/edit');
        roleSelect.value = trigger.dataset.photoRole || '';
        // Existing-photo edits do not submit a role; legacy roles may not have an upload option.
        roleSelect.required = false;
        if (roleField instanceof HTMLElement) roleField.hidden = true;
        roleGuidance.hidden = true;
        editorStateInput.value = storedState;
        originalFileInput.value = '';

        const fileTransfer = new DataTransfer();
        fileTransfer.items.add(sourceFileForEdit);
        fileInput.files = fileTransfer.files;

        if (altTextInput instanceof HTMLInputElement) {
          altTextInput.value = trigger.dataset.photoAltText || '';
          altTextInput.required = false;
        }
        if (uploadTitle instanceof HTMLElement) {
          uploadTitle.textContent = 'Edit ' + (roleSelect.value === 'front_cover'
            ? 'front cover'
            : roleSelect.value === 'back_cover'
              ? 'back cover'
              : 'photo');
        }
        const fileTrigger = form.querySelector('.photo-file-trigger');
        if (fileTrigger instanceof HTMLElement) fileTrigger.hidden = true;

        const isLegacySource = sourceResponse.headers.get('X-Photo-Source-Legacy') === 'true';
        editorSourceNotice.hidden = !isLegacySource;
        if (isLegacySource) {
          editorSourceNotice.textContent =
            'Legacy photo: the starting image is the currently saved display photo. The original camera file was not retained when this photo was first uploaded.';
        }

        preparePreview();
        openAccessibleDialog(uploadDialog);
        const firstHandle = form.querySelector('[data-corner-handle="0"]');
        if (firstHandle instanceof HTMLElement) firstHandle.focus();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The private photo source could not be opened.', true);
        openAccessibleDialog(uploadDialog);
      } finally {
        trigger.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-close-photo-upload]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      closeAccessibleDialog(uploadDialog);
      resetPhotoEditorForm();
    });
  });

  document.querySelectorAll('[data-open-photo-help]').forEach((trigger) => {
    trigger.addEventListener('click', () => openAccessibleDialog(helpDialog));
  });

  document.querySelectorAll('[data-close-photo-help]').forEach((trigger) => {
    trigger.addEventListener('click', () => closeAccessibleDialog(helpDialog));
  });

  if (uploadDialog instanceof HTMLDialogElement) {
    uploadDialog.addEventListener('cancel', () => {
      resetPhotoEditorForm();
    });
  }

  [uploadDialog, helpDialog].forEach((dialog) => {
    if (!(dialog instanceof HTMLDialogElement)) return;
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      closeAccessibleDialog(dialog);
      if (dialog === uploadDialog) {
        resetPhotoEditorForm();
      }
    });
  });

  if (uploadDialog instanceof HTMLDialogElement &&
      uploadDialog.dataset.openOnLoad === 'true') {
    openAccessibleDialog(uploadDialog);
    roleSelect.focus();
  }

  updateRoleGuidance();
  updateHistoryButtons();

  // Older portrait cover photos remain untouched; sellers can replace them safely
  // with a new perspective-corrected upload rather than silently editing storage.
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
        warning.textContent = 'This saved ' + side + ' photo is not square. Upload a corrected replacement to keep the original safe until you choose to remove it.';
        warning.hidden = false;
      }
    };
    photoImage.addEventListener('load', checkSquare);
    if (photoImage.complete) checkSquare();
  });
})();
