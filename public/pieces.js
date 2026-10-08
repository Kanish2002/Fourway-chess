// Original Staunton-inspired silhouettes, with colored highlights and carved details.
const base = '<path d="M13 36c1-3 21-3 22 0l2 4H11z"/><path d="M10 40h28v4H10z"/><path class="piece-highlight" d="M12 40h24v1H12z"/><path class="piece-shade" d="M12 42h24v2H12z"/>';
const paths = {
  p: '<circle cx="24" cy="11" r="6.2"/><path d="M19 17h10l1.5 4h-4c0 6 1 11 5.5 15H16c4.5-4 5.5-9 5.5-15h-4z"/><path class="piece-highlight" d="M21 7c-4 1-4 6-1 8-1-3 0-5 3-7zM20 24l-1 8h3l1-8z"/><path class="piece-detail" d="M19 20h10M18 34h12"/>',
  r: '<path d="M11 6h6v5h4V6h6v5h4V6h6v13l-6 4v12H17V23l-6-4z"/><path class="piece-shade" d="M28 23h3v12h-3zM12 16h24v3H12z"/><path class="piece-highlight" d="M18 23h3v9h-3zM12 7h3v8h-3z"/><path class="piece-detail" d="M13 18h22M17 23h14M17 33h14"/>',
  n: '<path d="M13 35c0-7 3-11 9-16l-6 3-5 1-3-5 9-10 1-5 6 5c10 0 13 8 13 16v11z"/><path class="piece-shade" d="M26 10c10 5 9 14 6 23h5V23c0-7-3-12-11-13z"/><path class="piece-highlight" d="M19 12l-7 7 4 1 5-6zM22 24c-4 3-6 5-6 9h3c0-4 2-6 5-8z"/><path class="piece-detail" d="M25 18c5 3 7 9 4 15M11 19l4 1M17 9l3 3"/><circle cx="24" cy="13" r="1.6" fill="#29231f" stroke="none"/><circle cx="23.7" cy="12.7" r=".5" fill="#fff" stroke="none"/>',
  b: '<circle cx="24" cy="5" r="2.5"/><path d="M24 8c-4 4-10 9-10 15 0 4 4 6 8 7l-6 5h16l-6-5c4-1 8-3 8-7 0-6-6-11-10-15z"/><path class="piece-highlight" d="M22 12c-5 5-7 11-3 13-1-5 1-8 4-12z"/><path class="piece-shade" d="M28 16c6 9 1 10-4 13h4c6-3 7-6 0-13z"/><path class="piece-detail" d="M27 12l-6 10M17 28h14M18 33h12"/>',
  q: '<path d="m9 13 7 8 1-12 7 11 7-11 1 12 7-8-5 16 1 6H13l1-6z"/><circle cx="9" cy="11" r="2.5"/><circle cx="17" cy="7" r="2.5"/><circle cx="24" cy="5" r="2.5"/><circle cx="31" cy="7" r="2.5"/><circle cx="39" cy="11" r="2.5"/><path class="piece-highlight" d="m16 23 3 2 1 8h-3zM22 6h2v2h-2z"/><path class="piece-shade" d="m30 23 3-2-2 8 2 5h-4z"/><path class="piece-detail" d="M15 29h18M15 33h18"/>',
  k: '<path d="M22 3h4v5h5v4h-5v5h-4v-5h-5V8h5z"/><path d="M24 19c-7-9-17-1-12 7l5 5-2 4h18l-2-4 5-5c5-8-5-16-12-7z"/><path class="piece-highlight" d="M15 18c-3 1-3 6 2 9l3 1c-5-5-4-7-3-9zM23 4h1v7h-1z"/><path class="piece-shade" d="M31 17c5 5 2 8-3 12h3l5-5c2-5 0-7-5-7z"/><path class="piece-detail" d="M17 30h14M18 33h12M24 19v7"/>'
};
export function pieceSvg(type) { return `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[type] || paths.p}${base}</svg>`; }
const icons = {
  code: '<path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18"/>',
  expand: '<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  book: '<path d="M12 5C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 1zM12 5v15"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/>',
  settings: '<path d="m9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  crown: '<path d="m3 6 5 5 4-7 4 7 5-5-2 13H5zM6 16h12"/>',
  rotate: '<path d="M20 7V3l-3 1M20 7a9 9 0 1 0 1 9M20 7h-5"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6M22 9l-6 6"/>',
  undo: '<path d="M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7"/>',
  bulb: '<path d="M8 16c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8zM8 19h8M10 22h4M12 8v8"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  pawn: '<circle cx="12" cy="5" r="3"/><path d="M9 9h6l1 3-3 2 3 5H8l3-5-3-2zM6 19h12v3H6z"/>',
  first: '<path d="M5 5v14m13-13-8 6 8 6"/>', left: '<path d="m15 5-7 7 7 7"/>', right: '<path d="m9 5 7 7-7 7"/>', last: '<path d="M19 5v14M6 6l8 6-8 6"/>',
  flag: '<path d="M5 22V3c5-4 9 5 14 0v11c-5 5-9-4-14 0"/>',
  handshake: '<path d="m3 7 4-3 5 2 5-2 4 3-3 8-5 5-4-2-6-6M7 8l5-2 4 5-3 3-4-3M14 18l-4-4M17 15l-3-3"/>',
  bot: '<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M8 12h.01M16 12h.01M8 17h8M1 11v6M23 11v6"/>',
  people: '<circle cx="8" cy="7" r="4"/><path d="M1 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M18 15a5 5 0 0 1 5 5"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
