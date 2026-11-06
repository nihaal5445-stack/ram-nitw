import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

type Messages = { [k: string]: string | Messages };
const isObj = (v: unknown): v is Messages => typeof v === 'object' && v !== null && !Array.isArray(v);

/** English is the base; the chosen locale overrides it. New screens ship English-only and fall back automatically. */
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isObj(v) && isObj(b) ? merge(b, v) : v;
  }
  return out;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'en';
  const en = (await import('../../messages/en.json')).default as Messages;
  const messages = locale === 'en' ? en : merge(en, (await import(`../../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
