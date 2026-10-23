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
      // Ignore URL parsing errors on fallback browsers
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

  function initToasts() {
    var toasts = document.querySelectorAll('.toast-success[data-auto-dismiss="true"]');
    toasts.forEach(function (toast) {
      var timeoutMs = parseInt(toast.getAttribute('data-dismiss-timeout') || '4500', 10);
      var timer = setTimeout(function () {
        dismissToast(toast);
      }, timeoutMs);

      toast.addEventListener('mouseenter', function () {
        clearTimeout(timer);
      });
      toast.addEventListener('focusin', function () {
        clearTimeout(timer);
      });
      toast.addEventListener('mouseleave', function () {
        timer = setTimeout(function () {
          dismissToast(toast);
        }, 2000);
      });
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
