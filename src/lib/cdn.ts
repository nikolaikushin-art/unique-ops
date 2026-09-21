/** All assets are local (served from /public). No external CDN. */
export const CDN_BASE = '';

export const CDN_ASSETS_PREFIX = 'assets';

export function cdnAsset(path: string): string {
  const clean = path.replace(/^\//, '').replace(/^assets\//, '');
  return `/${CDN_ASSETS_PREFIX}/${clean}`;
}

export const BRAND_LOGO_URL = '/assets/unique-detailing-logo.png';

export const OG_IMAGE_HOME = '/assets/marketing/ops-home-share.jpg';
export const OG_IMAGE_LOGIN = '/assets/marketing/ops-login-share.jpg';
export const OG_IMAGE_URL = OG_IMAGE_HOME;
