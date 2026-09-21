import {
  LayoutDashboard,
  ClipboardList,
  CalendarClock,
  Kanban,
  ClipboardCheck,
  Car,
  Users,
  UserPlus,
  IdCard,
  Wrench,
  Landmark,
  Mail,
  Package,
  FolderOpen,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { ViewId } from '../types/database';

/**
 * One glyph per section, in the same spirit as Renso's rail: a small,
 * consistent line-icon set (lucide) instead of text-only rows. Kept in its
 * own file so Layout.tsx stays focused on structure/behaviour.
 */
export const NAV_SECTION_ICONS: Record<ViewId, LucideIcon> = {
  overview: LayoutDashboard,
  jobs: ClipboardList,
  bookings: CalendarClock,
  pipeline: Kanban,
  inspection: ClipboardCheck,
  vehicles: Car,
  customers: Users,
  leads: UserPlus,
  staff: IdCard,
  services: Wrench,
  finance: Landmark,
  mailbox: Mail,
  inventory: Package,
  documents: FolderOpen,
  reports: BarChart3,
  settings: Settings,
};
