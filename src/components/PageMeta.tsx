import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { buildMetaTags } from '../lib/seo';

const MANAGED = 'data-uometa';

function upsertMeta(
  attribute: 'name' | 'property',
  key: string,
  content: string,
) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"][${MANAGED}]`,
  );
  if (!el) {
    el = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute(MANAGED, '');
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"][${MANAGED}]`);
  if (!el) {
    el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute(MANAGED, '');
  el.setAttribute('href', href);
}

export function PageMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = buildMetaTags(pathname);

    document.title = meta.title;

    upsertMeta('name', 'description', meta.description);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', meta.url);
    upsertMeta('property', 'og:image', meta.image);
    upsertMeta('property', 'og:image:secure_url', meta.image);
    upsertMeta('property', 'og:image:type', 'image/jpeg');
    upsertMeta('property', 'og:type', meta.type);
    upsertMeta('property', 'og:site_name', meta.siteName);
    upsertMeta('property', 'og:locale', meta.locale);
    upsertMeta('name', 'twitter:card', meta.twitterCard);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertMeta('name', 'twitter:image', meta.image);

    upsertLink('canonical', meta.url);
  }, [pathname]);

  return null;
}
