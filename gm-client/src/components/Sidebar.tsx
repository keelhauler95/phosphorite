import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, Bot, BookOpen, FileText, Image as ImageIcon, MapPin, MessageSquare, Terminal as TerminalIcon } from 'lucide-react';
import { GameApp } from '../types';
import { SETTINGS_SECTIONS, type SettingsSection } from './settingsSections';

const CATEGORY_META: Record<string, { icon: LucideIcon; accent: string }> = {
  Text: { icon: FileText, accent: 'var(--color-accent-cyan)' },
  Telemetry: { icon: Activity, accent: 'var(--color-accent-green)' },
  Logbook: { icon: BookOpen, accent: 'var(--color-accent-amber)' },
  Image: { icon: ImageIcon, accent: 'var(--color-accent-magenta)' },
  Map: { icon: MapPin, accent: 'var(--color-accent-blue)' },
  Terminal: { icon: TerminalIcon, accent: 'var(--color-accent-violet)' },
  AI_Chat: { icon: Bot, accent: 'var(--color-accent-red)' },
  default: { icon: MessageSquare, accent: 'var(--color-accent-cyan)' }
};

interface Props {
  apps: GameApp[];
  currentView: 'characters' | 'apps' | 'messages' | 'broadcast' | 'settings';
  selectedId: number | string | null;
  onViewChange: (view: 'characters' | 'apps' | 'messages' | 'broadcast' | 'settings') => void;
  onSelectApp: (app: GameApp) => void;
  onReorderApps: (orderedIds: string[]) => void;
  settingsSection: SettingsSection | null;
  onSelectSettingsSection: (section: SettingsSection | null) => void;
}

function Sidebar({
  apps,
  currentView,
  selectedId,
  onViewChange,
  onSelectApp,
  onReorderApps,
  settingsSection,
  onSelectSettingsSection,
}: Props) {
  const [expandedGroup, setExpandedGroup] = useState<'apps' | 'settings' | null>(() => {
    if (currentView === 'apps') return 'apps';
    if (currentView === 'settings') return 'settings';
    return null;
  });
  const isAppsExpanded = expandedGroup === 'apps';
  const isSettingsExpanded = expandedGroup === 'settings';
  const [orderedApps, setOrderedApps] = useState<GameApp[]>(apps);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dropCommittedRef = useRef(false);

  useEffect(() => {
    setOrderedApps(apps);
  }, [apps]);

  useEffect(() => {
    if (currentView === 'apps') {
      setExpandedGroup('apps');
      return;
    }
    if (currentView === 'settings') {
      setExpandedGroup('settings');
      return;
    }
    setExpandedGroup(null);
  }, [currentView]);

  const reorderList = useCallback((list: GameApp[], sourceId: string, targetId: string, placeAfter = false) => {
    const sourceIndex = list.findIndex(app => app.id === sourceId);
    const targetIndex = list.findIndex(app => app.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return list;
    }
    const updated = [...list];
    const [moved] = updated.splice(sourceIndex, 1);
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) {
      insertIndex -= 1;
    }
    if (placeAfter) {
      insertIndex += 1;
    }
    const boundedIndex = Math.max(0, Math.min(updated.length, insertIndex));
    updated.splice(boundedIndex, 0, moved);
    return updated.map((app, index) => ({ ...app, order_index: index }));
  }, []);

  const handleDragStart = (event: DragEvent<HTMLDivElement>, appId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', appId);
    setDraggingId(appId);
    setDragOverId(appId);
    dropCommittedRef.current = false;
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, overId: string) => {
    event.preventDefault();
    if (!draggingId || draggingId === overId) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > rect.top + rect.height / 2;
    setOrderedApps(prev => reorderList(prev, draggingId, overId, shouldPlaceAfter));
    setDragOverId(overId);
  };

  const handleDragLeave = (overId: string) => {
    if (dragOverId === overId) {
      setDragOverId(null);
    }
  };

  const handleListDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggingId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const isNearBottom = event.clientY >= rect.bottom - 28;
    if (!isNearBottom) {
      return;
    }
    setOrderedApps(prev => {
      const draggedIndex = prev.findIndex(app => app.id === draggingId);
      if (draggedIndex === -1 || draggedIndex === prev.length - 1) {
        return prev;
      }
      const updated = [...prev];
      const [dragged] = updated.splice(draggedIndex, 1);
      updated.push(dragged);
      return updated.map((app, index) => ({ ...app, order_index: index }));
    });
    setDragOverId(null);
  };

  const finalizeOrder = () => {
    const orderedIds = orderedApps.map(app => app.id);
    if (orderedIds.length === 0) {
      return;
    }
    onReorderApps(orderedIds);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggingId) {
      return;
    }
    setDraggingId(null);
    setDragOverId(null);
    dropCommittedRef.current = true;
    finalizeOrder();
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    if (!dropCommittedRef.current) {
      setOrderedApps([...apps]);
    }
    dropCommittedRef.current = false;
  };

  const handlePrimaryNavClick = (view: 'characters' | 'messages' | 'broadcast') => {
    setExpandedGroup(null);
    onViewChange(view);
  };

  const handleSettingsSectionSelect = (section: SettingsSection) => {
    onSelectSettingsSection(section);
  };

  const shouldHighlightSettingsHeader = currentView === 'settings';

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div
          className={`sidebar-header ${currentView === 'characters' ? 'active' : ''}`}
          onClick={() => handlePrimaryNavClick('characters')}
        >
          <span>Users</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div
          className={`sidebar-header ${currentView === 'messages' ? 'active' : ''}`}
          onClick={() => handlePrimaryNavClick('messages')}
        >
          <span>Comms</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div
          className={`sidebar-header ${currentView === 'broadcast' ? 'active' : ''}`}
          onClick={() => handlePrimaryNavClick('broadcast')}
        >
          <span>Broadcast</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div
          className={`sidebar-header ${currentView === 'apps' ? 'active' : ''}`}
          onClick={() => {
            setExpandedGroup('apps');
            onViewChange('apps');
          }}
        >
          <span>Apps</span>
        </div>
        <div className={`sidebar-content ${isAppsExpanded ? 'expanded' : 'collapsed'}`}>
          <div
            className={`sidebar-list ${draggingId ? 'is-dragging' : ''}`}
            onDragOver={handleListDragOver}
            onDrop={handleDrop}
          >
            {orderedApps.map(app => {
              const meta = CATEGORY_META[app.category] || CATEGORY_META.default;
              const Icon = meta.icon;
              const accentStyle = { '--sidebar-accent': meta.accent } as CSSProperties;
              const isDragging = draggingId === app.id;
              const isDragOver = dragOverId === app.id && !isDragging;

              return (
                <div
                  key={app.id}
                  className={`sidebar-item ${selectedId === app.id ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                  style={accentStyle}
                  onClick={() => onSelectApp(app)}
                  draggable
                  onDragStart={(event) => handleDragStart(event, app.id)}
                  onDragOver={(event) => handleDragOver(event, app.id)}
                  onDragLeave={() => handleDragLeave(app.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                >
                  <div className="item-name">{app.name}</div>
                  <Icon className="sidebar-item-icon" aria-hidden="true" />
                </div>
              );
            })}
            {orderedApps.length === 0 && (
              <div className="empty-message">No apps yet</div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <div
          className={`sidebar-header ${shouldHighlightSettingsHeader ? 'active' : ''}`}
          onClick={() => {
            setExpandedGroup('settings');
            onSelectSettingsSection(null);
            onViewChange('settings');
          }}
          aria-expanded={isSettingsExpanded}
        >
          <span>Settings</span>
        </div>
        <div className={`sidebar-content ${isSettingsExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="sidebar-list">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const accentStyle = { '--sidebar-accent': section.accent } as CSSProperties;
              const isSelected = currentView === 'settings' && settingsSection === section.id;
              return (
                <div
                  key={section.id}
                  className={`sidebar-item ${isSelected ? 'selected' : ''}`}
                  style={accentStyle}
                  onClick={() => handleSettingsSectionSelect(section.id)}
                >
                  <div className="item-name">{section.title}</div>
                  <Icon className="sidebar-item-icon" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
