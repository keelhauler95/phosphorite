import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, ChevronRight, Play, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { GameApp, Character, LLMChatAppData, LLMChatHistoryEntry, LLMChatMessage, SocketEvent, LLMChatPreset, LLMChatContextOptions } from '../types';
import { appsApi } from '../services/api';
import socketService from '../services/socket';
import AccessControlPanel from './AccessControlPanel';

const EMPTY_APP_DATA: LLMChatAppData = {
  endpoint: '',
  modelName: '',
  model: '',
  apiToken: '',
  systemInstructions: '',
  presets: [],
  conversationHistories: {},
  interactionHistory: []
};

const normalizePresets = (data: LLMChatAppData): LLMChatPreset[] => {
  if (data.presets && data.presets.length > 0) {
    return data.presets.map((preset) => ({
      ...preset,
      id: preset.id || uuidv4(),
      label: preset.label?.trim() || preset.modelName || 'Untitled Agent'
    }));
  }

  return [{
    id: uuidv4(),
    label: data.modelName || 'Default Agent',
    endpoint: data.endpoint || '',
    modelName: data.modelName || '',
    model: data.model || '',
    apiToken: data.apiToken || '',
    systemInstructions: data.systemInstructions || ''
  }];
};

const formatPreset = (preset: LLMChatPreset): LLMChatPreset => ({
  ...preset,
  label: (preset.label || '').trim() || 'Untitled Agent',
  endpoint: (preset.endpoint || '').trim(),
  modelName: (preset.modelName || '').trim(),
  model: (preset.model || '').trim(),
  apiToken: (preset.apiToken || '').trim(),
  systemInstructions: preset.systemInstructions || ''
});

const isPresetComplete = (preset: LLMChatPreset) =>
  !!preset.endpoint.trim() &&
  !!preset.modelName.trim() &&
  !!preset.model.trim() &&
  !!preset.apiToken.trim();

interface Props {
  app: GameApp;
  characters: Character[];
  onBack?: () => void;
  onDelete?: (id: string) => void;
}

function LLMChatApp({ app, characters, onBack, onDelete }: Props) {
  const appData: LLMChatAppData = {
    ...EMPTY_APP_DATA,
    ...((app.data as LLMChatAppData) || {})
  };

  let presetSeed: LLMChatPreset[] | null = null;
  const hydratePresetSeed = () => {
    if (!presetSeed) {
      presetSeed = normalizePresets(appData);
    }
    return presetSeed;
  };
  const deriveInitialActivePreset = (seed: LLMChatPreset[]) => {
    if (appData.activePresetId) {
      const match = seed.find(p => p.id === appData.activePresetId);
      if (match) {
        return appData.activePresetId as string;
      }
    }
    return seed[0]?.id || '';
  };
  const [presets, setPresets] = useState<LLMChatPreset[]>(() => hydratePresetSeed());
  const [activePresetId, setActivePresetId] = useState<string>(() => deriveInitialActivePreset(hydratePresetSeed()));
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [savingPresetId, setSavingPresetId] = useState<string | null>(null);
  const [isUpdatingActivePreset, setIsUpdatingActivePreset] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testUsername, setTestUsername] = useState('test_user');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [localInteractionHistory, setLocalInteractionHistory] = useState<LLMChatHistoryEntry[]>(appData.interactionHistory || []);
  const [localConversationHistories, setLocalConversationHistories] = useState<Record<string, LLMChatMessage[]>>(appData.conversationHistories || {});
  const [selectedConversationUser, setSelectedConversationUser] = useState<string | null>(null);

  const activePreset = presets.find(preset => preset.id === activePresetId) || presets[0];

  const sanitizePresets = (presetList: LLMChatPreset[] = presets) => presetList.map(formatPreset);

  const resolveActivePresetId = (presetList: LLMChatPreset[], desiredId: string) => {
    if (desiredId && presetList.some(preset => preset.id === desiredId)) {
      return desiredId;
    }
    return presetList[0]?.id || '';
  };

  const buildPersistedData = (presetList: LLMChatPreset[], resolvedActiveId: string): LLMChatAppData => {
    const selectedPreset = presetList.find(preset => preset.id === resolvedActiveId) || presetList[0];
    return {
      ...appData,
      endpoint: selectedPreset?.endpoint || '',
      modelName: selectedPreset?.modelName || '',
      model: selectedPreset?.model || '',
      apiToken: selectedPreset?.apiToken || '',
      systemInstructions: selectedPreset?.systemInstructions || '',
      presets: presetList,
      activePresetId: selectedPreset?.id,
      conversationHistories: localConversationHistories,
      interactionHistory: localInteractionHistory
    };
  };

  const persistPresets = async (presetList: LLMChatPreset[], resolvedActiveId: string) => {
    const payload = buildPersistedData(presetList, resolvedActiveId);
    await appsApi.update(app.id, { data: payload });
  };

  useEffect(() => {
    // Load allowed users
    setSelectedUsers(new Set(app.allowed_users));
  }, [app]);

  useEffect(() => {
    const normalized = normalizePresets(appData);
    setPresets(normalized);
    const nextActive = (appData.activePresetId && normalized.find(p => p.id === appData.activePresetId))
      ? appData.activePresetId as string
      : normalized[0]?.id || '';
    setActivePresetId(nextActive);
    setExpandedPresetId(prev => (prev && normalized.some(preset => preset.id === prev)) ? prev : (normalized[0]?.id || null));
  }, [app.id, app.updated_at]);

  // Listen for real-time chat interactions
  useEffect(() => {
    const handleChatInteraction = (payload: any) => {
      // Only update if it's for this app
      if (payload.data?.appId === app.id && payload.data?.historyEntry) {
        const entry = payload.data.historyEntry;
        setLocalInteractionHistory(prev => [...prev, entry]);
        setLocalConversationHistories(prev => {
          const nextHistory = { ...prev };
          const existing = nextHistory[entry.username] ? [...nextHistory[entry.username]] : [];
          existing.push(
            { role: 'user', content: entry.userMessage, timestamp: entry.timestamp },
            { role: 'assistant', content: entry.aiResponse, timestamp: entry.timestamp }
          );
          nextHistory[entry.username] = existing;
          return nextHistory;
        });
      }
    };

    const socket = socketService.getSocket();
    if (socket) {
      socket.on(SocketEvent.LLM_CHAT_INTERACTION, handleChatInteraction);
    }

    return () => {
      if (socket) {
        socket.off(SocketEvent.LLM_CHAT_INTERACTION, handleChatInteraction);
      }
    };
  }, [app.id]);

  // Sync local history when app data changes
  useEffect(() => {
    setLocalInteractionHistory(appData.interactionHistory || []);
    setLocalConversationHistories(appData.conversationHistories || {});
  }, [appData.interactionHistory, appData.conversationHistories]);

  // Keep selected user stable or pick first available conversation
  useEffect(() => {
    const users = Object.keys(localConversationHistories || {});
    if (users.length === 0) {
      setSelectedConversationUser(null);
      return;
    }

    if (!selectedConversationUser || !users.includes(selectedConversationUser)) {
      setSelectedConversationUser(users[0]);
    }
  }, [localConversationHistories, selectedConversationUser]);

  const getLastInteractionIndex = (username: string) => {
    for (let i = localInteractionHistory.length - 1; i >= 0; i--) {
      if (localInteractionHistory[i].username === username) {
        return i;
      }
    }
    return -1;
  };

  const getFilteredConversationUsers = () => {
    const search = conversationSearch.trim().toLowerCase();
    return Object.keys(localConversationHistories || {})
      .filter(user => !search || user.toLowerCase().includes(search))
      .sort((a, b) => {
        const indexDelta = getLastInteractionIndex(b) - getLastInteractionIndex(a);
        if (indexDelta !== 0) return indexDelta;
        return a.localeCompare(b);
      });
  };

  const getConversationSnippet = (username: string) => {
    const conversation = localConversationHistories[username];
    if (!conversation || conversation.length === 0) {
      return 'No messages yet';
    }
    const last = conversation[conversation.length - 1];
    const prefix = last.role === 'user' ? 'Player' : 'AI';
    const content = last.content.length > 80 ? `${last.content.slice(0, 80)}…` : last.content;
    return `${prefix}: ${content}`;
  };

  const filteredConversationUsers = getFilteredConversationUsers();
  const activeConversationCount = Object.keys(localConversationHistories || {}).length;
  const handlePresetFieldChange = (presetId: string, field: keyof LLMChatPreset, value: string) => {
    setPresets(prev => prev.map(preset => preset.id === presetId ? { ...preset, [field]: value } : preset));
  };

  const handleContextOptionChange = (presetId: string, option: keyof LLMChatContextOptions, value: boolean) => {
    setPresets(prev => prev.map(preset => {
      if (preset.id === presetId) {
        return {
          ...preset,
          contextOptions: {
            ...(preset.contextOptions || {}),
            [option]: value
          }
        };
      }
      return preset;
    }));
  };

  const handleAddPreset = () => {
    const newPreset: LLMChatPreset = {
      id: uuidv4(),
      label: `Agent ${presets.length + 1}`,
      endpoint: '',
      modelName: '',
      model: '',
      apiToken: '',
      systemInstructions: '',
      contextOptions: {
        includeGameTime: false,
        includeUserProfile: false,
        includeMessages: false,
        includeLogbooks: false,
        includeTelemetry: false,
        includeTerminalCommands: false
      }
    };
    setPresets(prev => [...prev, newPreset]);
    setExpandedPresetId(newPreset.id);
  };

  const handleTogglePresetExpansion = (presetId: string) => {
    setExpandedPresetId(prev => (prev === presetId ? null : presetId));
  };

  const handleRemovePreset = async (presetId: string) => {
    if (presets.length === 1) return;
    const targetPreset = presets.find(p => p.id === presetId);
    const presetLabel = targetPreset?.label || 'this agent';
    if (!confirm(`Delete ${presetLabel}? This cannot be undone.`)) {
      return;
    }
    const previousPresets = presets.map(preset => ({ ...preset }));
    const previousActiveId = activePresetId;
    const previousExpandedId = expandedPresetId;
    const remainingPresets = presets.filter(preset => preset.id !== presetId);
    const sanitized = sanitizePresets(remainingPresets);
    const nextActiveId = resolveActivePresetId(sanitized, activePresetId === presetId ? '' : activePresetId);
    setPresets(sanitized);
    setActivePresetId(nextActiveId);
    setExpandedPresetId(prev => (prev === presetId ? (sanitized[0]?.id || null) : prev));
    try {
      await persistPresets(sanitized, nextActiveId);
      setError(null);
    } catch (err: any) {
      console.error('Failed to remove preset:', err);
      setError(err.response?.data?.error || 'Failed to remove preset');
      setPresets(previousPresets);
      setActivePresetId(previousActiveId);
      setExpandedPresetId(previousExpandedId);
    }
  };

  const toggleUser = async (username: string) => {
    const newUsers = new Set(selectedUsers);
    if (newUsers.has(username)) {
      newUsers.delete(username);
    } else {
      newUsers.add(username);
    }
    setSelectedUsers(newUsers);
    
    // Auto-save the user permissions
    setError(null);

    try {
      await appsApi.update(app.id, { allowed_users: Array.from(newUsers) });
    } catch (err: any) {
      console.error('Failed to update allowed users:', err);
      setError(err.response?.data?.error || 'Failed to update allowed users');
      // Revert the change on error
      setSelectedUsers(new Set(app.allowed_users));
    }
  };

  const handleSavePreset = async (presetId: string) => {
    const targetPreset = presets.find(preset => preset.id === presetId);
    if (!targetPreset) return;
    if (!isPresetComplete(targetPreset)) {
      setError('Fill endpoint, model name, model id, and API token before saving.');
      setExpandedPresetId(presetId);
      return;
    }

    const sanitized = sanitizePresets();
    const resolvedActive = resolveActivePresetId(sanitized, activePresetId);
    setPresets(sanitized);
    setSavingPresetId(presetId);
    setIsSaving(true);
    try {
      await persistPresets(sanitized, resolvedActive);
      setError(null);
    } catch (error: any) {
      console.error('Failed to save AI preset:', error);
      setError(error.response?.data?.error || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
      setSavingPresetId(null);
    }
  };

  const handleSelectActivePreset = async (presetId: string) => {
    const targetPreset = presets.find(preset => preset.id === presetId);
    if (!targetPreset) return;
    if (!isPresetComplete(targetPreset)) {
      setError('Complete this preset before activating it.');
      setExpandedPresetId(presetId);
      return;
    }

    const previousActiveId = activePresetId;
    setActivePresetId(presetId);
    setIsUpdatingActivePreset(true);
    try {
      const sanitized = sanitizePresets();
      const resolvedActive = resolveActivePresetId(sanitized, presetId);
      setPresets(sanitized);
      await persistPresets(sanitized, resolvedActive);
      setError(null);
    } catch (error: any) {
      console.error('Failed to set active preset:', error);
      setError(error.response?.data?.error || 'Failed to set active model');
      setActivePresetId(previousActiveId);
    } finally {
      setIsUpdatingActivePreset(false);
    }
  };

  const handleDelete = () => {
    onDelete?.(app.id);
  };

  const handleTestAPI = async () => {
    if (!testMessage.trim()) {
      setError('Please enter a test message');
      return;
    }

    if (!testUsername.trim()) {
      setError('Please enter a test username');
      return;
    }

    if (!activePreset || !activePreset.endpoint || !activePreset.model || !activePreset.apiToken) {
      setError('Configure the active agent before running a test');
      return;
    }

    setIsTesting(true);
    setTestResponse('Testing...');

    try {
      const response = await fetch(`/api/llm-chat/${app.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: testMessage,
          conversationHistory: [],
          username: testUsername
        })
      });

      const data = await response.json();

      if (data.success && data.message) {
        setTestResponse(`✓ Success!\n\nResponse:\n${data.message}`);
      } else if (data.error) {
        setTestResponse(`✗ Error:\n${data.error}`);
      } else {
        setTestResponse(`✗ Unexpected response:\n${JSON.stringify(data, null, 2)}`);
      }
    } catch (error: any) {
      console.error('Test API error:', error);
      setTestResponse(`✗ Request failed:\n${error.message}\n\nCheck the backend console for detailed logs.`);
    } finally {
      setIsTesting(false);
    }
  };

  // Format game time for display
  const formatTimestamp = (timestampStr: string): string => {
    try {
      const gameTime = JSON.parse(timestampStr);
      return `Era ${gameTime.era}, Day ${gameTime.day} - ${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')}:${String(gameTime.second).padStart(2, '0')}`;
    } catch (error) {
      return timestampStr;
    }
  };

  return (
    <div className="app-interface llm-chat-app">
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

      <div className="app-interface-content llm-chat-shell">
        <div className="llm-chat-grid">
          <div className="llm-config-column">
            <section className="app-surface llm-panel llm-agent-panel">
              <div className="panel-header compact">
                <span className="eyebrow">Agents</span>
                <span className="panel-tag">{presets.length} configured</span>
              </div>
              <div className="llm-panel-actions">
                <p className="llm-panel-subtitle">
                  Active agent:
                  {' '}
                  <strong>{activePreset?.label || 'None selected'}</strong>
                </p>
                <button type="button" className="ghost-btn llm-add-agent-btn" onClick={handleAddPreset}>
                  <Plus size={14} />
                  New agent
                </button>
              </div>

              <div className="llm-preset-list">
                {presets.map((preset, index) => {
                  const isActive = preset.id === activePresetId;
                  const isExpanded = expandedPresetId === preset.id;
                  return (
                    <article
                      key={preset.id}
                      className={`llm-preset-card${isExpanded ? ' expanded' : ''}${isActive ? ' active' : ''}`}
                    >
                      <div className="llm-preset-header">
                        <button
                          type="button"
                          className="llm-preset-toggle"
                          aria-expanded={isExpanded}
                          onClick={() => handleTogglePresetExpansion(preset.id)}
                        >
                          <ChevronRight className={`llm-preset-chevron${isExpanded ? ' rotated' : ''}`} aria-hidden="true" />
                          <div className="llm-preset-summary">
                            <span className="llm-preset-name">{preset.label || `Agent ${index + 1}`}</span>
                            <span className="llm-preset-meta">{preset.modelName || 'No model name'} · {preset.model || 'No model id'}</span>
                          </div>
                        </button>
                        <div className="llm-preset-actions">
                          {presets.length > 1 && (
                            <button
                              type="button"
                              className="llm-icon-btn danger"
                              onClick={() => handleRemovePreset(preset.id)}
                              aria-label="Remove preset"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className={`llm-icon-btn toggle${isActive ? ' active' : ''}`}
                            onClick={() => handleSelectActivePreset(preset.id)}
                            disabled={isUpdatingActivePreset}
                            aria-busy={isUpdatingActivePreset}
                            title={isActive ? 'Active agent' : 'Set active'}
                          >
                            <span className="llm-active-dot" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="llm-preset-body">
                          <div className="llm-preset-fields">
                            <div className="form-group">
                              <label>Agent Name *</label>
                              <input
                                type="text"
                                value={preset.label || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'label', e.target.value)}
                                placeholder="Internal GM label"
                              />
                            </div>
                            <div className="form-group">
                              <label>API Endpoint URL *</label>
                              <input
                                type="text"
                                value={preset.endpoint || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'endpoint', e.target.value)}
                                placeholder="https://api.example.com/v1/chat/completions"
                              />
                            </div>
                            <div className="form-group">
                              <label>Model Display Name *</label>
                              <input
                                type="text"
                                value={preset.modelName || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'modelName', e.target.value)}
                                placeholder="e.g., SHIP-AI"
                              />
                            </div>
                            <div className="form-group">
                              <label>Model Identifier *</label>
                              <input
                                type="text"
                                value={preset.model || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'model', e.target.value)}
                                placeholder="gpt-4o"
                              />
                            </div>
                            <div className="form-group">
                              <label>API Token *</label>
                              <input
                                type="password"
                                value={preset.apiToken || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'apiToken', e.target.value)}
                                placeholder="Enter API authentication token"
                              />
                            </div>
                            <div className="form-group form-group--full">
                              <label>System Instructions</label>
                              <textarea
                                value={preset.systemInstructions || ''}
                                onChange={(e) => handlePresetFieldChange(preset.id, 'systemInstructions', e.target.value)}
                                placeholder="Define the AI persona, tone, and red lines."
                                rows={4}
                              />
                            </div>
                            <div className="form-group form-group--full">
                              <label>Context Options</label>
                              <div className="llm-context-options">
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeGameTime ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeGameTime', e.target.checked)}
                                  />
                                  <span>Game time</span>
                                </label>
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeUserProfile ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeUserProfile', e.target.checked)}
                                  />
                                  <span>User character profile</span>
                                </label>
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeMessages ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeMessages', e.target.checked)}
                                  />
                                  <span>User messages</span>
                                </label>
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeLogbooks ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeLogbooks', e.target.checked)}
                                  />
                                  <span>Logbook entries</span>
                                </label>
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeTelemetry ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeTelemetry', e.target.checked)}
                                  />
                                  <span>Ship telemetry data</span>
                                </label>
                                <label className="llm-context-option">
                                  <input
                                    type="checkbox"
                                    checked={preset.contextOptions?.includeTerminalCommands ?? false}
                                    onChange={(e) => handleContextOptionChange(preset.id, 'includeTerminalCommands', e.target.checked)}
                                  />
                                  <span>Terminal commands</span>
                                </label>
                              </div>
                            </div>
                          </div>
                          <div className="llm-preset-footer">
                            {!isPresetComplete(preset) && (
                              <span className="llm-preset-warning">Complete required fields to activate or save.</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSavePreset(preset.id)}
                              className="primary-btn"
                              disabled={isSaving && savingPresetId === preset.id}
                            >
                              <Save size={16} />
                              {isSaving && savingPresetId === preset.id ? 'Saving…' : 'Save preset'}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="app-surface llm-panel llm-diagnostics-panel">
              <div className="panel-header compact">
                <span className="eyebrow">Diagnostics</span>
                <span className="panel-tag">Test fire</span>
              </div>
              <div className="llm-panel-actions">
                <p className="llm-panel-subtitle">Send a synthetic exchange against the active agent.</p>
                <button
                  type="button"
                  onClick={handleTestAPI}
                  disabled={isTesting || !activePreset || !activePreset.endpoint || !activePreset.model || !activePreset.apiToken}
                  className="primary-btn"
                >
                  <Play size={16} />
                  {isTesting ? 'Testing…' : 'Send test'}
                </button>
              </div>
              <div className="llm-panel-body llm-diagnostics-body">
                <div className="form-group">
                  <label>Test Username</label>
                  <input
                    type="text"
                    value={testUsername}
                    onChange={(e) => setTestUsername(e.target.value)}
                    placeholder="crew_member"
                  />
                </div>
                <div className="form-group">
                  <label>Test Message</label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Status report?"
                  />
                </div>
                {testResponse && (
                  <div className={`llm-test-response ${testResponse.startsWith('✓') ? 'success' : 'error'}`}>
                    {testResponse}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="app-surface llm-panel llm-monitor-panel">
            <div className="panel-header compact">
              <span className="eyebrow">Conversation Monitor</span>
              <span className="panel-tag">{activeConversationCount || 0} active players</span>
            </div>
            <div className="llm-monitor-toolbar">
              <div className="conversation-filters compact">
                <div className="filter-main-bar">
                  <div className="filter-chip search-chip">
                    <Search width={14} height={14} className="search-chip-icon" aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Search players"
                      value={conversationSearch}
                      onChange={(e) => setConversationSearch(e.target.value)}
                    />
                    <div className="search-chip-actions">
                      <button
                        type="button"
                        className={`search-action-btn ${conversationSearch ? 'active' : ''}`}
                        onClick={() => setConversationSearch('')}
                        title="Clear search"
                        disabled={!conversationSearch}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="llm-monitor-body">
              <div className="llm-conversation-sidebar">
                {filteredConversationUsers.length === 0 ? (
                  <div className="empty-message">No matching players.</div>
                ) : (
                  <div className="llm-conversation-list">
                    {filteredConversationUsers.map((user) => {
                      const exchanges = Math.ceil((localConversationHistories[user]?.length || 0) / 2);
                      return (
                        <button
                          key={user}
                          type="button"
                          className={`llm-conversation-item ${selectedConversationUser === user ? 'active' : ''}`}
                          onClick={() => setSelectedConversationUser(user)}
                        >
                          <div className="llm-conversation-item-header">
                            <span className="llm-conversation-player">{user}</span>
                            <span className="llm-conversation-count">{exchanges}x</span>
                          </div>
                          <p className="llm-conversation-snippet">{getConversationSnippet(user)}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="llm-conversation-detail">
                {!selectedConversationUser ? (
                  <p className="empty-message">Select a player to inspect their full conversation.</p>
                ) : (
                  (() => {
                    const conversation = localConversationHistories[selectedConversationUser] || [];
                    if (conversation.length === 0) {
                      return <p className="empty-message">No messages yet for {selectedConversationUser}.</p>;
                    }
                    const lastTimestamp = conversation[conversation.length - 1]?.timestamp;
                    return (
                      <div className="llm-thread">
                        <div className="llm-thread-header">
                          <div>
                            <p className="llm-thread-title">Conversation with {selectedConversationUser}</p>
                            <p className="llm-thread-meta">
                              {Math.ceil(conversation.length / 2)} exchanges · Latest at {lastTimestamp ? formatTimestamp(lastTimestamp) : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="llm-thread-body">
                          {conversation.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            const authorLabel = isUser
                              ? selectedConversationUser
                              : (activePreset?.modelName || appData.modelName || 'AI Assistant');
                            return (
                              <div key={`${msg.role}-${idx}`} className={`llm-message ${isUser ? 'user' : 'assistant'}`}>
                                <div className="llm-message-meta">
                                  <span>{authorLabel}</span>
                                  {msg.timestamp && <span>{formatTimestamp(msg.timestamp)}</span>}
                                </div>
                                <div className="llm-message-bubble">{msg.content}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default LLMChatApp;
