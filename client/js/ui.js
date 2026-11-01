/** Crea un elemento DOM. Il testo passa sempre da nodi di testo: mai innerHTML con dati altrui. */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function toast(message, kind = 'info') {
  const el = h('div', { class: kind === 'error' ? 'toast toast-error' : 'toast' }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fuori da HTTPS/localhost la Clipboard API non c'è: ripiego sul vecchio metodo.
    const area = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' }, text);
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function initials(name) {
  const first = (word) => Array.from(word)[0] ?? '';
  const words = name.trim().split(/\s+/);
  return (first(words[0]) + (words.length > 1 ? first(words.at(-1)) : '')).toUpperCase();
}
