(function () {
  'use strict';

  function cleanFlashQueryParams() {
    if (typeof window === 'undefined' || !window.history || !window.history.replaceState) {
      return;
    }
    try {
      var url = new URL(window.location.href);
      var searchParams = url.searchParams;
      if (searchParams.has('success') || searchParams.has('flash') || searchParams.has('error')) {
        searchParams.delete('success');
        searchParams.delete('flash');
        searchParams.delete('error');
        var newSearch = searchParams.toString();
        var newUrl = url.pathname + (newSearch ? '?' + newSearch : '') + url.hash;
        window.history.replaceState(null, '', newUrl);
      }
    } catch (e) {
      // Ignore URL parsing errors on fallback environment
    }
  }

  function dismissToast(toastEl) {
    if (!toastEl) return;
    var prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      toastEl.remove();
    } else {
      toastEl.classList.add('toast-dismissing');
      setTimeout(function () {
        if (toastEl && toastEl.parentNode) {
          toastEl.remove();
        }
      }, 300);
    }
  }

  function setupToastTimer(toast) {
    var initialTimeout = parseInt(toast.getAttribute('data-dismiss-timeout') || '4500', 10);
    var remainingMs = initialTimeout;
    var timerId = null;
    var startTime = null;

    var isHovered = false;
    var isFocused = false;

    function startTimer(duration) {
      clearTimer();
      startTime = Date.now();
      remainingMs = duration;
      timerId = setTimeout(function () {
        dismissToast(toast);
      }, duration);
    }

    function clearTimer() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (startTime !== null) {
        var elapsed = Date.now() - startTime;
        remainingMs = Math.max(1000, remainingMs - elapsed);
        startTime = null;
      }
    }

    function updateState() {
      var shouldPause = isHovered || isFocused;
      if (shouldPause) {
        clearTimer();
      } else {
        if (timerId === null) {
          startTimer(remainingMs);
        }
      }
    }

    toast.addEventListener('mouseenter', function () {
      isHovered = true;
      updateState();
    });

    toast.addEventListener('mouseleave', function () {
      isHovered = false;
      updateState();
    });

    toast.addEventListener('focusin', function () {
      isFocused = true;
      updateState();
    });

    toast.addEventListener('focusout', function (event) {
      // Check if new focused element is still within the toast
      if (toast.contains(event.relatedTarget)) {
        return;
      }
      isFocused = false;
      updateState();
    });

    // Start initial timer
    startTimer(initialTimeout);
  }

  function initToasts() {
    var toasts = document.querySelectorAll('.toast-success[data-auto-dismiss="true"]');
    toasts.forEach(function (toast) {
      setupToastTimer(toast);
    });

    cleanFlashQueryParams();
  }

  window.dismissToast = dismissToast;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToasts);
  } else {
    initToasts();
  }
})();
