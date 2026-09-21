/**
 * Unique Operations — fully local build.
 * Frontend only: data in localStorage, files in IndexedDB. No server, no cloud.
 */

export const ARCHITECTURE = {
  stack: 'Frontend only · локальное хранилище браузера',
  data: {
    provider: 'localStorage',
    tables: 'JSON-таблицы в браузере',
    auth: 'Локальный вход по email',
    settings: 'studio_settings',
    mailbox: 'communications (channel=email)',
  },
  assets: {
    provider: 'indexeddb',
    metadataTable: 'files',
    requiredFields: ['r2_key', 'storage_provider'] as const,
    prefixes: {
      operations: 'operations/',
      secure: 'secure/staff/',
    },
  },
} as const;
