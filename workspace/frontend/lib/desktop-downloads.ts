import type { TranslateFn } from '@/lib/i18n';

/** This fork is not published as a download. Callers render nothing. */
export function desktopDownloads(_t: TranslateFn): { os: string; href: string; platform: 'macos' | 'windows' }[] {
  return [];
}
