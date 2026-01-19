import { Database, Palette } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SettingsSection = 'look' | 'state';

export type SettingsSectionMeta = {
  id: SettingsSection;
  title: string;
  description: string;
  accent: string;
  accentRgb: string;
  icon: LucideIcon;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: 'look',
    title: 'Look & Feel',
    description: 'Themes, copy, typography, overlays, and palette.',
    accent: 'var(--color-accent-cyan)',
    accentRgb: 'var(--color-accent-cyan-rgb)',
    icon: Palette
  },
  {
    id: 'state',
    title: 'Gamestate Management',
    description: 'Import/export snapshots and section previews.',
    accent: 'var(--color-accent-magenta)',
    accentRgb: 'var(--color-accent-magenta-rgb)',
    icon: Database
  }
];
