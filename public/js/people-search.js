(() => {
  const form = document.querySelector('[data-people-search-form]');
  const input = document.querySelector('[data-people-search-input]');
  const suggestions = document.getElementById('people-search-suggestions');
  const status = document.getElementById('people-search-status');

  if (!(form instanceof HTMLFormElement) ||
      !(input instanceof HTMLInputElement) ||
      !(suggestions instanceof HTMLUListElement) ||
      !(status instanceof HTMLElement)) {
    return;
  }

  const MIN_QUERY_LENGTH = 2;
  let debounceHandle = 0;
  let activeRequest = null;

  function suggestionLinks() {
    return Array.from(suggestions.querySelectorAll('a'));
  }

  function hideSuggestions() {
    suggestions.replaceChildren();
    suggestions.hidden = true;
  }

  function renderSuggestions(records) {
    suggestions.replaceChildren();

    records.forEach((record) => {
      if (!record || typeof record.username !== 'string' || !record.username) return;

      const item = document.createElement('li');
      const link = document.createElement('a');
      const identity = document.createElement('span');
      const displayName = document.createElement('strong');
      const username = document.createElement('span');

      link.className = 'people-search-suggestion';
      link.href = '/profiles/' + encodeURIComponent(record.username);

      if (typeof record.avatarUrl === 'string' && /^https:\/\//i.test(record.avatarUrl)) {
        const avatar = document.createElement('img');
        avatar.src = record.avatarUrl;
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.referrerPolicy = 'no-referrer';
        avatar.className = 'people-search-suggestion-avatar';
        link.append(avatar);
      }

      displayName.textContent = typeof record.displayName === 'string' && record.displayName
        ? record.displayName
        : record.username;
      username.textContent = '@' + record.username;
      identity.className = 'people-search-suggestion-identity';
      identity.append(displayName, username);
      link.append(identity);
      item.append(link);
      suggestions.append(item);
    });

    const count = suggestionLinks().length;
    suggestions.hidden = count === 0;
    status.textContent = count
      ? count + (count === 1 ? ' suggestion. Use Tab or the arrow keys to open a profile.' : ' suggestions. Use Tab or the arrow keys to open a profile.')
      : 'No suggestions yet. Press Find people to see matching profiles.';
  }

  async function requestSuggestions(query) {
    if (activeRequest) activeRequest.abort();
    activeRequest = new AbortController();

    try {
      const response = await fetch('/api/people-suggestions?q=' + encodeURIComponent(query), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        signal: activeRequest.signal,
      });

      if (!response.ok) throw new Error('People suggestions request failed.');
      const data = await response.json();
      if (input.value.trim() !== query) return;

      renderSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      hideSuggestions();
      status.textContent = 'Suggestions are temporarily unavailable. You can still submit your search.';
    }
  }

  input.addEventListener('input', () => {
    window.clearTimeout(debounceHandle);
    if (activeRequest) activeRequest.abort();

    const query = input.value.trim();
    hideSuggestions();

    if (Array.from(query).length < MIN_QUERY_LENGTH) {
      status.textContent = query
        ? 'Enter at least two characters to search.'
        : 'Search by public username or display name.';
      return;
    }

    status.textContent = 'Searching public profiles…';
    debounceHandle = window.setTimeout(() => {
      void requestSuggestions(query);
    }, 220);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !suggestions.hidden) {
      event.preventDefault();
      hideSuggestions();
      status.textContent = 'Suggestions closed.';
      return;
    }

    if (event.key === 'ArrowDown' && !suggestions.hidden) {
      const first = suggestionLinks()[0];
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  suggestions.addEventListener('keydown', (event) => {
    const links = suggestionLinks();
    const currentIndex = links.indexOf(document.activeElement);

    if (event.key === 'ArrowDown' && currentIndex >= 0 && currentIndex < links.length - 1) {
      event.preventDefault();
      links[currentIndex + 1].focus();
    } else if (event.key === 'ArrowUp' && currentIndex >= 0) {
      event.preventDefault();
      if (currentIndex === 0) input.focus();
      else links[currentIndex - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideSuggestions();
      input.focus();
      status.textContent = 'Suggestions closed.';
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Node) || form.contains(event.target)) return;
    hideSuggestions();
  });

  form.addEventListener('submit', () => {
    window.clearTimeout(debounceHandle);
    if (activeRequest) activeRequest.abort();
  });
})();
