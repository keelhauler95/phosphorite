import { Character, GameApp } from '../types';

interface Props {
  characters: Character[];
  apps: GameApp[];
  selectedId: number | null;
  onSelect: (character: Character) => void;
  onDelete: (id: number) => void;
  onCreate: () => void;
  isCreating?: boolean;
}

function CharacterList({ characters, apps, selectedId, onSelect, onDelete, onCreate, isCreating = false }: Props) {
  const resolveAppName = (appId?: string | null) => {
    if (!appId) return null;
    const app = apps.find(a => a.id === appId);
    return app ? app.name : null;
  };

  const getActivityLabel = (character: Character) => {
    if (character.current_section) {
      return character.current_section.toUpperCase();
    }
    const appName = resolveAppName(character.current_app_id);
    if (appName) {
      return appName.toUpperCase();
    }
    return 'IDLE';
  };

  const formatLastActivity = (timestamp?: string | null) => {
    if (!timestamp) {
      return '—';
    }
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return '—';
    }
    const diffMs = Date.now() - parsed.getTime();
    if (diffMs < 60_000) {
      return 'Just now';
    }
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Prevent row click when clicking delete
    onDelete(id);
  };

  return (
    <div className="character-roster">
      {characters.length === 0 ? (
        <p className="empty-message">No users yet. Create one to get started.</p>
      ) : (
        characters.map(character => {
          const isActive = selectedId === character.id;
          return (
            <div
              key={character.id}
              className={`roster-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(character)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(character);
                }
              }}
            >
              <div className="roster-item-main">
                <div className="roster-identity">
                  <span className="roster-username">{character.username}</span>
                  <span className="roster-name">{character.first_name} {character.last_name}</span>
                </div>
                <span className="roster-title">{character.title || 'No title'}</span>
              </div>
              <div className="roster-item-meta">
                <div className="roster-activity-block">
                  <span className="roster-app">
                    {getActivityLabel(character)}
                  </span>
                  <span className="roster-activity-time">
                    {formatLastActivity(character.last_activity_at)}
                  </span>
                </div>
                <button
                  className="roster-delete"
                  onClick={(e) => handleDelete(e, character.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })
      )}

      <button
        className={`ghost-btn roster-create-button ${isCreating ? 'active' : ''}`}
        onClick={onCreate}
      >
        + Create user
      </button>
    </div>
  );
}

export default CharacterList;
