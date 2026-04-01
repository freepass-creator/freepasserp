function resolveRoot(rootOrSelector) {
  if (!rootOrSelector) return null;
  if (typeof rootOrSelector === 'string') return document.querySelector(rootOrSelector);
  return rootOrSelector instanceof Element ? rootOrSelector : null;
}

export function mountGeneralListSection(rootOrSelector, options = {}) {
  const root = resolveRoot(rootOrSelector);
  if (!root) return null;

  root.classList.add('ui-section', 'ui-section--list');
  if (options.className) root.classList.add(...String(options.className).split(/\s+/).filter(Boolean));
  if (options.key) root.dataset.sectionKey = options.key;

  const list = root.querySelector('.summary-list, .admin-summary-list');
  if (list) {
    list.classList.add('ui-section__body', 'ui-section__body--list');
  }
  return root;
}
