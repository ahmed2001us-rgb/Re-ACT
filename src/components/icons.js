/** Inline SVG icons (stroke style, 24x24). Markup below is static and trusted; no user text is used. */

const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9.5a.5.5 0 0 0 .5.5H10v-5h4v5h4.5a.5.5 0 0 0 .5-.5V10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  patterns: '<path d="M2.5 12c2-5.5 4-5.5 6 0s4 5.5 6 0 4-5.5 6.5 0"/>',
  growth: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6.5 7.5-6.5 0 4.5-3 6.5-7.5 6.5Z"/><path d="M12 15c0-3-2-5-6.5-5 0 3.5 2.5 5 6.5 5Z"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  inbox: '<path d="M4 13.5 6.5 5h11L20 13.5"/><path d="M4 13.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.5h-5a3 3 0 0 1-6 0H4Z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14Z"/><path d="M5 19c3-3 6-6 9-8"/>',
};

/** @param {keyof typeof PATHS} name */
export function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'ra-icon');
  svg.innerHTML = PATHS[name] || '';
  return svg;
}
