(() => {
  const sidebar = document.querySelector('[data-dig-sidebar]');
  if (!(sidebar instanceof HTMLElement)) return;

  const drawerTriggers = Array.from(document.querySelectorAll('[data-dig-drawer-open]'))
    .filter((element) => element instanceof HTMLButtonElement);
  const drawerCloseTrigger = sidebar.querySelector('[data-dig-drawer-close]');
  const tabRecords = document.getElementById('tab-records');
  const tabPeople = document.getElementById('tab-people');
  const panelRecords = document.getElementById('panel-records');
  const panelPeople = document.getElementById('panel-people');

  const peopleForm = sidebar.querySelector('[data-dig-people-form]');
  const peopleInput = sidebar.querySelector('[data-dig-people-input]');
  const peopleStatus = sidebar.querySelector('#dig-people-status');
  const peopleResultsContainer = sidebar.querySelector('[data-dig-people-results]');

  const drawerMedia = window.matchMedia('(max-width: 1023px)');
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let backdrop = null;
  let activeTrigger = null;
  let previousFocus = null;
  let previousBodyOverflow = '';
  let debounceTimer = null;
  let activeSearchController = null;

  function getFocusableElements() {
    return Array.from(sidebar.querySelectorAll(focusableSelector)).filter((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.tabIndex < 0) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  function syncDrawerViewport() {
    if (!sidebar.classList.contains('is-drawer-open') || !drawerMedia.matches || !window.visualViewport) {
      sidebar.style.removeProperty('--dig-sidebar-viewport-top');
      sidebar.style.removeProperty('--dig-sidebar-viewport-height');
      return;
    }

    const viewport = window.visualViewport;
    sidebar.style.setProperty('--dig-sidebar-viewport-top', Math.max(0, viewport.offsetTop) + 'px');
    sidebar.style.setProperty('--dig-sidebar-viewport-height', Math.max(0, viewport.height) + 'px');
  }

  function closeDrawer(options = {}) {
    const restoreFocus = options.restoreFocus !== false;
    if (!sidebar.classList.contains('is-drawer-open')) return;

    sidebar.classList.remove('is-drawer-open');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.removeAttribute('aria-label');
    sidebar.removeAttribute('tabindex');
    sidebar.style.removeProperty('--dig-sidebar-viewport-top');
    sidebar.style.removeProperty('--dig-sidebar-viewport-height');

    drawerTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', 'false'));
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = previousBodyOverflow;

    if (restoreFocus) {
      const target = activeTrigger?.isConnected && activeTrigger.getClientRects().length > 0
        ? activeTrigger
        : previousFocus;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    }
    activeTrigger = null;
    previousFocus = null;
  }

  function openDrawer(trigger) {
    if (!drawerMedia.matches || sidebar.classList.contains('is-drawer-open')) return;

    activeTrigger = trigger instanceof HTMLElement ? trigger : drawerTriggers[0] || null;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;

    sidebar.classList.add('is-drawer-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'Dig navigation, people and filters');
    sidebar.setAttribute('tabindex', '-1');
    drawerTriggers.forEach((item) => item.setAttribute('aria-expanded', 'true'));

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'dig-drawer-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.addEventListener('click', () => closeDrawer());
      document.body.appendChild(backdrop);
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    syncDrawerViewport();

    if (drawerCloseTrigger instanceof HTMLElement) drawerCloseTrigger.focus();
    else sidebar.focus();
  }

  drawerTriggers.forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => openDrawer(trigger));
  });

  if (drawerCloseTrigger instanceof HTMLElement) {
    drawerCloseTrigger.addEventListener('click', () => closeDrawer());
  }

  document.addEventListener('keydown', (event) => {
    if (!sidebar.classList.contains('is-drawer-open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      sidebar.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !sidebar.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !sidebar.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', syncDrawerViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncDrawerViewport);
    window.visualViewport.addEventListener('scroll', syncDrawerViewport);
  }
  if (typeof drawerMedia.addEventListener === 'function') {
    drawerMedia.addEventListener('change', (event) => {
      if (!event.matches) closeDrawer({ restoreFocus: false });
    });
  }

  function switchTab(target, focusPeopleSearch = true) {
    if (!(tabRecords instanceof HTMLButtonElement) ||
        !(tabPeople instanceof HTMLButtonElement) ||
        !(panelRecords instanceof HTMLElement) ||
        !(panelPeople instanceof HTMLElement)) return;

    const recordsActive = target === 'records';
    tabRecords.setAttribute('aria-selected', String(recordsActive));
    tabRecords.classList.toggle('is-active', recordsActive);
    tabRecords.tabIndex = recordsActive ? 0 : -1;
    tabPeople.setAttribute('aria-selected', String(!recordsActive));
    tabPeople.classList.toggle('is-active', !recordsActive);
    tabPeople.tabIndex = recordsActive ? -1 : 0;
    panelRecords.hidden = !recordsActive;
    panelRecords.classList.toggle('is-active', recordsActive);
    panelPeople.hidden = recordsActive;
    panelPeople.classList.toggle('is-active', !recordsActive);

    if (!recordsActive && focusPeopleSearch && peopleInput instanceof HTMLInputElement) {
      peopleInput.focus();
    }
  }

  if (tabRecords instanceof HTMLButtonElement && tabPeople instanceof HTMLButtonElement) {
    tabRecords.addEventListener('click', (event) => {
      event.preventDefault();
      switchTab('records');
      tabRecords.focus();
    });
    tabPeople.addEventListener('click', (event) => {
      event.preventDefault();
      switchTab('people');
    });

    [tabRecords, tabPeople].forEach((tab, index, tabs) => {
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
        switchTab(nextIndex === 0 ? 'records' : 'people', false);
        tabs[nextIndex].focus();
      });
    });
  }

  function renderPeopleResults(people, totalCount) {
    if (!(peopleResultsContainer instanceof HTMLElement) || !(peopleStatus instanceof HTMLElement)) return;
    peopleResultsContainer.replaceChildren();

    if (!Array.isArray(people) || people.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'dig-people-prompt';
      emptyMessage.textContent = 'No collectors matched this search.';
      peopleResultsContainer.appendChild(emptyMessage);
      peopleStatus.textContent = 'No matching collectors found.';
      return;
    }

    const list = document.createElement('div');
    list.className = 'dig-people-list';

    people.forEach((person) => {
      if (!person || typeof person.username !== 'string' || !person.username) return;

      const card = document.createElement('a');
      card.className = 'dig-people-card';
      card.href = '/profiles/' + encodeURIComponent(person.username);

      const avatar = document.createElement('div');
      avatar.className = 'dig-people-avatar';
      if (typeof person.avatarUrl === 'string' && /^https:\/\//i.test(person.avatarUrl)) {
        const img = document.createElement('img');
        img.src = person.avatarUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        avatar.appendChild(img);
      } else {
        const label = typeof person.displayName === 'string' && person.displayName
          ? person.displayName : person.username;
        avatar.textContent = label.charAt(0).toUpperCase();
      }

      const info = document.createElement('div');
      info.className = 'dig-people-info';

      const name = document.createElement('span');
      name.className = 'dig-people-name';
      name.textContent = typeof person.displayName === 'string' && person.displayName
        ? person.displayName : person.username;

      const username = document.createElement('span');
      username.className = 'dig-people-username';
      username.textContent = '@' + person.username;

      info.appendChild(name);
      info.appendChild(username);
      card.appendChild(avatar);
      card.appendChild(info);
      list.appendChild(card);
    });

    peopleResultsContainer.appendChild(list);
    const safeTotal = Number.isFinite(totalCount) && totalCount > 0 ? totalCount : people.length;
    peopleStatus.textContent = 'Found ' + safeTotal + ' matching ' +
      (safeTotal === 1 ? 'collector.' : 'collectors.');
  }

  async function performPeopleSearch(query) {
    if (!(peopleStatus instanceof HTMLElement) ||
        !(peopleResultsContainer instanceof HTMLElement)) return;

    if (activeSearchController) activeSearchController.abort();
    activeSearchController = new AbortController();

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      peopleStatus.textContent = 'Enter at least 2 characters to search.';
      peopleResultsContainer.replaceChildren();
      const prompt = document.createElement('p');
      prompt.className = 'dig-people-prompt';
      prompt.textContent = 'Find community members without leaving Dig.';
      peopleResultsContainer.appendChild(prompt);
      return;
    }

    peopleStatus.textContent = 'Searching collectors…';
    try {
      const response = await fetch('/api/people-search?q=' + encodeURIComponent(trimmed), {
        signal: activeSearchController.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      renderPeopleResults(data.people || [], data.pagination?.totalCount ?? data.people?.length ?? 0);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      peopleResultsContainer.replaceChildren();
      peopleStatus.textContent = 'Unable to search people at this time.';
    }
  }

  if (peopleForm instanceof HTMLFormElement &&
      peopleInput instanceof HTMLInputElement &&
      peopleStatus instanceof HTMLElement &&
      peopleResultsContainer instanceof HTMLElement) {
    peopleInput.addEventListener('input', () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => performPeopleSearch(peopleInput.value), 250);
    });

    peopleForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (debounceTimer) window.clearTimeout(debounceTimer);
      performPeopleSearch(peopleInput.value);
    });
  }
})();
