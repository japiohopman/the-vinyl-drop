(() => {
  // Dig sidebar drawer handling (narrow viewports) and tab switching between Records and People
  const sidebar = document.querySelector('[data-dig-sidebar]');
  const drawerOpenTrigger = document.querySelector('[data-dig-drawer-open]');
  const drawerCloseTrigger = document.querySelector('[data-dig-drawer-close]');

  // Tab buttons
  const tabRecords = document.getElementById('tab-records');
  const tabPeople = document.getElementById('tab-people');
  const panelRecords = document.getElementById('panel-records');
  const panelPeople = document.getElementById('panel-people');

  // People search form elements
  const peopleForm = document.querySelector('[data-dig-people-form]');
  const peopleInput = document.querySelector('[data-dig-people-input]');
  const peopleSuggestions = document.getElementById('dig-people-suggestions');
  const peopleStatus = document.getElementById('dig-people-status');
  const peopleResultsContainer = document.querySelector('[data-dig-people-results]');

  let backdrop = null;

  // 1. Drawer open/close
  function openDrawer() {
    if (!sidebar) return;
    sidebar.classList.add('is-drawer-open');
    if (drawerOpenTrigger) drawerOpenTrigger.setAttribute('aria-expanded', 'true');

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'dig-drawer-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.addEventListener('click', closeDrawer);
      document.body.appendChild(backdrop);
    }
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';

    // Focus on close button or active tab
    if (drawerCloseTrigger) drawerCloseTrigger.focus();
  }

  function closeDrawer() {
    if (!sidebar) return;
    sidebar.classList.remove('is-drawer-open');
    if (drawerOpenTrigger) {
      drawerOpenTrigger.setAttribute('aria-expanded', 'false');
      drawerOpenTrigger.focus();
    }
    if (backdrop) {
      backdrop.hidden = true;
    }
    document.body.style.overflow = '';
  }

  if (drawerOpenTrigger) {
    drawerOpenTrigger.addEventListener('click', openDrawer);
  }
  if (drawerCloseTrigger) {
    drawerCloseTrigger.addEventListener('click', closeDrawer);
  }

  // Close drawer on Escape
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar && sidebar.classList.contains('is-drawer-open')) {
      closeDrawer();
    }
  });

  // 2. Tab switching
  function switchTab(target) {
    if (!tabRecords || !tabPeople || !panelRecords || !panelPeople) return;

    if (target === 'records') {
      tabRecords.setAttribute('aria-selected', 'true');
      tabRecords.classList.add('is-active');
      tabRecords.setAttribute('tabindex', '0');

      tabPeople.setAttribute('aria-selected', 'false');
      tabPeople.classList.remove('is-active');
      tabPeople.setAttribute('tabindex', '-1');

      panelRecords.hidden = false;
      panelRecords.classList.add('is-active');
      panelPeople.hidden = true;
      panelPeople.classList.remove('is-active');
    } else if (target === 'people') {
      tabPeople.setAttribute('aria-selected', 'true');
      tabPeople.classList.add('is-active');
      tabPeople.setAttribute('tabindex', '0');

      tabRecords.setAttribute('aria-selected', 'false');
      tabRecords.classList.remove('is-active');
      tabRecords.setAttribute('tabindex', '-1');

      panelPeople.hidden = false;
      panelPeople.classList.add('is-active');
      panelRecords.hidden = true;
      panelRecords.classList.remove('is-active');

      if (peopleInput) {
        peopleInput.focus();
      }
    }
  }

  if (tabRecords && tabPeople) {
    tabRecords.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('records');
    });
    tabPeople.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('people');
    });

    // Arrow navigation across tabs
    const tabs = [tabRecords, tabPeople];
    tabs.forEach((tab, index) => {
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = (index + 1) % tabs.length;
          tabs[nextIndex].focus();
          switchTab(nextIndex === 0 ? 'records' : 'people');
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = (index - 1 + tabs.length) % tabs.length;
          tabs[prevIndex].focus();
          switchTab(prevIndex === 0 ? 'records' : 'people');
        }
      });
    });
  }

  // 3. People in-place search
  if (!peopleForm || !peopleInput || !peopleResultsContainer || !peopleStatus) {
    return;
  }

  let debounceTimer = null;
  let activeSearchController = null;

  function renderPeopleResults(people, totalCount) {
    peopleResultsContainer.replaceChildren();

    if (!people || people.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'dig-people-prompt';
      emptyMsg.textContent = 'No collectors matched this search.';
      peopleResultsContainer.appendChild(emptyMsg);
      peopleStatus.textContent = 'No matching collectors found.';
      return;
    }

    const list = document.createElement('div');
    list.className = 'dig-people-list';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = 'var(--space-2)';

    people.forEach((person) => {
      const card = document.createElement('a');
      card.className = 'dig-people-card';
      card.href = '/profiles/' + encodeURIComponent(person.username);

      const avatar = document.createElement('div');
      avatar.className = 'dig-people-avatar';
      if (person.avatarUrl && /^https:\/\//i.test(person.avatarUrl)) {
        const img = document.createElement('img');
        img.src = person.avatarUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        avatar.appendChild(img);
      } else {
        avatar.textContent = (person.displayName || person.username).charAt(0).toUpperCase();
      }

      const info = document.createElement('div');
      info.className = 'dig-people-info';

      const name = document.createElement('span');
      name.className = 'dig-people-name';
      name.textContent = person.displayName || person.username;

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
    peopleStatus.textContent = `Found ${totalCount} matching ${totalCount === 1 ? 'collector' : 'collectors'}.`;
  }

  async function performPeopleSearch(query) {
    if (activeSearchController) {
      activeSearchController.abort();
    }
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
      const res = await fetch('/api/people-search?q=' + encodeURIComponent(trimmed), {
        signal: activeSearchController.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      renderPeopleResults(data.people || [], data.pagination?.totalCount || 0);
    } catch (err) {
      if (err.name === 'AbortError') return;
      peopleStatus.textContent = 'Unable to search people at this time.';
    }
  }

  peopleInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performPeopleSearch(peopleInput.value);
    }, 250);
  });

  peopleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (debounceTimer) clearTimeout(debounceTimer);
    performPeopleSearch(peopleInput.value);
  });
})();
