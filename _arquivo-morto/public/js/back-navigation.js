(() => {
  'use strict';

  const button = document.querySelector(
    '[data-dragnix-back]'
  );

  if (!button) return;

  const fallback =
    button.dataset.fallback || 'app.html';

  button.addEventListener('click', (event) => {
    event.preventDefault();

    // Usa o histórico somente quando a página anterior
    // pertence à mesma origem.
    let sameOrigin = false;

    try {
      sameOrigin =
        document.referrer !== '' &&
        new URL(document.referrer).origin ===
          window.location.origin;
    } catch {
      sameOrigin = false;
    }

    if (sameOrigin && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign(fallback);
    }
  });
})();