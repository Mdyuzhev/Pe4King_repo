/**
 * SVG icons for Pe4King webview.
 * Clean, minimal icons that work well in VS Code theme.
 */

export const ICONS = {
  // File/folder icons
  folder: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 4H7.414l-1-1A2 2 0 0 0 4.914 2H1.5z"/></svg>',
  folderOpen: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764a1.5 1.5 0 0 1 1.06.44l.707.707H13.5A1.5 1.5 0 0 1 15 4.5v1H2.5A1.5 1.5 0 0 0 1 7v-3.5zm.646 4.354A.5.5 0 0 1 2 7.5h11a.5.5 0 0 1 .49.598l-1 5A.5.5 0 0 1 12 13.5H2.5a.5.5 0 0 1-.49-.402l-1-5a.5.5 0 0 1 .136-.244z"/></svg>',
  file: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4zm5.5 0v3a1.5 1.5 0 0 0 1.5 1.5h3L9.5 0z"/></svg>',

  // Action icons
  key: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 0a5.5 5.5 0 0 0-4.97 7.862l-4.823 4.83A1 1 0 0 0 0 13.4V15a1 1 0 0 0 1 1h1.6a1 1 0 0 0 .708-.293l.293-.293H5v-1.5a.5.5 0 0 1 .5-.5H7v-1.5a.5.5 0 0 1 .5-.5h.585l.862-.863A5.5 5.5 0 1 0 10.5 0zm1.5 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>',
  add: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/></svg>',

  // Language icons
  python: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M7.8 1C4.5 1 4.6 2.4 4.6 2.4l.003 1.5H8v.4H3s-2.3-.2-2.3 3.3 2 3.4 2 3.4h1.2V9.4s-.1-2 2-2h3.4s1.9 0 1.9-1.8V2.8S11.6 1 7.8 1zm-1.9 1c.3 0 .6.3.6.6s-.3.6-.6.6-.6-.3-.6-.6.3-.6.6-.6z"/><path d="M8.2 15c3.3 0 3.2-1.4 3.2-1.4l-.003-1.5H8v-.4h5s2.3.2 2.3-3.3-2-3.4-2-3.4h-1.2v1.6s.1 2-2 2H6.7s-1.9 0-1.9 1.8v2.8S4.4 15 8.2 15zm1.9-1c-.3 0-.6-.3-.6-.6s.3-.6.6-.6.6.3.6.6-.3.6-.6.6z"/></svg>',
  java: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 9.5c0 .3.2.5.4.6.3.1.6.2 1 .2.3 0 .6 0 .9-.1.3-.1.4-.3.4-.6 0-.2-.1-.4-.3-.5-.2-.1-.5-.2-.9-.3-.6-.1-1.1-.3-1.4-.5s-.5-.6-.5-1c0-.5.2-.9.6-1.2.4-.3.9-.4 1.6-.4s1.2.1 1.6.4c.4.3.6.7.6 1.2h-1c0-.3-.1-.5-.3-.6-.2-.2-.5-.2-.9-.2-.3 0-.6.1-.8.2-.2.1-.3.3-.3.5 0 .2.1.3.3.4.2.1.5.2.9.3.6.1 1.1.3 1.4.5.3.3.5.6.5 1.1 0 .5-.2.9-.6 1.2-.4.3-1 .4-1.7.4-.7 0-1.3-.2-1.7-.5-.4-.3-.6-.7-.6-1.3h1.1z"/><path d="M12.3 5.4c-.2-.2-.5-.3-.8-.3-.4 0-.7.1-.9.4-.2.3-.3.6-.3 1.1v3.2h-1V4.6h1v.6c.3-.5.8-.7 1.4-.7.5 0 .9.2 1.2.5.3.3.4.8.4 1.4v3.4h-1V6.5c0-.5-.1-.8-.3-1.1z"/><path d="M4.5 13c.8.5 2 .9 3.5.9s2.7-.3 3.5-.9c-.8.3-2 .5-3.5.5s-2.7-.2-3.5-.5z"/><path d="M11.5 12c-.5.4-1.5.7-3.5.7s-3-.3-3.5-.7c.5.6 2 1 3.5 1s3-.4 3.5-1z"/></svg>',
  postman: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/><path d="M10.5 5.5L8 8l-2 2v1.5L8.5 9l2.5-2.5-.5-1z"/><path d="M5 7l1-1 2.5 2.5L7 10 5 7z"/></svg>',
  collection: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793A.5.5 0 0 0 1 5.5v5A1.5 1.5 0 0 0 2.5 12h11a1.5 1.5 0 0 0 1.5-1.5v-5a.5.5 0 0 0 0-.207V4.5A1.5 1.5 0 0 0 13.5 3h-11zm0 1h11a.5.5 0 0 1 .5.5V5H2v-.5a.5.5 0 0 1 .5-.5zm-.5 3h12v3.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V7z"/></svg>',

  // Status icons
  check: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>',
  cross: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>',
  warning: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',

  // UI icons
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5a.5.5 0 0 1 .764-.424l8.5 5.5a.5.5 0 0 1 0 .848l-8.5 5.5A.5.5 0 0 1 4 13.5v-11z"/></svg>',
  chevronDown: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>',
  chevronRight: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/></svg>',
  export: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1.5A1.5 1.5 0 0 0 7 0H2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4.5L8.5 1.5zm1 9.5v-1H7v-2h2.5V7L13 10l-3.5 3v-2z"/></svg>',
} as const;

/**
 * Create icon span element string.
 */
export function icon(name: keyof typeof ICONS, className?: string): string {
  const svg = ICONS[name];
  const cls = className ? `icon ${className}` : 'icon';
  return `<span class="${cls}">${svg}</span>`;
}

/**
 * CSS for icon styling.
 */
export const ICONS_CSS = `
/* SVG Icons */
.icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; flex-shrink: 0; vertical-align: middle;
}
.icon svg { width: 100%; height: 100%; fill: currentColor; }
.icon-sm { width: 12px; height: 12px; }
.icon-lg { width: 20px; height: 20px; }
.icon-xl { width: 28px; height: 28px; }
.icon-success { color: #28a745; }
.icon-error { color: #dc3545; }
.icon-warning { color: #ffc107; }
`;
