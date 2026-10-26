(function () {
  'use strict';

  var panel = document.getElementById('messaging-floating-window');
  var mobileBackdrop = document.getElementById('messaging-mobile-backdrop');
  if (!panel) return;

  var desktopMedia = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: window.innerWidth >= 1024 };
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-messaging-widget-trigger]'));
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
  var isDragging = false;
  var dragOffsetX = 0;
  var dragOffsetY = 0;

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

  function makeInboxLink() {
    var link = element('a', 'messaging-widget-action', 'Open full inbox');
    link.href = '/messages';
    return link;
  }

  function showError(message) {
    panel.classList.remove('is-conversation');
    content.replaceChildren();
    var error = element('p', 'messaging-widget-error', message || 'Could not load messages. Open the full inbox to continue.');
    content.appendChild(error);
    var actions = element('div', 'messaging-widget-actions');
    actions.appendChild(makeInboxLink());
    actions.appendChild(actionButton('Try again', '', loadInbox));
    content.appendChild(actions);
    setStatus(message || 'Could not load messages.');
  }

  function startDirectChat(profileId) {
    setStatus('Opening conversation…');
    requestJson('/messages/profile/' + encodeURIComponent(profileId), {
      method: 'POST',
      headers: {
        'X-Messaging-Widget': '1'
      }
    }).then(function (data) {
      return loadConversation(data.id);
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
    toolbar.appendChild(element('p', 'messaging-widget-subtitle', 'Your private conversations'));
    toolbar.appendChild(makeInboxLink());
    content.appendChild(toolbar);

    if (savedPeople && savedPeople.length > 0) {
      var savedSection = element('div', 'messaging-widget-saved-section');
      savedSection.appendChild(element('span', 'messaging-widget-saved-title', 'Saved People'));
      var savedList = element('div', 'messaging-widget-saved-list');
      savedPeople.forEach(function (person) {
        var personBtn = element('button', 'messaging-widget-saved-chip');
        personBtn.type = 'button';
        personBtn.setAttribute('aria-label', 'Message ' + (person.displayName || '@' + person.username));
        if (person.avatarUrl) {
          var avatar = element('img', 'messaging-widget-saved-avatar');
          avatar.src = person.avatarUrl;
          avatar.alt = '';
          personBtn.appendChild(avatar);
        } else {
          var initial = element('span', 'messaging-widget-saved-initial', (person.displayName || person.username).substring(0, 1).toUpperCase());
          personBtn.appendChild(initial);
        }
        personBtn.appendChild(element('span', 'messaging-widget-saved-name', person.displayName || ('@' + person.username)));
        personBtn.addEventListener('click', function () {
          startDirectChat(person.id);
        });
        savedList.appendChild(personBtn);
      });
      savedSection.appendChild(savedList);
      content.appendChild(savedSection);
    }

    if (!conversations.length) {
      if (savedPeople && savedPeople.length > 0) {
        content.appendChild(element('p', 'messaging-widget-empty', 'No conversations started yet. Choose a saved person above to start chatting!'));
      } else {
        content.appendChild(element('p', 'messaging-widget-empty', 'No conversations yet. Save people from their profiles or message a seller on a drop to start chatting!'));
      }
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
        loadConversation(conversation.id);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
    content.appendChild(list);
    content.appendChild(makeInboxLink());
    setStatus(conversations.length + (conversations.length === 1 ? ' conversation' : ' conversations') + ' loaded');
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  function loadConversation(conversationId) {
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
    toolbar.appendChild(actionButton('← Conversations', '', loadInbox, 'Back to conversations'));
    toolbar.appendChild(makeInboxLink());
    var fullConversationLink = element('a', 'messaging-widget-action', 'Open full conversation');
    fullConversationLink.href = '/messages/' + encodeURIComponent(conversation.id);
    prependSvgIcon(fullConversationLink, '/assets/svg/conversation.svg', 'messaging-widget-icon');
    toolbar.appendChild(fullConversationLink);
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

  function syncResponsivePanelState() {
    var expandedMobilePanel = !desktopMedia.matches && !panel.hidden && !panel.classList.contains('is-minimized');
    panel.setAttribute('aria-modal', expandedMobilePanel ? 'true' : 'false');

    if (mobileBackdrop) {
      mobileBackdrop.hidden = !expandedMobilePanel;
      mobileBackdrop.setAttribute('aria-hidden', expandedMobilePanel ? 'false' : 'true');
    }
    document.body.classList.toggle('messaging-mobile-panel-open', expandedMobilePanel);

    if (dragHandle) {
      if (desktopMedia.matches) {
        dragHandle.setAttribute('aria-label', 'Move Messages window with arrow keys');
        dragHandle.setAttribute('title', 'Drag to move; use arrow keys to reposition');
      } else {
        dragHandle.setAttribute('aria-label', 'Messages panel header');
        dragHandle.removeAttribute('title');
      }
    }
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', !panel.hidden && !panel.classList.contains('is-minimized') ? 'true' : 'false');
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

  function openPanel(trigger) {
    lastTrigger = trigger || lastTrigger;
    closeDesktopMenu();
    closeMobileAccountSurface();
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.remove('is-minimized');
    minimizeButton.textContent = '−';
    minimizeButton.setAttribute('aria-label', 'Minimize Messages window');
    desktopTriggers.forEach(function (item) { item.setAttribute('aria-expanded', 'true'); });
    syncResponsivePanelState();
    void panel.offsetWidth;
    loadInbox().then(function () {
      if (!panel.hidden) closeButton.focus();
    });
  }

  function closePanel(restoreFocus) {
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.classList.remove('is-minimized');
    activeConversationId = null;
    desktopTriggers.forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
    syncResponsivePanelState();
    if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
      var focusTarget = lastTrigger.closest('[hidden], [aria-hidden="true"]')
        ? document.getElementById(desktopMedia.matches ? 'desktop-you-trigger' : 'mobile-you-trigger')
        : lastTrigger;
      if (focusTarget) focusTarget.focus();
    }
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

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      if (!panel.hidden && panel.classList.contains('is-minimized') && !desktopMedia.matches) {
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
      if (!desktopMedia.matches || panel.hidden || event.button !== 0) return;
      isDragging = true;
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
    dragHandle.addEventListener('pointermove', function (event) {
      if (!isDragging) return;
      setPanelPosition(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
    });
    function stopDragging() { isDragging = false; }
    dragHandle.addEventListener('pointerup', stopDragging);
    dragHandle.addEventListener('pointercancel', stopDragging);

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
    // Reuse the active thread on both form factors but discard desktop positioning on mobile.
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
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

  syncResponsivePanelState();
  refreshUnread();
})();