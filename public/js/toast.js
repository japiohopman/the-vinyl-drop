(function () {
  'use strict';

  function dismissToast(toast) {
    if (!toast || toast.getAttribute('data-dismissing') === 'true') return;

    toast.setAttribute('data-dismissing', 'true');
    if (toast._dismissTimer) {
      window.clearTimeout(toast._dismissTimer);
      toast._dismissTimer = null;
    }

    var reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      toast.remove();
      return;
    }

    toast.classList.add('toast-dismissing');
    window.setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 300);
  }

  function pauseToast(toast) {
    if (!toast || !toast._dismissTimer) return;

    window.clearTimeout(toast._dismissTimer);
    toast._dismissTimer = null;
    toast._dismissRemaining = Math.max(
      0,
      toast._dismissRemaining - (Date.now() - toast._dismissStartedAt)
    );
  }

  function resumeToast(toast) {
    if (
      !toast ||
      toast.getAttribute('data-dismissing') === 'true' ||
      toast._dismissTimer ||
      toast.matches(':hover') ||
      toast.contains(document.activeElement)
    ) {
      return;
    }

    toast._dismissStartedAt = Date.now();
    toast._dismissTimer = window.setTimeout(function () {
      dismissToast(toast);
    }, toast._dismissRemaining);
  }

  function initToasts() {
    var toasts = document.querySelectorAll('.toast[data-auto-dismiss="true"]');

    toasts.forEach(function (toast) {
      var configuredTimeout = parseInt(toast.getAttribute('data-dismiss-timeout') || '4500', 10);
      toast._dismissRemaining = Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 4500;
      toast._dismissTimer = null;
      toast._dismissStartedAt = 0;

      toast.addEventListener('mouseenter', function () {
        pauseToast(toast);
      });
      toast.addEventListener('mouseleave', function () {
        resumeToast(toast);
      });
      toast.addEventListener('focusin', function () {
        pauseToast(toast);
      });
      toast.addEventListener('focusout', function (event) {
        if (
          !event.relatedTarget ||
          !(event.relatedTarget instanceof Node) ||
          !toast.contains(event.relatedTarget)
        ) {
          resumeToast(toast);
        }
      });

      resumeToast(toast);
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;
      var dismissButton = target.closest('[data-dismiss-toast]');
      if (!dismissButton) return;
      dismissToast(dismissButton.closest('.toast'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToasts);
  } else {
    initToasts();
  }
})();
