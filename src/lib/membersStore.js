import { MEMBERS_SEED, MEMBERS_SEED_VERSION } from "../data/membersSeed.js";

const KEY = "guest.members";
const KEY_VER = "guest.members.seedVersion";

export function loadMembersSeeded() {
  try {
    const ver = localStorage.getItem(KEY_VER);
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    const isDev = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE !== 'production')
      || (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1'));

    if (isDev) {
      if (ver !== MEMBERS_SEED_VERSION || !Array.isArray(parsed) || parsed.length === 0) {
        localStorage.setItem(KEY, JSON.stringify(MEMBERS_SEED));
        localStorage.setItem(KEY_VER, MEMBERS_SEED_VERSION);
        return MEMBERS_SEED;
      }
      return parsed;
    } else {
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      return [];
    }
  } catch {
    try {
      const isDev = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE !== 'production');
      if (isDev) {
        localStorage.setItem(KEY, JSON.stringify(MEMBERS_SEED));
        localStorage.setItem(KEY_VER, MEMBERS_SEED_VERSION);
        return MEMBERS_SEED;
      }
    } catch {}
    return [];
  }
}

export function saveMembers(members) {
  try { localStorage.setItem(KEY, JSON.stringify(members)); } catch {}
}

export function resetDemoMembers() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_VER);
  } catch {}
}

export function normalizeId3(v) {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length > 3) return null;
  return digits.padStart(3, "0");
}
