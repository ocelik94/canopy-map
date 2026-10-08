import { en, type Strings } from './i18n/en.ts';
import { de } from './i18n/de.ts';

export const LANGUAGES = { de, en } as const satisfies Record<string, Strings>;
export type Lang = keyof typeof LANGUAGES;
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch' };
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'canopy_ui_lang';
export const LEGACY_LANG_COOKIE = 'canopy_lang';
export const LOCALES: Record<Lang, string> = { en: 'en-GB', de: 'de-DE' };

const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in LANGUAGES;

export const resolveLang = (cookieValue?: string | null): Lang =>
	isLang(cookieValue) ? cookieValue : DEFAULT_LANG;

function readCookie(name: string): string | null {
	const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
	return m ? decodeURIComponent(m[1]) : null;
}

export const lang: Lang =
	typeof document === 'undefined' ? DEFAULT_LANG : resolveLang(readCookie(LANG_COOKIE));

export const t: Strings = LANGUAGES[lang];

export const stringsFor = (l: Lang): Strings => LANGUAGES[l];

const locale = LOCALES[lang];
const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
const numberFmt = new Intl.NumberFormat(locale);
export const fmtDateTime = (ms: number) => dateTimeFmt.format(ms);
export const fmtDate = (ms: number) => dateFmt.format(ms);
export const fmtNumber = (n: number) => numberFmt.format(n);

export function setLanguage(l: Lang) {
	document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
	location.reload();
}
