import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { GameApp, Character, TelemetryAppData, MonitoringGroup, NumericalParameter, TextualParameter, GameTimeState } from '../types';
import { appsApi } from '../services/api';
import AccessControlPanel from './AccessControlPanel';
import ParameterEditor from './ParameterEditor';
import socketService from '../services/socket';
import { SocketEvent } from '../types';
import { getDominantStatus, getStatusCounts } from '../utils/telemetry';

interface TelemetryAppProps {
  app: GameApp;
  characters: Character[];
  currentGameTime: GameTimeState;
  onBack: () => void;
  onDelete: (id: string) => void;
}

const addSecondsToGameTime = (time: GameTimeState, seconds: number): GameTimeState => {
  let era = time.era;
  let day = time.day;
  let hour = time.hour;
  let minute = time.minute;
  let second = time.second + seconds;

  while (second >= 60) { second -= 60; minute += 1; }
  while (second < 0) { second += 60; minute -= 1; }
  while (minute >= 60) { minute -= 60; hour += 1; }
  while (minute < 0) { minute += 60; hour -= 1; }
  while (hour >= 24) { hour -= 24; day += 1; }
  while (hour < 0) { hour += 24; day -= 1; }
  while (day > 365) { day -= 365; era += 1; }
  while (day < 1) {
    if (era > 0) {
      era -= 1;
      day += 365;
    } else {
      day = 1; hour = 0; minute = 0; second = 0;
      break;
    }
  }

  return { ...time, era, day, hour, minute, second };
};

const useLiveGameTime = (gameTime: GameTimeState) => {
  const [liveTime, setLiveTime] = useState<GameTimeState>(gameTime);

  useEffect(() => {
    setLiveTime(gameTime);
    if (gameTime.is_paused) return;

    const update = () => {
      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((now - gameTime.real_time_ref) / 1000));
      setLiveTime(addSecondsToGameTime(gameTime, elapsedSeconds));
    };

    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [gameTime]);

  return liveTime;
};

function TelemetryApp({ app, characters, currentGameTime, onBack, onDelete }: TelemetryAppProps) {
  const [liveApp, setLiveApp] = useState(app);
  const liveGameTime = useLiveGameTime(currentGameTime);
  
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(liveApp.data?.monitoringGroups.length ? 0 : -1);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isInlineRenaming, setIsInlineRenaming] = useState(false);
  const [inlineGroupName, setInlineGroupName] = useState('');
  const [isParameterDraftOpen, setIsParameterDraftOpen] = useState(false);
  const [newParameterName, setNewParameterName] = useState('');
  const [newParameterType, setNewParameterType] = useState<'numerical' | 'textual'>('numerical');

  const resetParameterDraft = () => {
    setIsParameterDraftOpen(false);
    setNewParameterName('');
    setNewParameterType('numerical');
  };

  const groupNameInputRef = useRef<HTMLInputElement | null>(null);
  
  // Form state for new group
  const [groupName, setGroupName] = useState('');

  const monitoringGroups: MonitoringGroup[] = Array.isArray(liveApp.data?.monitoringGroups)
    ? (liveApp.data.monitoringGroups as MonitoringGroup[])
    : [];

  useEffect(() => {
    setSelectedUsers(new Set(app.allowed_users));
  }, [app.allowed_users]);

  useEffect(() => {
    if (monitoringGroups.length === 0) {
      setActiveGroupIndex(-1);
      return;
    }

    setActiveGroupIndex((prev) => {
      if (prev === -1) {
        return 0;
      }
      return Math.min(prev, monitoringGroups.length - 1);
    });
  }, [liveApp.data?.monitoringGroups.length]);

  useEffect(() => {
    setLiveApp(app);
  }, [app]);

  useEffect(() => {
    const handleAppUpdate = (payload: any) => {
      if (payload?.data?.id === app.id) {
        setLiveApp(payload.data);
      }
    };
    socketService.connect();
    socketService.on(SocketEvent.APP_UPDATED, handleAppUpdate);
    return () => {
      socketService.off(SocketEvent.APP_UPDATED, handleAppUpdate);
    };
  }, [app.id]);

  const toggleUser = async (username: string) => {
    const newUsers = new Set(selectedUsers);
    if (newUsers.has(username)) {
      newUsers.delete(username);
    } else {
      newUsers.add(username);
    }
    setSelectedUsers(newUsers);
    
    try {
      await appsApi.update(app.id, { allowed_users: Array.from(newUsers) });
    } catch (err: any) {
      console.error('Failed to update allowed users:', err);
      setSelectedUsers(new Set(app.allowed_users));
    }
  };

  const saveAppData = async (newData: TelemetryAppData) => {
    try {
      await appsApi.update(app.id, { data: newData });
    } catch (error) {
      console.error('Failed to save telemetry data:', error);
    }
  };

  const handleAddGroup = () => {
    if (!groupName.trim()) return;
    
    const newGroup: MonitoringGroup = {
      name: groupName.trim(),
      parameters: []
    };
    
    const newData = {
      monitoringGroups: [...monitoringGroups, newGroup]
    };
    
    saveAppData(newData);
    setGroupName('');
    setIsCreatingGroup(false);
    setIsInlineRenaming(false);
    setInlineGroupName('');
    setActiveGroupIndex(monitoringGroups.length);
  };

  const handleDeleteGroup = (groupIndex: number) => {
    const remainingGroups = monitoringGroups.filter((_, i) => i !== groupIndex);
    const newData = {
      monitoringGroups: remainingGroups
    };
    saveAppData(newData);

    if (isInlineRenaming && activeGroupIndex === groupIndex) {
      setIsInlineRenaming(false);
      setInlineGroupName('');
    }

    if (isParameterDraftOpen && activeGroupIndex === groupIndex) {
      resetParameterDraft();
    }

    if (remainingGroups.length === 0) {
      setActiveGroupIndex(-1);
      return;
    }

    setActiveGroupIndex((prev) => {
      if (prev === -1) return Math.min(groupIndex, remainingGroups.length - 1);
      if (groupIndex < prev) return prev - 1;
      if (groupIndex === prev) return Math.min(prev, remainingGroups.length - 1);
      return prev;
    });
  };

  const handleSelectGroup = (groupIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setIsInlineRenaming(false);
    setInlineGroupName('');
    resetParameterDraft();
  };

  const handleStartInlineRename = (groupIndex?: number) => {
    const targetIndex = typeof groupIndex === 'number' ? groupIndex : activeGroupIndex;
    if (targetIndex === -1) return;
    const targetGroup = monitoringGroups[targetIndex];
    if (!targetGroup) return;
    setActiveGroupIndex(targetIndex);
    resetParameterDraft();
    setIsInlineRenaming(true);
    setInlineGroupName(targetGroup.name);
  };

  const handleCancelInlineRename = () => {
    setIsInlineRenaming(false);
    const currentName = activeGroupIndex >= 0 ? monitoringGroups[activeGroupIndex]?.name ?? '' : '';
    setInlineGroupName(currentName);
  };

  const handleSaveInlineGroupName = () => {
    if (!isInlineRenaming || activeGroupIndex === -1) {
      setIsInlineRenaming(false);
      return;
    }
    const trimmed = inlineGroupName.trim();
    if (!trimmed) {
      handleCancelInlineRename();
      return;
    }
    const newGroups = [...monitoringGroups];
    if (!newGroups[activeGroupIndex]) return;
    if (newGroups[activeGroupIndex].name !== trimmed) {
      newGroups[activeGroupIndex] = {
        ...newGroups[activeGroupIndex],
        name: trimmed
      };
      saveAppData({ monitoringGroups: newGroups });
    }
    setIsInlineRenaming(false);
    setInlineGroupName(trimmed);
  };

  const handleDeleteParameter = (groupIndex: number, paramIndex: number) => {
    if (!monitoringGroups[groupIndex]) return;
    const newGroups = [...monitoringGroups];
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      parameters: newGroups[groupIndex].parameters.filter((_, i) => i !== paramIndex)
    };
    saveAppData({ monitoringGroups: newGroups });
  };

  const createDefaultNumericalParameter = (name: string): NumericalParameter => {
    const lowerLimit = 0;
    const upperLimit = 100;
    const value = 50;
    const range = upperLimit - lowerLimit;
    const criticalLower = lowerLimit + range * 0.1;
    const criticalUpper = upperLimit - range * 0.1;
    const warningLower = lowerLimit + range * 0.2;
    const warningUpper = upperLimit - range * 0.2;

    return {
      name,
      unit: '',
      value,
      lowerLimit,
      upperLimit,
      criticalLower,
      criticalUpper,
      warningLower,
      warningUpper,
      noise: 0,
      responsiveness: 0.1,
      targetValue: value
    };
  };

  const createDefaultTextualParameter = (name: string): TextualParameter => {
    return {
      name,
      unit: '',
      value: '',
      expectedValue: ''
    };
  };

  const handleCreateParameter = async () => {
    if (activeGroupIndex === -1) return;
    if (!monitoringGroups[activeGroupIndex]) return;
    if (!newParameterName.trim()) return;

    const trimmedName = newParameterName.trim();
    const newParam = newParameterType === 'numerical'
      ? createDefaultNumericalParameter(trimmedName)
      : createDefaultTextualParameter(trimmedName);

    const newGroups = [...monitoringGroups];
    newGroups[activeGroupIndex] = {
      ...newGroups[activeGroupIndex],
      parameters: [...newGroups[activeGroupIndex].parameters, newParam]
    };

    await saveAppData({ monitoringGroups: newGroups });
    resetParameterDraft();
  };

  const handleUpdateParameter = (groupIndex: number, paramIndex: number, param: NumericalParameter | TextualParameter) => {
    if (!monitoringGroups[groupIndex]) return;
    const newGroups = [...monitoringGroups];

    // Preserve server-controlled dynamic fields (like `value`) when updating
    // a parameter. This prevents the editor's auto-save from accidentally
    // writing stale `value` fields back to the backend and resetting live
    // telemetry. We merge the incoming `param` with the existing parameter
    // on the server, keeping `value` from the current `liveApp`.
    const updatedParameters = newGroups[groupIndex].parameters.map((p, index) => {
      if (index !== paramIndex) return p;

      // Merge but preserve the runtime `value` for numerical parameters only.
      // Textual parameters should save the edited `value` and `expectedValue`.
      const existing = p as NumericalParameter | TextualParameter;
      const merged = { ...param } as any;
      if (isNumerical(existing)) {
        merged.value = existing.value;
      }
      return merged as NumericalParameter | TextualParameter;
    });

    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      parameters: updatedParameters
    };

    saveAppData({ monitoringGroups: newGroups });
  };

  useEffect(() => {
    if (isInlineRenaming && (activeGroupIndex === -1 || !monitoringGroups[activeGroupIndex])) {
      setIsInlineRenaming(false);
      setInlineGroupName('');
    }
    if (isParameterDraftOpen && activeGroupIndex === -1) {
      resetParameterDraft();
    }
  }, [activeGroupIndex, isInlineRenaming, isParameterDraftOpen, monitoringGroups]);

  useEffect(() => {
    if (!isInlineRenaming) {
      const currentName = activeGroupIndex >= 0 ? monitoringGroups[activeGroupIndex]?.name ?? '' : '';
      setInlineGroupName(currentName);
    }
  }, [activeGroupIndex, isInlineRenaming, monitoringGroups]);

  useEffect(() => {
    if (isInlineRenaming) {
      groupNameInputRef.current?.focus();
      groupNameInputRef.current?.select();
    }
  }, [isInlineRenaming]);

  const isNumerical = (param: NumericalParameter | TextualParameter): param is NumericalParameter => {
    return 'targetValue' in param;
  };

  const activeGroup = activeGroupIndex >= 0 ? monitoringGroups[activeGroupIndex] : undefined;
  const numericalCount = activeGroup
    ? activeGroup.parameters.filter((param) => isNumerical(param)).length
    : 0;
  const textualCount = activeGroup ? activeGroup.parameters.length - numericalCount : 0;
  const hasActiveParameters = !!(activeGroup && activeGroup.parameters.length);

  const groupStatusCounts = monitoringGroups.map((group) => getStatusCounts(group.parameters));

  const handleInlineGroupNameBlur = () => {
    if (!isInlineRenaming) return;
    handleSaveInlineGroupName();
  };

  const renderParameterCreator = (fullWidth = false) => {
    if (!activeGroup) return null;
    return (
      <div
        className={`parameter-ghost-card${isParameterDraftOpen ? ' active' : ''}${fullWidth ? ' full-width' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!isParameterDraftOpen) {
            setIsParameterDraftOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !isParameterDraftOpen) {
            event.preventDefault();
            setIsParameterDraftOpen(true);
          }
        }}
      >
        {isParameterDraftOpen ? (
          <form
            className="parameter-ghost-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateParameter();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <label>
              Parameter Name
              <input
                type="text"
                value={newParameterName}
                onChange={(e) => setNewParameterName(e.target.value)}
                placeholder="Name"
                autoFocus
              />
            </label>
            <div className="parameter-ghost-type-toggle">
              <label>
                <input
                  type="radio"
                  value="numerical"
                  checked={newParameterType === 'numerical'}
                  onChange={() => setNewParameterType('numerical')}
                />
                <span>Numerical</span>
              </label>
              <label>
                <input
                  type="radio"
                  value="textual"
                  checked={newParameterType === 'textual'}
                  onChange={() => setNewParameterType('textual')}
                />
                <span>Textual</span>
              </label>
            </div>
            <div className="parameter-ghost-actions">
              <button type="submit" className="primary-btn small" disabled={!newParameterName.trim()}>
                <Plus size={14} />
                Create Parameter
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  resetParameterDraft();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="parameter-ghost-placeholder">
            <Plus size={16} />
            Add parameter
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-interface telemetry-app">
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
          <button
            onClick={() => {
              onDelete(app.id);
            }}
            className="delete-btn"
            title="Delete this app"
            type="button"
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete App</span>
          </button>
        </div>
      </div>

      <div className="app-access-shell">
        <AccessControlPanel
          characters={characters}
          selectedUsernames={selectedUsers}
          onToggleUser={toggleUser}
          title="Access Control"
          defaultCollapsed
        />
      </div>

      <div className="app-interface-content telemetry-shell">
        <div className="telemetry-left-column">
          <section className="telemetry-panel telemetry-groups-panel">
            <div className="panel-header compact">
              <span className="eyebrow">Monitoring Groups</span>
            </div>
            {/* subtitle removed per request */}

            <div className="telemetry-groups-list">
              {monitoringGroups.length === 0 && !isCreatingGroup && (
                <p className="empty-message subtle">No monitoring groups yet.</p>
              )}
              {monitoringGroups.map((group, index) => {
                const isActive = index === activeGroupIndex;
                const counts = groupStatusCounts[index];
                const groupStatus = getDominantStatus(counts);
                return (
                  <div
                    key={`${group.name}-${index}`}
                    className={`telemetry-group-card status-${groupStatus}${isActive ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectGroup(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectGroup(index);
                      }
                    }}
                  >
                    <div className="telemetry-group-card-top">
                      <div>
                        <p className="telemetry-group-name">{group.name}</p>
                        <p className="telemetry-group-meta">{group.parameters.length} parameters</p>
                      </div>
                      <button
                        type="button"
                        className="ghost-btn icon danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteGroup(index);
                        }}
                        title="Remove group"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="telemetry-group-health-badge" aria-label={`Nominal ${counts.nominal}, warning ${counts.warning}, alarm ${counts.alarm}`}>
                      <span className="health-dot nominal">{counts.nominal}</span>
                      <span className="health-dot warning">{counts.warning}</span>
                      <span className="health-dot alarm">{counts.alarm}</span>
                    </div>
                  </div>
                );
              })}

              <div
                className={`telemetry-group-card ghost${isCreatingGroup ? ' active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!isCreatingGroup) {
                    setIsCreatingGroup(true);
                    setGroupName('');
                  }
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !isCreatingGroup) {
                    event.preventDefault();
                    setIsCreatingGroup(true);
                    setGroupName('');
                  }
                }}
              >
                {isCreatingGroup ? (
                  <div className="telemetry-ghost-form" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="New group name"
                      autoFocus
                    />
                    <div className="telemetry-ghost-actions">
                      <button
                        type="button"
                        className="primary-btn small"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAddGroup();
                        }}
                      >
                        <Save size={14} />
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsCreatingGroup(false);
                          setGroupName('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="telemetry-ghost-placeholder">
                    <Plus size={16} />
                    Add monitoring group
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="telemetry-panel telemetry-main-panel">
          <div className="telemetry-panel-heading">
            <div className="telemetry-heading-block">
              <span className="eyebrow">Parameter Deck</span>
              {activeGroup ? (
                <div className="telemetry-inline-title">
                  <div className="telemetry-inline-title-row">
                    <input
                      ref={groupNameInputRef}
                      type="text"
                      value={inlineGroupName}
                      onChange={(e) => setInlineGroupName(e.target.value)}
                      className={`parameter-inline-input name group ${!isInlineRenaming ? 'read-only' : ''}`}
                      placeholder="Group name"
                      readOnly={!isInlineRenaming}
                      onBlur={handleInlineGroupNameBlur}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleSaveInlineGroupName();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          handleCancelInlineRename();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="ghost-btn icon"
                      onClick={() => (isInlineRenaming ? handleSaveInlineGroupName() : handleStartInlineRename())}
                      title={isInlineRenaming ? 'Save group name' : 'Rename group'}
                    >
                      {isInlineRenaming ? <Save size={14} /> : <Pencil size={14} />}
                    </button>
                  </div>
                  <p className="telemetry-panel-subtitle">
                    {`${activeGroup.parameters.length} parameters · ${numericalCount} numerical / ${textualCount} textual`}
                  </p>
                </div>
              ) : (
                <div>
                  <h3>No group selected</h3>
                  <p className="telemetry-panel-subtitle">
                    Choose a monitoring group to review and tweak its parameters.
                  </p>
                </div>
              )}
            </div>
          </div>

          {!activeGroup ? (
            <div className="telemetry-empty-state">
              <SlidersHorizontal size={32} />
              <p>Create or select a monitoring group to begin tweaking telemetry values.</p>
            </div>
          ) : (
            <div className="telemetry-parameters-grid">
              {/* Display all parameters with ParameterEditor */}
              {hasActiveParameters && activeGroup.parameters.map((param, paramIndex) => (
                <ParameterEditor
                  key={`param-${paramIndex}`}
                  parameter={param}
                  isNew={false}
                  compact={true}
                  currentGameTime={liveGameTime}
                  onSave={(updatedParam) => handleUpdateParameter(activeGroupIndex, paramIndex, updatedParam)}
                  onDelete={() => handleDeleteParameter(activeGroupIndex, paramIndex)}
                />
              ))}

              {renderParameterCreator(!hasActiveParameters)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default TelemetryApp;