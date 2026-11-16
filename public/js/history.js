/**
 * Download history stored in the browser only (localStorage).
 * Nothing here is ever sent to the server.
 */
const KEY = 'vd.history';
const MAX = 50;

export function getHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addHistory(entry) {
  const list = getHistory();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item = { id, at: new Date().toISOString(), ...entry };

  // de-duplicate by url + quality
  const filtered = list.filter((x) => !(x.url === item.url && x.qualityId === item.qualityId));
  filtered.unshift(item);
  localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));

  window.dispatchEvent(new CustomEvent('historychange'));
  return item;
}

export function removeHistory(id) {
  const list = getHistory().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('historychange'));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('historychange'));
}

export function historyUrl() {
  return location.pathname + location.search;
}
