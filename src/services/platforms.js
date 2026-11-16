import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Supported platforms and how to recognise them from a URL.
 * `id` is also used as the icon key on the frontend.
 */
export const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    hosts: [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'www.youtu.be',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ],
    color: '#ff0000',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    hosts: [
      'facebook.com',
      'www.facebook.com',
      'm.facebook.com',
      'fb.watch',
      'fb.com',
      'www.fb.com',
      'web.facebook.com',
    ],
    color: '#1877f2',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    hosts: [
      'instagram.com',
      'www.instagram.com',
      'm.instagram.com',
      'instagr.am',
      'ddinstagram.com',
    ],
    color: '#e1306c',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
    color: '#000000',
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    hosts: ['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com', 'mobile.twitter.com'],
    color: '#1da1f2',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    hosts: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'redd.it', 'v.redd.it'],
    color: '#ff4500',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    hosts: ['linkedin.com', 'www.linkedin.com', 'lnkd.in'],
    color: '#0a66c2',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
    color: '#ff3300',
  },
  {
    id: 'vk',
    name: 'VK',
    hosts: ['vk.com', 'www.vk.com', 'm.vk.com'],
    color: '#0077ff',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    hosts: ['pinterest.com', 'www.pinterest.com', 'pin.it'],
    color: '#e60023',
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    hosts: ['tumblr.com', 'www.tumblr.com'],
    color: '#36465d',
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    hosts: ['dailymotion.com', 'www.dailymotion.com', 'dai.ly'],
    color: '#0066dc',
  },
  {
    id: 'bilibili',
    name: 'Bilibili',
    hosts: ['bilibili.com', 'www.bilibili.com', 'b23.tv'],
    color: '#00a1d6',
  },
];

/** Extract the hostname of a URL, or null when the string is not a URL. */
export function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Find the platform matching a URL. Returns null for unsupported hosts. */
export function detectPlatform(url) {
  const host = getHost(url);
  if (!host) return null;

  // youtube-nocookie / ddinstagram style embeds live on their own hosts
  for (const p of PLATFORMS) {
    if (p.hosts.includes(host)) return p;
  }
  // Fallback: match the registrable-ish suffix (e.g. "m.youtube.com.evil.com" won't match)
  for (const p of PLATFORMS) {
    if (p.hosts.some((h) => host.endsWith(`.${h}`) || host === h)) return p;
  }
  return null;
}

/** Rough check whether a URL points at something we can even try. */
export function isValidHttpUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

/** Transliterate Arabic (and strip other non-ASCII) from a file name, so downloads work everywhere. */
const AR_MAP = {
  ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh',
  ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh',
  ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n',
  ه: 'h', و: 'w', ي: 'y', ى: 'a', ة: 'a',
  ء: "'", ؤ: 'o', ئ: 'u', آ: 'a', أ: 'a', إ: 'i', ﻻ: 'la',
};

export function toAsciiFilename(name, fallback = 'video') {
  const transliterated = [...String(name ?? '')]
    .map((ch) => (AR_MAP[ch] !== undefined ? AR_MAP[ch] : /[\x20-\x7e]/.test(ch) ? ch : ''))
    .join('');
  const cleaned = transliterated
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Strip characters that are illegal in file names on Windows/macOS/Linux, and collapse ".." */
export function sanitizeFilename(name, fallback = 'video') {
  const cleaned = (name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\.{2,}/g, ' ') // ".." sequences break some download managers
    .replace(/[.\s]+$/g, '') // trailing dots/spaces are illegal on Windows
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function platformById(id) {
  return PLATFORMS.find((p) => p.id === id) || null;
}

export { existsSync, path };
