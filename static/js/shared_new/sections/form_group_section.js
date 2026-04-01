function resolveRoot(rootOrSelector) {
  if (!rootOrSelector) return null;
  if (typeof rootOrSelector === 'string') return document.querySelector(rootOrSelector);
  return rootOrSelector instanceof Element ? rootOrSelector : null;
}

export function mountFormGroupSection(rootOrSelector, options = {}) {
  const root = resolveRoot(rootOrSelector);
  if (!root) return null;

  root.classList.add('ui-section', 'ui-section--form');
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));
  if (options.key) root.dataset.sectionKey = options.key;
  if (options.mode) root.dataset.sectionMode = options.mode;

  const form = root.querySelector('form');
  if (form) {
    form.classList.add('ui-section__body', 'ui-section__body--form');
  }
  const message = root.querySelector('.message');
  if (message) {
    message.classList.add('ui-section__message');
  }
  return root;
}
