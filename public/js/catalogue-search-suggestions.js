(() => {
  'use strict';
  const MIN_QUERY_LENGTH = 2, MAX_RESULTS = 8, DEBOUNCE_MS = 180;
  const normalize = (value) => value.normalize('NFKD')
    .replace(/\p{M}/gu, '').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\s]+/gu, '');

  function initialize(input) {
    const list = document.getElementById(input.getAttribute('aria-controls') || '');
    const form = input.form;
    const status = document.getElementById('catalogue-suggestions-status-' + input.id);
    const endpoint = input.dataset.suggestionUrl;
    if (!list || !form || !endpoint || input.dataset.catalogueSearchReady === 'true') return;
    input.dataset.catalogueSearchReady = 'true';

    let timer = null, controller = null, sequence = 0, suggestions = [], activeIndex = -1;
    const setStatus = (message) => { if (status) status.textContent = message; };
    const close = () => {
      list.hidden = true;
      list.replaceChildren();
      suggestions = [];
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    };
    const choose = (item) => {
      if (!item || typeof item.query !== 'string') return;
      input.value = item.query;
      close();
      setStatus('Search updated to ' + item.label + '.');
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    };
    const render = () => {
      list.replaceChildren();
      suggestions.forEach((item, index) => {
        const option = document.createElement('li');
        option.id = input.id + '-suggestion-' + index;
        option.className = 'catalogue-suggestion-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
        const label = document.createElement('span');
        label.className = 'catalogue-suggestion-label';
        label.textContent = item.label;
        const kind = document.createElement('span');
        kind.className = 'catalogue-suggestion-kind';
        kind.textContent = item.type;
        option.append(label, kind);
        option.addEventListener('pointerdown', (event) => event.preventDefault());
        option.addEventListener('click', () => choose(item));
        list.append(option);
      });
      list.hidden = suggestions.length === 0;
      input.setAttribute('aria-expanded', suggestions.length > 0 ? 'true' : 'false');
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        input.setAttribute('aria-activedescendant', input.id + '-suggestion-' + activeIndex);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };
    const load = async (query, requestId) => {
      controller = new AbortController();
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('q', query);
        const response = await fetch(url.toString(), {
          method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Catalogue suggestions request failed');
        const payload = await response.json();
        if (requestId !== sequence || !Array.isArray(payload.suggestions)) return;
        suggestions = payload.suggestions
          .filter((item) => item && typeof item.label === 'string' &&
            typeof item.type === 'string' && typeof item.query === 'string')
          .slice(0, MAX_RESULTS);
        activeIndex = -1;
        render();
        setStatus(suggestions.length
          ? suggestions.length + ' catalogue suggestions available.'
          : 'No catalogue suggestions found.');
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        if (requestId !== sequence) return;
        close();
        setStatus('Suggestions are unavailable. Submit your search to continue.');
      }
    };

    input.addEventListener('input', () => {
      sequence += 1;
      const requestId = sequence;
      if (timer !== null) window.clearTimeout(timer);
      if (controller) controller.abort();
      controller = null;
      close();
      const query = input.value.trim();
      if (Array.from(normalize(query)).length < MIN_QUERY_LENGTH) {
        setStatus('');
        return;
      }
      timer = window.setTimeout(() => {
        timer = null;
        void load(query, requestId);
      }, DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!list.hidden) {
          event.preventDefault();
          close();
          setStatus('Suggestions closed.');
        }
        return;
      }
      if (list.hidden || suggestions.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % suggestions.length;
        render();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
        render();
      } else if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        choose(suggestions[activeIndex]);
      }
    });
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!list.contains(document.activeElement)) close();
      }, 120);
    });
  }

  document.querySelectorAll('input[data-catalogue-search-input]').forEach(initialize);
})();
