import { useState, useEffect, useMemo } from 'react';
import { GameApp, Character, LogbookAppData, LogEntry, LogSeverity, GameTime } from '../types';
import { appsApi } from '../services/api';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, ArrowDown01, ArrowUp10, ArrowDownAZ, ArrowUpZA, Check, ChevronUp, ChevronDown, Pencil, Plus, Trash2, X, Search, SlidersHorizontal } from 'lucide-react';
import AccessControlPanel from './AccessControlPanel';

interface LogbookAppProps {
  app: GameApp;
  characters: Character[];
  currentGameTime: GameTime | null;
  onBack: () => void;
  onDelete: (id: string) => void;
}

type SortField = 'timestamp' | 'severity' | 'author' | 'text';
type SortOrder = 'asc' | 'desc';

const TIME_FIELDS: Array<{ key: keyof GameTime; label: string; min?: number; max?: number }> = [
  { key: 'era', label: 'Era' },
  { key: 'day', label: 'Day' },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'minute', label: 'Min', min: 0, max: 59 },
  { key: 'second', label: 'Sec', min: 0, max: 59 }
];

const SEVERITY_OPTIONS: Array<{ value: LogSeverity; label: string }> = [
  { value: LogSeverity.INFO, label: 'Info' },
  { value: LogSeverity.IMPORTANT, label: 'Important' },
  { value: LogSeverity.WARNING, label: 'Warning' },
  { value: LogSeverity.ERROR, label: 'Error' }
];

const DEFAULT_GAME_TIME: GameTime = { era: 0, day: 1, hour: 0, minute: 0, second: 0 };

const coerceNumber = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const parseLogEntryTimestamp = (raw: unknown): GameTime | null => {
  if (!raw) {
    return null;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseLogEntryTimestamp(parsed);
    } catch {
      return null;
    }
  }

  if (typeof raw === 'object') {
    return {
      era: coerceNumber((raw as any).era, DEFAULT_GAME_TIME.era),
      day: coerceNumber((raw as any).day, DEFAULT_GAME_TIME.day),
      hour: coerceNumber((raw as any).hour, DEFAULT_GAME_TIME.hour),
      minute: coerceNumber((raw as any).minute, DEFAULT_GAME_TIME.minute),
      second: coerceNumber((raw as any).second, DEFAULT_GAME_TIME.second)
    };
  }

  return null;
};

const ensureTimestampString = (raw: unknown): string => {
  if (typeof raw === 'string') {
    return raw;
  }
  const parsed = parseLogEntryTimestamp(raw);
  return JSON.stringify(parsed ?? DEFAULT_GAME_TIME);
};

const sanitizeLogbookData = (data?: LogbookAppData | null): LogbookAppData => {
  const entries = Array.isArray(data?.entries) ? data!.entries : [];
  const sanitizedEntries: LogEntry[] = entries.map((entry) => {
    const timestampSource = (entry as LogEntry & { timestamp: unknown }).timestamp;
    return {
      ...entry,
      timestamp: ensureTimestampString(timestampSource)
    };
  });
  return { entries: sanitizedEntries };
};

function LogbookApp({ app, characters, currentGameTime, onBack, onDelete }: LogbookAppProps) {
  const logbookData: LogbookAppData = useMemo(() => sanitizeLogbookData(app.data as LogbookAppData | undefined), [app.data]);
  
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<{ [key: string]: Partial<LogEntry> }>({});
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [newEntryDraft, setNewEntryDraft] = useState<LogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  
  // Filtering and sorting state
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | ''>('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const newEntryGameTime = useMemo(() => {
    if (!newEntryDraft) return null;
    return parseLogEntryTimestamp(newEntryDraft.timestamp);
  }, [newEntryDraft]);

  useEffect(() => {
    setSelectedUsers(new Set(app.allowed_users));
  }, [app.allowed_users]);

  const toggleUser = async (username: string) => {
    const newUsers = new Set(selectedUsers);
    if (newUsers.has(username)) {
      newUsers.delete(username);
    } else {
      newUsers.add(username);
    }
    setSelectedUsers(newUsers);
    
    setError(null);
    try {
      await appsApi.update(app.id, { allowed_users: Array.from(newUsers) });
    } catch (err: any) {
      console.error('Failed to update allowed users:', err);
      setError(err.response?.data?.error || 'Failed to update allowed users');
      setSelectedUsers(new Set(app.allowed_users));
    }
  };

  const saveAppData = async (newData: LogbookAppData) => {
    const sanitizedData = sanitizeLogbookData(newData);
    setError(null);
    try {
      await appsApi.update(app.id, { data: sanitizedData });
    } catch (error: any) {
      console.error('Failed to save logbook data:', error);
      setError(error.response?.data?.error || 'Failed to save logbook data');
    }
  };

  const handleAddEntry = () => {
    if (!currentGameTime) {
      alert('No game time available');
      return;
    }

    if (newEntryDraft) {
      alert('Finish the current draft before creating another entry.');
      return;
    }

    const newEntry: LogEntry = {
      id: uuidv4(),
      timestamp: JSON.stringify(currentGameTime),
      severity: LogSeverity.INFO,
      author: '',
      text: ''
    };

    setNewEntryDraft(newEntry);
  };

  const handleEditField = (entryId: string, field: keyof LogEntry, value: any) => {
    setEditingData(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value
      }
    }));
  };

  const handleNewEntryFieldChange = (field: keyof LogEntry, value: any) => {
    setNewEntryDraft(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveNewEntry = () => {
    if (!newEntryDraft) return;

    if (newEntryDraft.text.length > 256) {
      alert('Text must be 256 characters or less');
      return;
    }

    const newData = {
      entries: [newEntryDraft, ...logbookData.entries]
    };

    saveAppData(newData);
    setNewEntryDraft(null);
  };

  const handleCancelNewEntry = () => {
    setNewEntryDraft(null);
  };

  const updateNewEntryTimestamp = (updates: Partial<GameTime>) => {
    if (!newEntryDraft) return;
    const time = parseLogEntryTimestamp(newEntryDraft.timestamp);
    if (!time) return;
    const newTime = { ...time, ...updates };
    handleNewEntryFieldChange('timestamp', JSON.stringify(newTime));
  };

  const handleSaveEntry = (entryId: string) => {
    const changes = editingData[entryId];
    if (!changes) {
      setEditingEntryId(null);
      return;
    }

    const entry = logbookData.entries.find(e => e.id === entryId);
    if (!entry) return;

    // Validate text length
    if (changes.text !== undefined && changes.text.length > 256) {
      alert('Text must be 256 characters or less');
      return;
    }

    const updatedEntry = { ...entry, ...changes };
    const newEntries = logbookData.entries.map(e => 
      e.id === entryId ? updatedEntry : e
    );
    
    saveAppData({ entries: newEntries });
    
    // Clear editing state
    setEditingEntryId(null);
    setEditingData(prev => {
      const newData = { ...prev };
      delete newData[entryId];
      return newData;
    });
  };

  const cancelEditingEntry = (entryId: string) => {
    setEditingEntryId(null);
    setEditingData(prev => {
      const newData = { ...prev };
      delete newData[entryId];
      return newData;
    });
  };

  const handleDeleteEntry = (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry?')) return;
    
    const newData = {
      entries: logbookData.entries.filter(entry => entry.id !== id)
    };
    saveAppData(newData);
    
    // Clear editing state if deleting currently edited entry
    if (editingEntryId === id) {
      cancelEditingEntry(id);
    }
  };

  const handleDelete = () => {
    onDelete(app.id);
  };

  const formatGameTime = (rawTimestamp: string | GameTime): string => {
    const time = parseLogEntryTimestamp(rawTimestamp);
    if (!time) {
      return 'Invalid Time';
    }
    return `E${time.era} D${time.day} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:${String(time.second).padStart(2, '0')}`;
  };

  const getGameTimeValue = (rawTimestamp: string | GameTime): number => {
    const time = parseLogEntryTimestamp(rawTimestamp);
    if (!time) {
      return 0;
    }
    return time.era * 1000000 + time.day * 100000 + time.hour * 3600 + time.minute * 60 + time.second;
  };

  const getSeverityOrder = (sev: LogSeverity): number => {
    switch (sev) {
      case LogSeverity.INFO: return 1;
      case LogSeverity.IMPORTANT: return 2;
      case LogSeverity.WARNING: return 3;
      case LogSeverity.ERROR: return 4;
      default: return 0;
    }
  };

  const getDisplayValue = (entry: LogEntry, field: keyof LogEntry) => {
    const editData = editingData[entry.id];
    if (editData && field in editData) {
      return editData[field];
    }
    return entry[field];
  };
  const latestEntryDisplay = useMemo(() => {
    if (!logbookData.entries.length) {
      return 'No transmissions logged';
    }

    const newest = [...logbookData.entries].sort(
      (a, b) => getGameTimeValue(b.timestamp) - getGameTimeValue(a.timestamp)
    )[0];

    return formatGameTime(newest.timestamp);
  }, [logbookData.entries]);

  // Filter and sort entries
  const filteredAndSortedEntries = useMemo(() => {
    // Filter
    let filtered = logbookData.entries.filter(entry => {
      const authorMatch = !filterAuthor || entry.author.toLowerCase().includes(filterAuthor.toLowerCase());
      const textMatch = !filterText || entry.text.toLowerCase().includes(filterText.toLowerCase());
      const severityMatch = !filterSeverity || entry.severity === filterSeverity;
      
      return authorMatch && textMatch && severityMatch;
    });

    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortField) {
        case 'timestamp':
          compareValue = getGameTimeValue(a.timestamp) - getGameTimeValue(b.timestamp);
          break;
        case 'severity':
          compareValue = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
          break;
        case 'author':
          compareValue = a.author.localeCompare(b.author);
          break;
        case 'text':
          compareValue = a.text.localeCompare(b.text);
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [logbookData.entries, filterAuthor, filterText, filterSeverity, sortField, sortOrder]);

  return (
    <div className="app-interface logbook-app">
      <div className="app-interface-header">
        <div className="app-interface-title-row">
          <div className="app-title-cluster">
            <button onClick={onBack} className="back-btn" title="Back to apps list" type="button">
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="sr-only">Back to apps list</span>
            </button>
            <h2>{app.name}</h2>
            <span className="category-badge">{app.category}</span>
          </div>
          <button onClick={handleDelete} className="delete-btn" title="Delete this app" type="button">
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete App</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      <div className="app-access-shell">
        <AccessControlPanel
          characters={characters}
          selectedUsernames={selectedUsers}
          onToggleUser={toggleUser}
          title="Access Control"
          defaultCollapsed
        />
      </div>

      <div className="app-interface-content logbook-shell">
        <div className="logbook-grid">
          <section className="app-surface logbook-panel logbook-panel-controls">
            <div className="panel-header compact" style={{marginBottom: '0.5rem', borderBottom: 'none', paddingBottom: 0}}>
              <span className="eyebrow">Filter</span>
            </div>

            <div className="logbook-stat-grid two-row">
              <div className="logbook-stat-card">
                <span className="label">Total</span>
                <strong>{logbookData.entries.length}</strong>
                {/* removed label */}
              </div>
              <div className="logbook-stat-card">
                <span className="label">Filtered</span>
                <strong>{filteredAndSortedEntries.length}</strong>
                {/* removed label */}
              </div>
              <div className="logbook-stat-card">
                <span className="label">Last</span>
                <strong>{latestEntryDisplay}</strong>
                {/* removed label */}
              </div>
            </div>

            <div className="conversation-filters compact">
              <div className="filter-main-bar">
                <div className="filter-chip search-chip">
                  <Search width={14} height={14} className="search-chip-icon" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder="Search text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                  />
                  <div className="search-chip-actions">
                    <button
                      type="button"
                      className={`search-action-btn ${advancedFiltersOpen ? 'active' : ''}`}
                      onClick={() => setAdvancedFiltersOpen(prev => !prev)}
                      aria-expanded={advancedFiltersOpen}
                      title={advancedFiltersOpen ? 'Hide filters' : 'Show filters'}
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                    <button
                      type="button"
                      className="search-action-btn"
                      onClick={() => {
                        setFilterText('');
                        setFilterAuthor('');
                        setFilterSeverity('');
                      }}
                      title="Clear filters"
                      disabled={!filterText && !filterAuthor && !filterSeverity}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div
                className={`filter-advanced-wrapper ${advancedFiltersOpen ? 'open' : ''}`}
                aria-hidden={!advancedFiltersOpen}
              >
                <div className="filter-advanced-panel">
                  <div className="filter-quick-grid two-column">
                    <label className="filter-field">
                      <span>Author</span>
                      <input
                        type="text"
                        placeholder="crew_member"
                        value={filterAuthor}
                        onChange={(e) => setFilterAuthor(e.target.value)}
                      />
                    </label>
                    <label className="filter-field">
                      <span>Severity</span>
                      <select
                        value={filterSeverity}
                        onChange={(e) => setFilterSeverity(e.target.value as LogSeverity | '')}
                      >
                        <option value="">All severities</option>
                        {SEVERITY_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="sort-inputs">
                    <select
                      value={sortField}
                      onChange={(e) => setSortField(e.target.value as SortField)}
                      aria-label="Sort by"
                    >
                      <option value="timestamp">Game Time</option>
                      <option value="severity">Severity</option>
                      <option value="author">Author</option>
                      <option value="text">Entry Text</option>
                    </select>
                    {(() => {
                      // Determine icon and label as in comms view
                      const isAlpha = sortField === 'author' || sortField === 'text';
                      const DirectionIcon = isAlpha
                        ? (sortOrder === 'asc' ? ArrowDownAZ : ArrowUpZA)
                        : (sortOrder === 'asc' ? ArrowDown01 : ArrowUp10);
                      const sortOrderLabel = `${sortOrder === 'asc' ? 'Ascending' : 'Descending'} ${isAlpha ? 'alphabetical' : sortField === 'severity' ? 'severity' : 'chronological'} sort`;
                      return (
                        <button
                          type="button"
                          className="sort-direction-btn"
                          onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                          title={`${sortOrderLabel} (click to toggle)`}
                          aria-label={`${sortOrderLabel} (click to toggle)`}
                        >
                          <DirectionIcon width={18} height={18} aria-hidden="true" />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="app-surface logbook-panel logbook-panel-feed">
            <div className="panel-header compact" style={{marginBottom: '0.5rem', borderBottom: 'none', paddingBottom: 0, justifyContent: 'space-between'}}>
              <span className="eyebrow">Log</span>
              <button
                onClick={handleAddEntry}
                type="button"
                className="logbook-add-btn icon-only"
                disabled={!currentGameTime || !!newEntryDraft}
                title={!currentGameTime ? 'No game time available' : newEntryDraft ? 'Finish the current draft before adding another' : 'Add new log entry'}
                aria-label={!currentGameTime ? 'Cannot create entry without game time' : 'Create new log entry'}
                style={{ background: 'rgba(var(--color-void-rgb), .95)' }}
              >
                <Plus size={16} aria-hidden="true" />
                <span className="sr-only">New entry</span>
              </button>
            </div>

            <p className="logbook-panel-caption">
              {filteredAndSortedEntries.length} showing · {logbookData.entries.length} total
            </p>

            <div className="logbook-timeline logbook-timeline-scroll">
              {newEntryDraft && (
                <article className="logbook-entry logbook-entry--draft" data-severity={newEntryDraft.severity}>
                  <header className="logbook-entry-header">
                    <div className="logbook-entry-meta">
                      <span className="logbook-severity-pill">{newEntryDraft.severity}</span>
                      <div>
                        <p className="logbook-entry-time">{formatGameTime(newEntryDraft.timestamp)}</p>
                        <p className="logbook-entry-author">{newEntryDraft.author || '—'}</p>
                      </div>
                      <span className="logbook-entry-pill">Draft</span>
                    </div>
                    <div className="logbook-entry-actions">
                      <button
                        type="button"
                        onClick={handleSaveNewEntry}
                        className="logbook-icon-btn success"
                        aria-label="Save new entry"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelNewEntry}
                        className="logbook-icon-btn ghost"
                        aria-label="Discard new entry"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </header>
                  <div className="logbook-entry-edit-grid">
                    <div className="logbook-field">
                      <span className="logbook-field-label">Severity</span>
                      <select
                        className="logbook-input"
                        value={newEntryDraft.severity}
                        onChange={(e) => handleNewEntryFieldChange('severity', e.target.value as LogSeverity)}
                      >
                        {SEVERITY_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="logbook-field">
                      <span className="logbook-field-label">Author</span>
                      <input
                        type="text"
                        className="logbook-input"
                        value={newEntryDraft.author}
                        onChange={(e) => handleNewEntryFieldChange('author', e.target.value)}
                      />
                    </div>
                    <div className="logbook-field logbook-field--full">
                      <span className="logbook-field-label">Log Text</span>
                      <textarea
                        className="logbook-textarea"
                        value={newEntryDraft.text}
                        onChange={(e) => handleNewEntryFieldChange('text', e.target.value.slice(0, 256))}
                      />
                      <span className="logbook-char-count">{newEntryDraft.text.length}/256 characters</span>
                    </div>
                    <div className="logbook-field logbook-field--full">
                      <span className="logbook-field-label">Game Time</span>
                      {newEntryGameTime ? (
                        <div className="logbook-time-grid">
                          {TIME_FIELDS.map(field => (
                            <div key={field.key} className="logbook-time-field">
                              <span>{field.label}</span>
                              <div className="logbook-time-input-wrapper">
                                <input
                                  type="number"
                                  className="logbook-time-number"
                                  min={field.min}
                                  max={field.max}
                                  value={newEntryGameTime[field.key]}
                                  onChange={(e) => updateNewEntryTimestamp({
                                    [field.key]: parseInt(e.target.value, 10) || 0
                                  })}
                                />
                                <div className="logbook-time-chevron-stack">
                                  <button
                                    type="button"
                                    className="logbook-time-chevron"
                                    onClick={() => updateNewEntryTimestamp({
                                      [field.key]: Math.min((field.max ?? Infinity), newEntryGameTime[field.key] + 1)
                                    })}
                                    aria-label={`Increase ${field.label}`}
                                  >
                                    <ChevronUp size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="logbook-time-chevron"
                                    onClick={() => updateNewEntryTimestamp({
                                      [field.key]: Math.max((field.min ?? 0), newEntryGameTime[field.key] - 1)
                                    })}
                                    aria-label={`Decrease ${field.label}`}
                                  >
                                    <ChevronDown size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="logbook-time-warning">Timestamp data could not be parsed.</span>
                      )}
                    </div>
                  </div>
                </article>
              )}

              {filteredAndSortedEntries.length === 0 ? (
                <div className="logbook-empty">
                  {logbookData.entries.length === 0 ? 'No log entries yet.' : 'No entries match the current filters.'}
                </div>
              ) : (
                filteredAndSortedEntries.map((entry) => {
                  const isEditing = editingEntryId === entry.id;
                  const displaySeverity = getDisplayValue(entry, 'severity') as LogSeverity;
                  const displayAuthor = getDisplayValue(entry, 'author') as string;
                  const displayText = getDisplayValue(entry, 'text') as string;
                  const displayTimestamp = getDisplayValue(entry, 'timestamp') as string | GameTime;

                  const gameTime = parseLogEntryTimestamp(displayTimestamp);

                  const updateTimestamp = (updates: Partial<GameTime>) => {
                    if (!gameTime) return;
                    const newTime = { ...gameTime, ...updates };
                    handleEditField(entry.id, 'timestamp', JSON.stringify(newTime));
                  };

                  return (
                    <article key={entry.id} className={`logbook-entry${isEditing ? ' is-editing' : ''}`} data-severity={displaySeverity}>
                      <header className="logbook-entry-header">
                        <div className="logbook-entry-meta">
                          <span className="logbook-severity-pill">{displaySeverity}</span>
                          <div>
                            <p className="logbook-entry-time">{formatGameTime(displayTimestamp)}</p>
                            <p className="logbook-entry-author">{displayAuthor || '—'}</p>
                          </div>
                        </div>
                        <div className="logbook-entry-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveEntry(entry.id)}
                                className="logbook-icon-btn success"
                                aria-label="Save entry"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelEditingEntry(entry.id)}
                                className="logbook-icon-btn ghost"
                                aria-label="Cancel editing"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingEntryId(entry.id)}
                              className="logbook-icon-btn"
                              aria-label="Edit entry"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="logbook-icon-btn danger"
                            aria-label="Delete entry"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </header>

                      {isEditing ? (
                        <div className="logbook-entry-edit-grid">
                          <div className="logbook-field">
                            <span className="logbook-field-label">Severity</span>
                            <select
                              className="logbook-input"
                              value={displaySeverity}
                              onChange={(e) => handleEditField(entry.id, 'severity', e.target.value as LogSeverity)}
                            >
                              {SEVERITY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="logbook-field">
                            <span className="logbook-field-label">Author</span>
                            <input
                              type="text"
                              className="logbook-input"
                              value={displayAuthor}
                              onChange={(e) => handleEditField(entry.id, 'author', e.target.value)}
                            />
                          </div>
                          <div className="logbook-field logbook-field--full">
                            <span className="logbook-field-label">Log Text</span>
                            <textarea
                              className="logbook-textarea"
                              value={displayText}
                              onChange={(e) => handleEditField(entry.id, 'text', e.target.value.slice(0, 256))}
                            />
                            <span className="logbook-char-count">{displayText.length}/256 characters</span>
                          </div>
                          <div className="logbook-field logbook-field--full">
                            <span className="logbook-field-label">Game Time</span>
                            {gameTime ? (
                              <div className="logbook-time-grid">
                                {TIME_FIELDS.map(field => (
                                  <div key={field.key} className="logbook-time-field">
                                    <span>{field.label}</span>
                                    <div className="logbook-time-input-wrapper">
                                      <input
                                        type="number"
                                        className="logbook-time-number"
                                        min={field.min}
                                        max={field.max}
                                        value={gameTime ? gameTime[field.key] : ''}
                                        onChange={(e) => updateTimestamp({
                                          [field.key]: parseInt(e.target.value, 10) || 0
                                        })}
                                      />
                                      <div className="logbook-time-chevron-stack">
                                        <button
                                          type="button"
                                          className="logbook-time-chevron"
                                          onClick={() => updateTimestamp({
                                            [field.key]: Math.min((field.max ?? Infinity), (gameTime?.[field.key] ?? 0) + 1)
                                          })}
                                          aria-label={`Increase ${field.label}`}
                                        >
                                          <ChevronUp size={12} />
                                        </button>
                                        <button
                                          type="button"
                                          className="logbook-time-chevron"
                                          onClick={() => updateTimestamp({
                                            [field.key]: Math.max((field.min ?? 0), (gameTime?.[field.key] ?? 0) - 1)
                                          })}
                                          aria-label={`Decrease ${field.label}`}
                                        >
                                          <ChevronDown size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="logbook-time-warning">Timestamp data could not be parsed.</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="logbook-entry-text">
                          {displayText || <span className="logbook-entry-text--muted">No text provided.</span>}
                        </p>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default LogbookApp;
