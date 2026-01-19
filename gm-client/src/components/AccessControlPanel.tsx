import { MouseEvent, useMemo, useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { Character } from '../types';

interface AccessControlPanelProps {
  title?: string;
  characters: Character[];
  selectedUsernames: Set<string>;
  onToggleUser: (username: string) => void;
  defaultCollapsed?: boolean;
}

function AccessControlPanel({
  title = 'Access Control',
  characters,
  selectedUsernames,
  onToggleUser,
  defaultCollapsed = true
}: AccessControlPanelProps) {
  const roster = useMemo(() => {
    return [...characters].sort((a, b) => a.username.localeCompare(b.username));
  }, [characters]);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const bodyId = useId();
  const granted = selectedUsernames.size;
  const total = characters.length || 0;
  const displayTitle = title.toUpperCase();

  const togglePanel = () => setIsCollapsed(prev => !prev);

  const handleSectionClick = (event: MouseEvent<HTMLElement>) => {
    // Prevent toggle when clicking interactive elements inside
    const target = event.target as HTMLElement;
    if (target.closest('input, label')) {
      return;
    }
    togglePanel();
  };

  return (
    <section 
      className={`access-panel${isCollapsed ? ' is-collapsed' : ''}`}
      onClick={handleSectionClick}
    >
      <div className="access-panel-header">
        <div className="access-panel-labels">
          <span className="access-panel-eyebrow">{displayTitle}</span>
        </div>
        <div className="access-panel-meta">
          <span className="access-panel-count" aria-live="polite">
            {granted}
            <span aria-hidden="true">/{total}</span>
          </span>
          <ChevronDown className="access-panel-chevron" aria-hidden="true" />
        </div>
      </div>

      <div id={bodyId} className="access-panel-body">
        <div className="access-panel-list">
          {roster.length === 0 ? (
            <p className="access-panel-empty">No crew records available.</p>
          ) : (
            roster.map((char) => {
              const isActive = selectedUsernames.has(char.username);
              const fullName = `${char.first_name} ${char.last_name}`.trim() || char.username;

              return (
                <label key={char.id} className={`access-chip${isActive ? ' is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggleUser(char.username)}
                    aria-label={`Toggle access for ${fullName}`}
                  />
                  <div className="access-chip-meta">
                    <span className="access-chip-handle">@{char.username}</span>
                    <span className="access-chip-name">{fullName}</span>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

export default AccessControlPanel;
