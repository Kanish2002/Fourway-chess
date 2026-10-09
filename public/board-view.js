// Keep square nodes and unchanged piece children alive between board updates.
// Selection, legal dots and turn changes should only update square attributes;
// recreating <img> nodes re-runs loading and can interrupt move animations.
export function patchBoard(root, cells) {
  if (root.children?.length !== cells.length) {
    root.innerHTML = cells.map(cell => cell.markup).join('');
    return;
  }
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i], node = root.children[i];
    if (cell.square === undefined) continue;
    if (node.className !== cell.className) node.className = cell.className;
    const attributes = {'data-square':String(cell.square), 'aria-label':cell.label,
      'aria-pressed':String(cell.pressed), tabindex:String(cell.tabIndex), title:cell.label};
    for (const [name, value] of Object.entries(attributes)) {
      if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
    // Key describes the piece and coordinates, deliberately excluding animation
    // markup and image readiness. Neither should reset an existing piece node.
    if (node.dataset.contentKey !== cell.key) {
      node.innerHTML = cell.content;
      node.dataset.contentKey = cell.key;
    }
  }
}
