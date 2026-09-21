export const SITE_URL = 'https://ops.uniquedetailing.ru';
export const SITE_NAME = 'UNIQUE Detailing';
export const SITE_LOCALE = 'ru_RU';

export interface PageMetaConfig {
  title: string;
  description: string;
  /** When true, title is used as-is without " — UNIQUE Detailing" suffix */
  fullTitle?: boolean;
}

const DEFAULT: PageMetaConfig = {
  title: 'UNIQUE Detailing',
  description:
    'Премиальный автомобильный детейлинг. Операционная система студии UNIQUE Detailing — заказы, клиенты, финансы и производство.',
  fullTitle: true,
};

const ROUTE_META: Record<string, PageMetaConfig> = {
  '/': {
    title: 'UNIQUE Detailing',
    description:
      'Премиальный автомобильный детейлинг. Операционная система студии UNIQUE Detailing — заказы, клиенты, финансы и производство.',
    fullTitle: true,
  },
  '/overview': {
    title: 'Обзор операций',
    description: 'Сводка операций студии UNIQUE Detailing: KPI, загрузка цеха, финансы и ключевые показатели.',
  },
  '/jobs': {
    title: 'Заказы',
    description: 'Управление заказами и работами в цехе UNIQUE Detailing.',
  },
  '/bookings': {
    title: 'Бронирования',
    description: 'Календарь бронирований и расписание боксов студии UNIQUE Detailing.',
  },
  '/pipeline': {
    title: 'Производство',
    description: 'Доска производства и этапы работ в цехе UNIQUE Detailing.',
  },
  '/inspection': {
    title: 'Осмотр',
    description: 'Приёмка и осмотр автомобилей: чек-листы, фото и карта повреждений.',
  },
  '/vehicles': {
    title: 'Автомобили',
    description: 'База автомобилей клиентов студии UNIQUE Detailing.',
  },
  '/customers': {
    title: 'Клиенты',
    description: 'CRM-клиенты студии UNIQUE Detailing: контакты, история и документы.',
  },
  '/leads': {
    title: 'Лиды',
    description: 'Воронка лидов и новые обращения в UNIQUE Detailing.',
  },
  '/staff': {
    title: 'Сотрудники',
    description: 'Команда студии UNIQUE Detailing: роли, загрузка и доступы.',
  },
  '/services': {
    title: 'Услуги',
    description: 'Каталог услуг и прайс-лист премиального детейлинга UNIQUE Detailing.',
  },
  '/finance': {
    title: 'Финансы',
    description: 'Счета, оплаты и финансовая аналитика студии UNIQUE Detailing.',
  },
  '/mailbox': {
    title: 'Почта',
    description: 'Корпоративная почта и переписка с клиентами UNIQUE Detailing.',
  },
  '/inventory': {
    title: 'Склад',
    description: 'Склад материалов, расходников и оборудования UNIQUE Detailing.',
  },
  '/reports': {
    title: 'Отчёты',
    description: 'Аналитика и отчёты по операциям студии UNIQUE Detailing.',
  },
  '/settings': {
    title: 'Настройки',
    description: 'Настройки системы и профиль пользователя UNIQUE Detailing.',
  },
  '/documents': {
    title: 'Документы',
    description: 'Документы клиентов, заказов и студии UNIQUE Detailing.',
  },
  '/login': {
    title: 'UNIQUE Detailing',
    description:
      'Премиальный автомобильный детейлинг. Операционная система студии UNIQUE Detailing — заказы, клиенты, финансы и производство.',
    fullTitle: true,
  },
};

const PAY_ROUTE = /^\/pay\/[^/]+$/;

export function resolvePathname(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function getPageMeta(pathname: string): PageMetaConfig {
  const path = resolvePathname(pathname);

  if (PAY_ROUTE.test(path)) {
    return {
      title: 'Оплата счёта',
      description:
        'Безопасная оплата счёта UNIQUE Detailing. Премиальный автомобильный детейлинг — оплата онлайн.',
    };
  }

  return ROUTE_META[path] ?? DEFAULT;
}

export function formatDocumentTitle(config: PageMetaConfig): string {
  if (config.fullTitle) return config.title;
  return `${config.title} — ${SITE_NAME}`;
}

export function absolutePageUrl(pathname: string): string {
  const path = resolvePathname(pathname);
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path}`;
}

export function ogImageForPath(pathname: string): string {
  const path = resolvePathname(pathname);
  const base = '/assets/marketing';
  if (path === '/login') return `${base}/ops-login-share.jpg`;
  return `${base}/ops-home-share.jpg`;
}

export function buildMetaTags(pathname: string) {
  const config = getPageMeta(pathname);
  const title = formatDocumentTitle(config);
  const url = absolutePageUrl(pathname);
  const image = ogImageForPath(pathname);

  return {
    title,
    description: config.description,
    url,
    image,
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    type: 'website' as const,
    twitterCard: 'summary_large_image' as const,
  };
}
