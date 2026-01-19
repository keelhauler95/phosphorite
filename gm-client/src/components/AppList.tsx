import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type DragEvent,
  type FormEvent
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bot,
  BookOpen,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Terminal as TerminalIcon,
  Trash2,
  Plus
} from 'lucide-react';
import { GameApp, Character, AppCategory } from '../types';

interface Props {
  apps: GameApp[];
  characters: Character[];
  onSelect: (app: GameApp) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onCreate: (input: { name: string; category: AppCategory }) => Promise<void>;
}

const CATEGORY_META: Record<string, { icon: LucideIcon; accent: string; accentRgb: string }> = {
  Text: { icon: FileText, accent: 'var(--color-accent-cyan)', accentRgb: 'var(--color-accent-cyan-rgb)' },
  Telemetry: { icon: Activity, accent: 'var(--color-accent-green)', accentRgb: 'var(--color-accent-green-rgb)' },
  Logbook: { icon: BookOpen, accent: 'var(--color-accent-amber)', accentRgb: 'var(--color-accent-amber-rgb)' },
  Image: { icon: ImageIcon, accent: 'var(--color-accent-magenta)', accentRgb: 'var(--color-accent-magenta-rgb)' },
  Map: { icon: MapPin, accent: 'var(--color-accent-blue)', accentRgb: 'var(--color-accent-blue-rgb)' },
  Terminal: { icon: TerminalIcon, accent: 'var(--color-accent-violet)', accentRgb: 'var(--color-accent-violet-rgb)' },
  AI_Chat: { icon: Bot, accent: 'var(--color-accent-red)', accentRgb: 'var(--color-accent-red-rgb)' },
  default: { icon: MessageSquare, accent: 'var(--color-accent-cyan)', accentRgb: 'var(--color-accent-cyan-rgb)' }
};

const pad = (value: number) => value.toString().padStart(2, '0');

const formatGameTime = (serialized?: string) => {
  if (!serialized) return 'Awaiting activity';
  try {
    const parsed = JSON.parse(serialized);
    if (parsed && typeof parsed === 'object' && 'era' in parsed) {
      return `Era ${parsed.era}, Day ${parsed.day} · ${pad(parsed.hour || 0)}:${pad(parsed.minute || 0)}`;
    }
  } catch (error) {
    // Fall back to Date parsing below
  }

  const fallbackDate = new Date(serialized);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.toLocaleString();
  }

  return '—';
};

function AppList({ apps, characters, onSelect, onDelete, onReorder, onCreate }: Props) {

  const allowedLookup = useMemo(() => {
    return characters.reduce<Record<string, string>>((acc, character) => {
      const fullName = `${character.first_name || ''} ${character.last_name || ''}`.trim();
      acc[character.username] = fullName || character.username;
      return acc;
    }, {});
  }, [characters]);

  const [orderedApps, setOrderedApps] = useState<GameApp[]>(apps);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dropCommittedRef = useRef(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const [isCreateActive, setIsCreateActive] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [newAppCategory, setNewAppCategory] = useState<AppCategory>(AppCategory.TEXT);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const categoryOptions = useMemo(() => Object.values(AppCategory), []);

  useEffect(() => {
    setOrderedApps(apps);
  }, [apps]);

  useEffect(() => {
    if (isCreateActive) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [isCreateActive]);

  const handleDelete = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    onDelete(id);
  };

  const handleKeyPress = (event: KeyboardEvent, app: GameApp) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(app);
    }
  };

  const resetCreateState = () => {
    setIsCreateActive(false);
    setNewAppName('');
    setNewAppCategory(AppCategory.TEXT);
    setCreateError(null);
  };

  const handleCreateCardActivate = () => {
    setIsCreateActive(true);
    setCreateError(null);
  };

  const handleCreateCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCreateCardActivate();
    }
    if (event.key === 'Escape') {
      resetCreateState();
    }
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newAppName.trim()) {
      setCreateError('Name is required');
      return;
    }
    setIsSubmittingCreate(true);
    setCreateError(null);
    try {
      await onCreate({
        name: newAppName.trim(),
        category: newAppCategory
      });
      resetCreateState();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to create app';
      setCreateError(message);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleCancelCreate = () => {
    if (isSubmittingCreate) return;
    resetCreateState();
  };

  const renderAllowedPreview = (app: GameApp) => {
    const hasGlobalAccess = app.allowed_users.includes('*');
    if (hasGlobalAccess) {
      return {
        headerCount: 'ALL CREW',
        preview: ['All crew'],
        overflow: 0
      };
    }

    const mappedUsers = app.allowed_users.map(user => allowedLookup[user] || user);
    const preview = mappedUsers.slice(0, 3);
    const overflow = Math.max(mappedUsers.length - preview.length, 0);

    const crewTotal = characters.length;

    return {
      headerCount: mappedUsers.length
        ? crewTotal
          ? `${mappedUsers.length}/${crewTotal}`
          : `${mappedUsers.length}`
        : 'NONE',
      preview: mappedUsers.length ? preview : ['Assign crew to enable'],
      overflow
    };
  };

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

  const finalizeOrder = useCallback(() => {
    const orderedIds = orderedApps.map(app => app.id);
    if (orderedIds.length) {
      onReorder(orderedIds);
    }
  }, [orderedApps, onReorder]);

  const handleCardDragStart = (event: DragEvent<HTMLElement>, appId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', appId);
    setDraggingId(appId);
    setDragOverId(appId);
    dropCommittedRef.current = false;
  };

  const handleCardDragOver = (event: DragEvent<HTMLElement>, overId: string) => {
    event.preventDefault();
    if (!draggingId || draggingId === overId) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const shouldPlaceAfter = event.clientY > rect.top + rect.height / 2;
    setOrderedApps(prev => reorderList(prev, draggingId, overId, shouldPlaceAfter));
    setDragOverId(overId);
  };

  const handleCardDragLeave = (overId: string) => {
    if (dragOverId === overId) {
      setDragOverId(null);
    }
  };

  const handleCardDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggingId) return;
    setDraggingId(null);
    setDragOverId(null);
    dropCommittedRef.current = true;
    finalizeOrder();
  };

  const handleCardDragEnd = () => {
    if (!dropCommittedRef.current) {
      setOrderedApps(apps);
    }
    setDraggingId(null);
    setDragOverId(null);
    dropCommittedRef.current = false;
  };

  const isEmpty = orderedApps.length === 0;

  return (
    <div className="list app-grid-wrapper">
      {isEmpty && (
        <p className="empty-message subtle">No apps yet. Create one to get started.</p>
      )}
      <div className="app-grid">
        {orderedApps.map(app => {
          const meta = CATEGORY_META[app.category] || CATEGORY_META.default;
          const Icon = meta.icon;
          const accentStyle = {
            '--app-accent': meta.accent,
            '--app-accent-rgb': meta.accentRgb
          } as CSSProperties;
          const { headerCount, preview, overflow } = renderAllowedPreview(app);
          const updatedLabel = formatGameTime(app.updated_at);
          const orderLabel = `#${pad((app.order_index ?? 0) + 1)}`;
          const isDragging = draggingId === app.id;
          const isDragOver = dragOverId === app.id && !isDragging;

          return (
            <article
              key={app.id}
              className={`app-card ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
              style={accentStyle}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(app)}
              onKeyDown={(event) => handleKeyPress(event, app)}
              draggable
              onDragStart={(event) => handleCardDragStart(event, app.id)}
              onDragOver={(event) => handleCardDragOver(event, app.id)}
              onDragLeave={() => handleCardDragLeave(app.id)}
              onDrop={handleCardDrop}
              onDragEnd={handleCardDragEnd}
              aria-grabbed={isDragging}
            >
              <header className="app-card-header">
                <div className="app-card-icon">
                  <Icon aria-hidden="true" />
                </div>
                <div className="app-card-title">
                  <span className="app-card-order">{orderLabel}</span>
                  <h3>{app.name}</h3>
                </div>
                <button
                  type="button"
                  className="ghost-btn icon danger app-card-delete"
                  aria-label={`Delete ${app.name}`}
                  onClick={(event) => handleDelete(event, app.id)}
                >
                  <Trash2 size={16} />
                </button>
              </header>

              <div className="app-card-body">
                <div className="app-card-stat">
                  <div className="app-card-stat-header">
                    <span className="label">Access</span>
                    <span className="label subtle">{headerCount}</span>
                  </div>
                  <div className="app-card-chips">
                    {preview.map((name, index) => (
                      <span key={name + index} className="app-chip">{name}</span>
                    ))}
                    {overflow > 0 && (
                      <span className="app-chip ghost">+{overflow} more</span>
                    )}
                  </div>
                </div>
              </div>

              <footer className="app-card-meta">
                <p className="app-card-updated">Updated {updatedLabel}</p>
              </footer>
            </article>
          );
        })}
        <article
          className={`app-card create-card ${isCreateActive ? 'active' : ''}`}
          role={isCreateActive ? undefined : 'button'}
          tabIndex={isCreateActive ? -1 : 0}
          onClick={!isCreateActive ? handleCreateCardActivate : undefined}
          onKeyDown={!isCreateActive ? handleCreateCardKeyDown : undefined}
          aria-label="Add new app"
        >
          {isCreateActive ? (
            <form
              className="create-app-form"
              onSubmit={handleCreateSubmit}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleCancelCreate();
                }
              }}
            >
              <p className="create-app-eyebrow">Create App</p>
              <label className="create-app-field">
                <span>Name</span>
                <input
                  ref={createInputRef}
                  type="text"
                  value={newAppName}
                  onChange={(event) => setNewAppName(event.target.value)}
                  placeholder="Enter app name"
                  disabled={isSubmittingCreate}
                  required
                />
              </label>
              <label className="create-app-field">
                <span>Type</span>
                <select
                  value={newAppCategory}
                  onChange={(event) => setNewAppCategory(event.target.value as AppCategory)}
                  disabled={isSubmittingCreate}
                  required
                >
                  {categoryOptions.map(category => (
                    <option key={category} value={category}>
                      {category.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              {createError && (
                <p className="create-app-error" aria-live="polite">{createError}</p>
              )}
              <div className="create-app-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleCancelCreate}
                  disabled={isSubmittingCreate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="accent-btn"
                  disabled={isSubmittingCreate}
                >
                  {isSubmittingCreate ? 'Creating…' : 'Create App'}
                </button>
              </div>
            </form>
          ) : (
            <div className="create-app-prompt">
              <div className="create-app-icon" aria-hidden="true">
                <Plus size={22} />
              </div>
              <p>Add new app</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

export default AppList;
