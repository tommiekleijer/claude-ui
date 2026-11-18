import { notify } from './store';

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Scrolt naar het bericht waaruit `text` geciteerd is (het laatste bericht vóór `origin` waarin die tekst staat) en laat het kort oplichten.
 * Zonder `origin` (het citaatkaartje in het invoerveld) wordt het laatste bericht met die tekst gebruikt.
 */
export const jumpToQuote = (text: string, origin?: Element | null) => {
  const needle = normalize(text);
  const scroller = document.querySelector('[aria-live][aria-hidden="false"]');
  const own = origin?.closest('[data-quotable]') ?? null;
  const candidates = [...(scroller?.querySelectorAll('[data-quotable]') ?? [])].filter(
    (el) => el !== own && normalize(el.textContent ?? '').includes(needle),
  );
  const before = origin ? candidates.filter((el) => el.compareDocumentPosition(origin) & Node.DOCUMENT_POSITION_FOLLOWING) : candidates;
  const target = before.at(-1) ?? candidates[0];
  if (!target) {
    notify('Het oorspronkelijke bericht staat niet in deze chat.');
    return;
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.animate([{ backgroundColor: 'var(--accent-zacht)' }, { backgroundColor: 'transparent' }], { duration: 2000 });
};
