/**
 * Vehicle cover photos.
 *
 * A car's thumbnail is the first photo that was attached to it (or the one the
 * user explicitly starred as "cover"). No stock / generated imagery is used —
 * cars without a photo get a neutral monogram tile instead.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { db } from './localdb';
import { publicR2Url } from './r2Storage';

type CoverMap = Record<string, string>;

/** Categories that are documentation, not a presentable "hero" photo. */
const NON_COVER_CATEGORIES = new Set(['damage', 'inspection']);

let covers: CoverMap = {};
let started = false;
const listeners = new Set<() => void>();

interface FileRow {
  id: string;
  entity_id: string;
  category: string;
  r2_key: string | null;
  bucket_path: string | null;
  file_type: string | null;
  is_sensitive: boolean;
  is_cover?: boolean | null;
  created_at: string;
}

async function load() {
  try {
    const { data } = await db
      .from('files')
      .select('*')
      .eq('entity_type', 'vehicle')
      .order('created_at', { ascending: true });
    const rows = ((data ?? []) as FileRow[]).filter(
      (f) => !f.is_sensitive && (f.file_type ?? '').startsWith('image/') && publicR2Url(f.r2_key || f.bucket_path || ''),
    );

    const byVehicle = new Map<string, FileRow[]>();
    for (const f of rows) {
      const list = byVehicle.get(f.entity_id) ?? [];
      list.push(f);
      byVehicle.set(f.entity_id, list);
    }

    const next: CoverMap = {};
    byVehicle.forEach((list, vehicleId) => {
      const starred = [...list].reverse().find((f) => f.is_cover);
      const presentable = list.find((f) => !NON_COVER_CATEGORIES.has(f.category));
      const pick = starred ?? presentable ?? list[0];
      const url = publicR2Url(pick.r2_key || pick.bucket_path || '');
      if (url) next[vehicleId] = url;
    });
    covers = next;
    listeners.forEach((l) => l());
  } catch {
    /* storage unavailable — thumbnails simply fall back to the monogram */
  }
}

export function refreshVehicleCovers() {
  return load();
}

function start() {
  if (started) return;
  started = true;
  if (typeof window !== 'undefined') window.addEventListener('uo:files-changed', () => { void load(); });
  void load();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const getSnapshot = () => covers;

/** URL of the vehicle's cover photo, or null when it has none. */
export function useVehicleCover(vehicleId?: string | null): string | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { start(); }, []);
  return vehicleId ? snap[vehicleId] ?? null : null;
}
