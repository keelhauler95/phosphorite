import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Save, Trash2 } from 'lucide-react';
import { GameApp, Character } from '../types';
import { appsApi } from '../services/api';
import AccessControlPanel from './AccessControlPanel';

interface Props {
  app: GameApp;
  characters: Character[];
  onBack?: () => void;
  onDelete?: (id: string) => void;
}

interface TextAppData {
  text: string;
}

const TEXT_LIMIT = 4000;

function TextApp({ app, characters, onBack, onDelete }: Props) {
  const [text, setText] = useState('');
  const [initialText, setInitialText] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let nextText = '';
    if (app.data && typeof app.data === 'object' && 'text' in app.data) {
      nextText = (app.data as TextAppData).text || '';
    }
    setText(nextText);
    setInitialText(nextText);
    setSelectedUsers(new Set(app.allowed_users));
    setError(null);
    setSuccess(null);
  }, [app]);

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

  const handleResetDraft = () => {
    setText(initialText);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const data: TextAppData = { text };
      await appsApi.update(app.id, { data });
      setInitialText(text);
      setSuccess('Transmission updated. Players will see it instantly.');
    } catch (err: any) {
      console.error('Failed to save text app:', err);
      setError(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    onDelete?.(app.id);
  };

  const charCount = text.length;
  const wordCount = useMemo(() => {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  }, [text]);
  const paragraphCount = useMemo(() => {
    if (!text.trim()) return 0;
    return text.trim().split(/\n{2,}/).length;
  }, [text]);
  const limitRatio = Math.min(charCount / TEXT_LIMIT, 1);
  const nearingLimit = charCount > TEXT_LIMIT * 0.85;
  const isDirty = text !== initialText;

  return (
    <div className="app-interface text-app-interface">
      <div className="app-interface-header">
        <div className="app-interface-title-row">
          <div className="app-title-cluster">
            <button
              type="button"
              onClick={() => onBack?.()}
              className="back-btn"
              title="Back to apps list"
            >
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
        <div className="app-alert error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="app-alert success" role="status">
          {success}
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

      <div className="app-interface-content text-app-content">
        <div className="text-app-grid">
          <section className="app-surface text-app-panel text-app-editor-panel">
            <div className="text-app-panel-heading">
              <div>
                <p className="eyebrow">Text Payload</p>
                <p className="panel-helper">Players see exactly what you save here.</p>
              </div>
            </div>

            <div className="text-app-editor-shell">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={18}
                placeholder="ALL HANDS //" 
                className="text-app-textarea"
              />
              <div className="text-app-progress" style={{ width: `${limitRatio * 100}%` }} aria-hidden />
            </div>

            <div className="text-app-stat-grid">
              <div className={`text-app-stat-chip${nearingLimit ? ' alert' : ''}`}>
                <span className="label">Characters</span>
                <span className="value">{charCount.toLocaleString()}</span>
              </div>
              <div className="text-app-stat-chip">
                <span className="label">Words</span>
                <span className="value">{wordCount.toLocaleString()}</span>
              </div>
              <div className="text-app-stat-chip">
                <span className="label">Paragraphs</span>
                <span className="value">{paragraphCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="text-app-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleResetDraft}
                disabled={!isDirty}
              >
                <RefreshCw size={16} />
                Revert
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
              >
                {isSaving ? 'Saving…' : (
                  <span className="text-app-save-label">
                    <Save size={16} />
                    Save Update
                  </span>
                )}
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export default TextApp;
