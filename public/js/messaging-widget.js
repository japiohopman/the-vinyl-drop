(function () {
  'use strict';

  var panel = document.getElementById('messaging-floating-window');
  var mobileBackdrop = document.getElementById('messaging-mobile-backdrop');
  if (!panel) return;

  var desktopMedia = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: window.innerWidth >= 1024 };
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-messaging-widget-trigger]'));
  var profileMessageForms = Array.prototype.slice.call(document.querySelectorAll('[data-message-profile-form]'));
  var desktopTriggers = Array.prototype.slice.call(document.querySelectorAll('#desktop-you-menu [data-messaging-widget-trigger]'));
  var badges = Array.prototype.slice.call(document.querySelectorAll('[data-messaging-unread-count]'));
  var content = panel.querySelector('[data-message-widget-content]');
  var status = panel.querySelector('[data-message-widget-status]');
  var title = panel.querySelector('[data-message-widget-title]');
  var dragHandle = panel.querySelector('[data-message-drag-handle]');
  var minimizeButton = panel.querySelector('[data-message-minimize]');
  var closeButton = panel.querySelector('[data-message-close]');
  var lastTrigger = null;
  var activeConversationId = null;
  var activeInboxTab = 'conversations';
  var returnInboxTab = 'conversations';
  var panelCloseTimer = null;
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var mobileDragStartY = 0;
  var mobileDragDeltaY = 0;

  if (!content || !status || !title || !dragHandle || !minimizeButton || !closeButton) return;

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function prependSvgIcon(node, path, className) {
    var icon = document.createElement('img');
    icon.className = className || 'messaging-widget-icon';
    icon.src = path;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.decoding = 'async';
    node.insertBefore(icon, node.firstChild);
  }

  function actionButton(text, className, handler, label) {
    var button = element('button', 'messaging-widget-action' + (className ? ' ' + className : ''), text);
    button.type = 'button';
    if (label) button.setAttribute('aria-label', label);
    button.addEventListener('click', function (event) { handler(button, event); });
    return button;
  }

  function setStatus(message) {
    status.textContent = message || '';
  }

  function setUnreadCount(count) {
    var value = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    badges.forEach(function (badge) {
      badge.hidden = value === 0;
      badge.textContent = value > 99 ? '99+' : String(value);
      badge.setAttribute('aria-label', value + (value === 1 ? ' unread message' : ' unread messages'));
    });
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-label', value > 0
        ? 'Messages, ' + value + (value === 1 ? ' unread message' : ' unread messages')
        : 'Messages');
    });
  }

  function requestJson(url, options) {
    var init = Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }, options || {});
    init.headers = Object.assign({ Accept: 'application/json' }, (options && options.headers) || {});
    return fetch(url, init).then(function (response) {
      if (!response.ok) {
        var error = new Error(response.status === 404
          ? 'This conversation is no longer available.'
          : 'The message request could not be completed.');
        error.status = response.status;
        throw error;
      }
      return response.json();
    });
  }

  function refreshUnread() {
    return requestJson('/messages/widget/unread-count').then(function (data) {
      setUnreadCount(data.unreadCount);
      return data.unreadCount;
    }).catch(function () {
      // No fabricated count: hide stale values when the authoritative endpoint fails.
      setUnreadCount(0);
      return 0;
    });
  }

  function showError(message) {
    panel.classList.remove('is-conversation');
    content.replaceChildren();
    var error = element('p', 'messaging-widget-error', message || 'Could not load messages. Please try again.');
    content.appendChild(error);
    var actions = element('div', 'messaging-widget-actions');
    actions.appendChild(actionButton('Try again', '', loadInbox));
    content.appendChild(actions);
    setStatus(message || 'Could not load messages.');
  }

  function startDirectChat(profileId, sourceTab) {
    var originatingTab = sourceTab === 'people' || sourceTab === 'conversations'
      ? sourceTab
      : activeInboxTab;
    returnInboxTab = originatingTab;
    setStatus('Opening conversation…');
    return requestJson('/messages/profile/' + encodeURIComponent(profileId), {
      method: 'POST',
      headers: {
        'X-Messaging-Widget': '1'
      }
    }).then(function (data) {
      return loadConversation(data.id, originatingTab);
    }).catch(function (error) {
      showError(error.message);
    });
  }

  function loadInbox() {
    activeConversationId = null;
    panel.classList.remove('is-conversation');
    title.textContent = 'Messages';
    panel.setAttribute('aria-label', 'Private messages');
    content.replaceChildren(element('p', 'messaging-widget-loading', 'Loading messages…'));
    setStatus('Loading messages');
    return requestJson('/messages/widget/data').then(function (data) {
      setUnreadCount(data.unreadCount);
      renderInbox(data.conversations || [], data.savedPeople || []);
    }).catch(function (error) {
      showError(error.message);
    });
  }

  function renderInbox(conversations, savedPeople) {
    panel.classList.remove('is-conversation');
    content.replaceChildren();

    var toolbar = element('div', 'messaging-widget-toolbar');
    toolbar.appendChild(element('p', 'messaging-widget-subtitle', 'Your private messaging hub'));
    content.appendChild(toolbar);

    var tabList = element('div', 'messaging-widget-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Messages and people');

    var tabPanel = element('div', 'messaging-widget-tab-panel');
    tabPanel.id = 'messaging-widget-tab-panel';
    tabPanel.setAttribute('role', 'tabpanel');
    tabPanel.setAttribute('tabindex', '0');

    var tabDefinitions = [
      { key: 'conversations', label: 'Conversations', id: 'messaging-widget-tab-conversations' },
      { key: 'people', label: 'People', id: 'messaging-widget-tab-people' }
    ];
    var tabButtons = {};

    function renderConversationsTab() {
      if (!conversations.length) {
        tabPanel.appendChild(element(
          'p',
          'messaging-widget-empty',
          'No conversations yet. Start a chat from a seller’s listing or a digger’s profile, or contact someone you have saved under People.'
        ));
        setStatus('No conversations yet');
        return;
      }

      var list = element('ul', 'messaging-widget-list');
      conversations.forEach(function (conversation) {
        var item = element('li');
        var label = conversation.conversationType === 'direct'
          ? (conversation.otherParticipantUsername ? '@' + conversation.otherParticipantUsername : conversation.otherParticipant)
          : ((conversation.releaseArtist || 'Listing') + ' — ' + (conversation.releaseTitle || 'Conversation'));
        var button = element('button', 'messaging-widget-conversation' + (conversation.unreadCount > 0 ? ' is-unread' : ''));
        button.type = 'button';
        button.setAttribute('aria-label', label + ', ' + conversation.otherParticipant + (conversation.unreadCount > 0 ? ', ' + conversation.unreadCount + ' unread' : ''));
        button.appendChild(element('span', 'messaging-widget-conversation-title', label));
        button.appendChild(element('span', 'messaging-widget-meta', conversation.otherParticipant));
        button.appendChild(element('span', 'messaging-widget-preview', conversation.lastMessage || 'No messages yet.'));
        if (conversation.unreadCount > 0) {
          button.appendChild(element('span', 'messaging-widget-meta', conversation.unreadCount + (conversation.unreadCount === 1 ? ' unread message' : ' unread messages')));
        }
        button.addEventListener('click', function () {
          returnInboxTab = 'conversations';
          loadConversation(conversation.id);
        });
        item.appendChild(button);
        list.appendChild(item);
      });
      tabPanel.appendChild(list);
      setStatus(conversations.length + (conversations.length === 1 ? ' conversation' : ' conversations') + ' loaded');
    }

    function renderPeopleTab() {
      if (!savedPeople || !savedPeople.length) {
        tabPanel.appendChild(element(
          'p',
          'messaging-widget-empty',
          'No saved people yet. Save people from their profiles to find them here. Your list is private and does not notify them.'
        ));
        setStatus('No saved people yet');
        return;
      }

      var list = element('ul', 'messaging-widget-person-list');
      list.setAttribute('aria-label', 'Saved People');
      savedPeople.forEach(function (person) {
        var item = element('li', 'messaging-widget-person-item');
        var profileLink = element('a', 'messaging-widget-person-profile');
        profileLink.href = '/profiles/' + encodeURIComponent(person.username);
        if (person.avatarUrl) {
          var avatar = element('img', 'messaging-widget-person-avatar');
          avatar.src = person.avatarUrl;
          avatar.alt = '';
          avatar.loading = 'lazy';
          profileLink.appendChild(avatar);
        } else {
          profileLink.appendChild(element(
            'span',
            'messaging-widget-person-avatar messaging-widget-person-initial',
            (person.displayName || person.username || '?').substring(0, 1).toUpperCase()
          ));
        }

        var details = element('span', 'messaging-widget-person-details');
        details.appendChild(element('strong', 'messaging-widget-person-name', person.displayName || ('@' + person.username)));
        details.appendChild(element('span', 'messaging-widget-meta', '@' + person.username));
        profileLink.appendChild(details);

        var messageButton = actionButton(
          'Message',
          'messaging-widget-person-message',
          function () {
            returnInboxTab = 'people';
            startDirectChat(person.id, 'people');
          },
          'Message @' + person.username
        );

        item.appendChild(profileLink);
        item.appendChild(messageButton);
        list.appendChild(item);
      });
      tabPanel.appendChild(list);
      setStatus(savedPeople.length + (savedPeople.length === 1 ? ' saved person' : ' saved people') + ' loaded');
    }

    function activateTab(key) {
      activeInboxTab = key === 'people' ? 'people' : 'conversations';
      tabDefinitions.forEach(function (definition) {
        var selected = definition.key === activeInboxTab;
        var tab = tabButtons[definition.key];
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle('is-active', selected);
      });

      tabPanel.setAttribute('aria-labelledby', tabButtons[activeInboxTab].id);
      tabPanel.replaceChildren();
      if (activeInboxTab === 'people') renderPeopleTab();
      else renderConversationsTab();
    }

    tabDefinitions.forEach(function (definition, index) {
      var tab = element('button', 'messaging-widget-tab', definition.label);
      tab.type = 'button';
      tab.id = definition.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', tabPanel.id);
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
      tab.addEventListener('click', function () {
        activateTab(definition.key);
      });
      tab.addEventListener('keydown', function (event) {
        var targetIndex = index;
        if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabDefinitions.length;
        else if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabDefinitions.length) % tabDefinitions.length;
        else if (event.key === 'Home') targetIndex = 0;
        else if (event.key === 'End') targetIndex = tabDefinitions.length - 1;
        else return;
        event.preventDefault();
        var target = tabDefinitions[targetIndex];
        activateTab(target.key);
        tabButtons[target.key].focus();
      });
      tabButtons[definition.key] = tab;
      tabList.appendChild(tab);
    });

    content.appendChild(tabList);
    content.appendChild(tabPanel);
    activateTab(activeInboxTab);
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  function loadConversation(conversationId, originatingTab) {
    if (originatingTab === 'people' || originatingTab === 'conversations') {
      returnInboxTab = originatingTab;
    } else if (!panel.classList.contains('is-conversation')) {
      returnInboxTab = activeInboxTab;
    }
    activeConversationId = conversationId;
    content.replaceChildren(element('p', 'messaging-widget-loading', 'Loading conversation…'));
    setStatus('Loading conversation');
    return requestJson('/messages/widget/' + encodeURIComponent(conversationId)).then(function (data) {
      activeConversationId = data.id;
      setUnreadCount(data.unreadCount);
      renderConversation(data);
    }).catch(function (error) {
      showError(error.message);
    });
  }

  function renderConversation(conversation) {
    panel.classList.add('is-conversation');
    content.replaceChildren();
    title.textContent = conversation.title || (conversation.release
      ? conversation.release.artist + ' — ' + conversation.release.title
      : 'Direct conversation with @' + conversation.otherParticipant.username);
    panel.setAttribute('aria-label', conversation.release
      ? 'Conversation about ' + conversation.release.title
      : 'Direct conversation with @' + conversation.otherParticipant.username);

    var toolbar = element('div', 'messaging-widget-toolbar');
    var returnLabel = returnInboxTab === 'people' ? 'People' : 'Conversations';
    var backToConversations = actionButton(returnLabel, '', function () {
      activeInboxTab = returnInboxTab;
      loadInbox();
    }, 'Back to ' + returnLabel.toLowerCase());
    prependSvgIcon(backToConversations, '/assets/svg/conversation.svg', 'messaging-widget-icon');
    toolbar.appendChild(backToConversations);
    content.appendChild(toolbar);
    content.appendChild(element('p', 'messaging-widget-subtitle', 'With ' + (conversation.otherParticipant.displayName || '@' + conversation.otherParticipant.username)));

    var messageList = element('div', 'messaging-widget-message-list');
    messageList.setAttribute('aria-label', 'Conversation messages');
    if (!conversation.messages || conversation.messages.length === 0) {
      messageList.appendChild(element('p', 'messaging-widget-empty', 'No messages yet. Start the conversation below.'));
    } else {
      conversation.messages.forEach(function (message) {
        var bubble = element('div', 'messaging-widget-message' + (message.isOwnMessage ? ' is-own' : ''));
        bubble.appendChild(element('div', '', message.body));
        if (message.createdAt) {
          bubble.appendChild(element('time', 'messaging-widget-message-meta', formatDate(message.createdAt)));
        }
        messageList.appendChild(bubble);
      });
    }
    content.appendChild(messageList);

    var footer = element('div', 'messaging-widget-conversation-footer');
    if (Number(conversation.unreadCount) > 0) {
      footer.appendChild(actionButton('Mark as read', '', function (button) {
        button.disabled = true;
        var readThroughSeq = (conversation.messages || []).reduce(function (maximum, message) {
          return Math.max(maximum, Number(message.messageSeq) || 0);
        }, 0);
        requestJson('/messages/' + encodeURIComponent(conversation.id) + '/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ messageSeq: readThroughSeq })
        })
          .then(function () { return Promise.all([loadConversation(conversation.id), refreshUnread()]); })
          .catch(function (error) { showError(error.message); });
      }));
      var markRead = footer.lastChild;
      markRead.classList.add('messaging-widget-action-primary');
    }

    var compose = element('form', 'messaging-widget-compose');
    var label = element('label', '', 'Send a message');
    var textarea = element('textarea');
    textarea.name = 'body';
    textarea.maxLength = 4000;
    textarea.required = true;
    textarea.setAttribute('aria-label', 'Message body');
    label.htmlFor = 'messaging-widget-message-body';
    textarea.id = 'messaging-widget-message-body';
    compose.appendChild(label);
    compose.appendChild(textarea);
    var submit = element('button', 'messaging-widget-send', 'Send message');
    submit.type = 'submit';
    prependSvgIcon(submit, '/assets/svg/send.svg', 'messaging-widget-icon messaging-widget-icon-inverse');
    compose.appendChild(submit);
    compose.addEventListener('submit', function (event) {
      event.preventDefault();
      var body = textarea.value.trim();
      if (!body) {
        textarea.focus();
        return;
      }
      submit.disabled = true;
      requestJson('/messages/' + encodeURIComponent(conversation.id) + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Messaging-Widget': '1' },
        body: JSON.stringify({ body: body })
      }).then(function () {
        return Promise.all([loadConversation(conversation.id), refreshUnread()]);
      }).catch(function (error) {
        showError(error.message);
      }).finally(function () {
        submit.disabled = false;
      });
    });
    footer.appendChild(compose);
    var archiveButton = actionButton('Archive conversation', '', function (button) {
      button.disabled = true;
      requestJson('/messages/' + encodeURIComponent(conversation.id) + '/archive', { method: 'POST' })
        .then(function () { return Promise.all([loadInbox(), refreshUnread()]); })
        .catch(function (error) { showError(error.message); });
    });
    archiveButton.classList.add('messaging-widget-archive');
    footer.appendChild(archiveButton);
    content.appendChild(footer);
    setStatus('Conversation with ' + (conversation.otherParticipant.displayName || conversation.otherParticipant.username));
    messageList.scrollTop = messageList.scrollHeight;
  }

  function closeDesktopMenu() {
    var trigger = document.getElementById('desktop-you-trigger');
    var menu = document.getElementById('desktop-you-menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) {
      menu.hidden = true;
      menu.classList.remove('is-open');
    }
  }

  function syncMobileViewportSize() {
    if (desktopMedia.matches) {
      panel.style.removeProperty('--messaging-visual-viewport-height');
      panel.style.removeProperty('--messaging-visual-viewport-width');
      panel.style.removeProperty('--messaging-visual-viewport-top');
      panel.style.removeProperty('--messaging-visual-viewport-left');
      return;
    }

    var viewport = window.visualViewport;
    panel.style.setProperty('--messaging-visual-viewport-height',
      Math.max(1, Math.round(viewport ? viewport.height : window.innerHeight)) + 'px');
    panel.style.setProperty('--messaging-visual-viewport-width',
      Math.max(1, Math.round(viewport ? viewport.width : window.innerWidth)) + 'px');
    panel.style.setProperty('--messaging-visual-viewport-top',
      Math.max(0, Math.round(viewport ? viewport.offsetTop : 0)) + 'px');
    panel.style.setProperty('--messaging-visual-viewport-left',
      Math.max(0, Math.round(viewport ? viewport.offsetLeft : 0)) + 'px');
  }

  function syncResponsivePanelState() {
    syncMobileViewportSize();
    var isClosing = panel.classList.contains('is-closing');
    var mobilePanelVisible = !desktopMedia.matches && !panel.hidden && !panel.classList.contains('is-minimized');
    var expandedMobilePanel = mobilePanelVisible && !isClosing && panel.classList.contains('is-open');
    panel.setAttribute('aria-modal', expandedMobilePanel ? 'true' : 'false');

    if (mobileBackdrop) {
      mobileBackdrop.hidden = !mobilePanelVisible;
      mobileBackdrop.classList.toggle('is-open', expandedMobilePanel);
      mobileBackdrop.classList.toggle('is-closing', mobilePanelVisible && isClosing);
      mobileBackdrop.setAttribute('aria-hidden', expandedMobilePanel ? 'false' : 'true');
    }
    document.body.classList.toggle('messaging-mobile-panel-open', mobilePanelVisible);

    if (dragHandle) {
      if (desktopMedia.matches) {
        dragHandle.setAttribute('aria-label', 'Move Messages window with arrow keys');
        dragHandle.setAttribute('title', 'Drag to move; use arrow keys to reposition');
      } else {
        dragHandle.setAttribute('aria-label',
          panel.classList.contains('is-minimized')
            ? 'Swipe up to restore Messages panel'
            : 'Swipe down to minimize Messages panel');
        dragHandle.removeAttribute('title');
      }
    }
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-expanded',
        !panel.hidden && !panel.classList.contains('is-minimized') && !isClosing && panel.classList.contains('is-open') ? 'true' : 'false');
    });
  }

  function closeMobileAccountSurface() {
    var mobileSurface = document.getElementById('mobile-you-surface');
    var mobileClose = document.getElementById('mobile-you-close-btn');
    if (mobileSurface && !mobileSurface.hidden && mobileClose) mobileClose.click();
  }

  function trapMobileFocus(event) {
    if (desktopMedia.matches || panel.hidden || panel.classList.contains('is-minimized') || event.key !== 'Tab') return;
    var focusable = Array.prototype.slice.call(panel.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (node) { return !node.hidden && node.getAttribute('aria-hidden') !== 'true'; });
    if (!focusable.length) {
      event.preventDefault();
      closeButton.focus();
      return;
    }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function openPanel(trigger, targetProfileId) {
    if (panelCloseTimer !== null) {
      window.clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    lastTrigger = trigger || lastTrigger;
    closeDesktopMenu();
    closeMobileAccountSurface();
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.style.transform = '';
    panel.style.transition = '';
    panel.classList.remove('is-minimized', 'is-closing', 'is-open');
    minimizeButton.textContent = '−';
    minimizeButton.setAttribute('aria-label', 'Minimize Messages window');
    desktopTriggers.forEach(function (item) { item.setAttribute('aria-expanded', 'true'); });
    syncResponsivePanelState();
    void panel.offsetWidth;
    panel.classList.add('is-open');
    syncResponsivePanelState();

    loadInbox().then(function () {
      if (targetProfileId) {
        activeInboxTab = 'conversations';
        returnInboxTab = 'conversations';
        return startDirectChat(targetProfileId, 'conversations');
      }
      return undefined;
    }).then(function () {
      if (!panel.hidden && panel.classList.contains('is-open')) closeButton.focus();
    });
  }

  function finishClosingPanel() {
    if (panelCloseTimer !== null) {
      window.clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }
    panel.hidden = true;
    panel.classList.remove('is-open', 'is-closing', 'is-minimized');
    panel.setAttribute('aria-hidden', 'true');
    activeConversationId = null;
    desktopTriggers.forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
    syncResponsivePanelState();
  }

  function closePanel(restoreFocus) {
    if (panel.hidden) return;
    if (panelCloseTimer !== null) {
      window.clearTimeout(panelCloseTimer);
      panelCloseTimer = null;
    }

    panel.style.transform = '';
    panel.style.transition = '';
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    panel.setAttribute('aria-hidden', 'true');
    activeConversationId = null;
    desktopTriggers.forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
    syncResponsivePanelState();

    if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
      var focusTarget = lastTrigger.closest('[hidden], [aria-hidden="true"]')
        ? document.getElementById(desktopMedia.matches ? 'desktop-you-trigger' : 'mobile-you-trigger')
        : lastTrigger;
      if (focusTarget) focusTarget.focus();
    }

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) finishClosingPanel();
    else panelCloseTimer = window.setTimeout(finishClosingPanel, 180);
  }

  function toggleMinimized() {
    if (panel.hidden) return;
    var minimized = panel.classList.toggle('is-minimized');
    minimizeButton.textContent = minimized ? '□' : '−';
    minimizeButton.setAttribute('aria-label', minimized ? 'Restore Messages window' : 'Minimize Messages window');
    minimizeButton.setAttribute('title', minimized ? 'Restore' : 'Minimize');
    setStatus(minimized ? 'Messages window minimized' : 'Messages window restored');
    syncResponsivePanelState();
    if (!minimized) closeButton.focus();
  }

  profileMessageForms.forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!panel || !form.dataset.messageProfileId) return;
      event.preventDefault();
      var submitButton = form.querySelector('button[type="submit"]');
      openPanel(submitButton || form, form.dataset.messageProfileId);
    });
  });

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      if (!panel.hidden && panel.classList.contains('is-closing')) {
        openPanel(trigger);
        return;
      }
      if (!panel.hidden && panel.classList.contains('is-minimized')) {
        lastTrigger = trigger;
        closeDesktopMenu();
        closeMobileAccountSurface();
        toggleMinimized();
        return;
      }
      if (!panel.hidden) {
        closePanel(true);
        return;
      }
      openPanel(trigger);
    });
  });

  minimizeButton.addEventListener('click', toggleMinimized);
  closeButton.addEventListener('click', function () { closePanel(true); });

  document.addEventListener('keydown', trapMobileFocus);

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', function () { closePanel(true); });
  }

  document.addEventListener('keydown', function (event) {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel(true);
    }
  });

  function clampPanelPosition(left, top) {
    var rect = panel.getBoundingClientRect();
    var maxLeft = Math.max(0, window.innerWidth - rect.width);
    var maxTop = Math.max(0, window.innerHeight - rect.height);
    return {
      left: Math.max(0, Math.min(left, maxLeft)),
      top: Math.max(0, Math.min(top, maxTop))
    };
  }

  function setPanelPosition(left, top) {
    if (panel.hidden) return;
    var position = clampPanelPosition(left, top);
    panel.style.left = position.left + 'px';
    panel.style.top = position.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  if (dragHandle) {
    dragHandle.addEventListener('pointerdown', function (event) {
      if (panel.hidden || event.button !== 0) return;
      isDragging = true;
      if (!desktopMedia.matches) {
        mobileDragStartY = event.clientY;
        mobileDragDeltaY = 0;
        panel.style.transition = 'none';
        if (dragHandle.setPointerCapture && event.pointerId !== undefined) dragHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      var rect = panel.getBoundingClientRect();
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      dragOffsetX = event.clientX - rect.left;
      dragOffsetY = event.clientY - rect.top;
      if (dragHandle.setPointerCapture && event.pointerId !== undefined) dragHandle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    // Track movement at window level so a gesture continues if the pointer leaves the title button.
    window.addEventListener('pointermove', function (event) {
      if (!isDragging) return;
      if (!desktopMedia.matches) {
        mobileDragDeltaY = event.clientY - mobileDragStartY;
        var minimized = panel.classList.contains('is-minimized');
        var offset = minimized
          ? Math.min(0, Math.max(-120, mobileDragDeltaY))
          : Math.max(0, Math.min(160, mobileDragDeltaY));
        panel.style.transform = 'translate3d(0, ' + offset + 'px, 0)';

        // Commit the mobile gesture once its directional threshold is crossed.
        // Some touch browsers can cancel a captured pointer before pointerup when
        // the panel itself is being translated; committing here keeps restore/minimize
        // reliable instead of relying on a later release event.
        if ((minimized && mobileDragDeltaY < -60) || (!minimized && mobileDragDeltaY > 80)) {
          isDragging = false;
          panel.style.transform = '';
          panel.style.transition = '';
          mobileDragDeltaY = 0;
          toggleMinimized();
        }
        return;
      }
      setPanelPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
    });
    function stopDragging(event) {
      if (!isDragging) return;
      isDragging = false;
      if (!desktopMedia.matches) {
        // Use the release coordinate too; the final pointermove can be lost on touch
        // browsers when the visual viewport or a captured pointer changes during a swipe.
        if (event && typeof event.clientY === 'number') {
          mobileDragDeltaY = event.clientY - mobileDragStartY;
        }
        var wasMinimized = panel.classList.contains('is-minimized');
        var gestureDistance = mobileDragDeltaY;
        panel.style.transform = '';
        panel.style.transition = '';
        if ((!wasMinimized && gestureDistance > 80) || (wasMinimized && gestureDistance < -60)) {
          toggleMinimized();
        }
        mobileDragDeltaY = 0;
        return;
      }
    }
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    dragHandle.addEventListener('keydown', function (event) {
      if (!desktopMedia.matches || panel.hidden) return;
      var step = event.shiftKey ? 40 : 16;
      var left = panel.getBoundingClientRect().left;
      var top = panel.getBoundingClientRect().top;
      if (event.key === 'ArrowLeft') left -= step;
      else if (event.key === 'ArrowRight') left += step;
      else if (event.key === 'ArrowUp') top -= step;
      else if (event.key === 'ArrowDown') top += step;
      else return;
      event.preventDefault();
      setPanelPosition(left, top);
    });
  }

  function handleDesktopBreakpoint() {
    // Keep the active conversation open as the same widget adapts to the new viewport.
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.transform = '';
    panel.style.transition = '';
    syncResponsivePanelState();
    refreshUnread();
  }

  if (desktopMedia.addEventListener) desktopMedia.addEventListener('change', handleDesktopBreakpoint);
  else if (desktopMedia.addListener) desktopMedia.addListener(handleDesktopBreakpoint);
  window.addEventListener('resize', function () {
    syncResponsivePanelState();
    if (desktopMedia.matches && !panel.hidden && (panel.style.left || panel.style.top)) {
      var rect = panel.getBoundingClientRect();
      setPanelPosition(rect.left, rect.top);
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncResponsivePanelState);
    window.visualViewport.addEventListener('scroll', syncResponsivePanelState);
  }

  syncResponsivePanelState();
  refreshUnread();
})();