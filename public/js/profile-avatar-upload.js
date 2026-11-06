(() => {
  const input = document.getElementById('profile-avatar-file');
  const preview = document.querySelector('[data-profile-avatar-preview]');
  const placeholder = document.querySelector('[data-profile-avatar-placeholder]');
  const fileName = document.querySelector('[data-profile-avatar-file-name]');
  if (!(input instanceof HTMLInputElement) || !(preview instanceof HTMLImageElement)) return;

  let objectUrl = null;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    if (!file) {
      if (fileName) fileName.textContent = 'No new image selected.';
      return;
    }
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) {
      input.setCustomValidity('Choose a JPEG, PNG, WebP or GIF image no larger than 5 MiB.');
      input.reportValidity();
      input.value = '';
      if (fileName) fileName.textContent = 'Unsupported image or file is larger than 5 MiB.';
      return;
    }
    input.setCustomValidity('');
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    preview.hidden = false;
    if (placeholder) placeholder.hidden = true;
    if (fileName) fileName.textContent = file.name + (file.type === 'image/gif' ? ' · animated GIF' : '');
  });
  window.addEventListener('pagehide', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
})();
