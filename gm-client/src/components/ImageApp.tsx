import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Save, Trash2, UploadCloud } from 'lucide-react';
import { GameApp, Character, ImageAppData } from '../types';
import { appsApi } from '../services/api';
import AccessControlPanel from './AccessControlPanel';
import PlayerImagePreview from './PlayerImagePreview';

interface Props {
  app: GameApp;
  characters: Character[];
  onBack?: () => void;
  onDelete?: (id: string) => void;
}

interface ImageSnapshot {
  imageData: string;
  mimeType: string;
  filename: string;
}

const PLAYER_LOOP_DURATION_SECONDS = 30;
const PLAYER_LOOP_INTERVAL_MS = PLAYER_LOOP_DURATION_SECONDS * 1000;

function ImageApp({ app, characters, onBack, onDelete }: Props) {
  const [imageData, setImageData] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [filename, setFilename] = useState('');
  const [initialSnapshot, setInitialSnapshot] = useState<ImageSnapshot>({ imageData: '', mimeType: '', filename: '' });
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let nextData = '';
    let nextMime = '';
    let nextFile = '';
    if (app.data && typeof app.data === 'object') {
      const data = app.data as ImageAppData;
      nextData = data.imageData || '';
      nextMime = data.mimeType || '';
      nextFile = data.filename || '';
    }
    setImageData(nextData);
    setMimeType(nextMime);
    setFilename(nextFile);
    setInitialSnapshot({ imageData: nextData, mimeType: nextMime, filename: nextFile });
    setSelectedUsers(new Set(app.allowed_users));
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    const maxSizeMB = 3;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`Image file must be under ${maxSizeMB} MB (current size ${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
      return;
    }

    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64Data = result.split(',')[1];
      setImageData(base64Data);
      setMimeType(file.type);
      setFilename(file.name);
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleRevertPayload = () => {
    setImageData(initialSnapshot.imageData);
    setMimeType(initialSnapshot.mimeType);
    setFilename(initialSnapshot.filename);
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearImage = () => {
    setImageData('');
    setMimeType('');
    setFilename('');
    setError(null);
    setSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const data: ImageAppData = {
        imageData,
        mimeType,
        filename
      };
      await appsApi.update(app.id, { data });
      setInitialSnapshot({ imageData, mimeType, filename });
      setSuccess('Image updated. Players will see it immediately.');
    } catch (err: any) {
      console.error('Failed to save image app:', err);
      if (err.response?.status === 413 || err.message?.includes('too large')) {
        setError('Image is too large. Please try a smaller file (under 3 MB).');
      } else {
        setError(err.response?.data?.error || 'Failed to save changes. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    onDelete?.(app.id);
  };

  const hasImage = Boolean(imageData && mimeType);
  const imageSrc = hasImage ? `data:${mimeType};base64,${imageData}` : '';
  const approxSizeMB = useMemo(() => {
    if (!imageData) return null;
    return (imageData.length * 0.75) / (1024 * 1024);
  }, [imageData]);
  const isDirty =
    imageData !== initialSnapshot.imageData ||
    mimeType !== initialSnapshot.mimeType ||
    filename !== initialSnapshot.filename;

  return (
    <div className="app-interface image-app-interface">
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

      <div className="app-interface-content image-app-content">
        <div className="image-app-grid">
          <section className="app-surface image-app-panel image-app-editor-panel">
            <div className="image-app-panel-heading">
              <div>
                <p className="eyebrow">Image Payload</p>
                <p className="panel-helper">Upload a still. Players see it as soon as you save.</p>
              </div>
            </div>

            <label className={`image-dropzone${hasImage ? ' has-image' : ''}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
              <UploadCloud size={32} />
              <div>
                <p>{hasImage ? 'Drop a file to replace the current asset' : 'Drag an image here or choose a file'}</p>
                <span className="panel-helper">PNG or JPG under 3 MB recommended</span>
              </div>
              <button
                type="button"
                className="ghost-btn small"
                onClick={(e) => {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }}
              >
                Browse
              </button>
            </label>

            {hasImage && (
              <div className="image-current-card">
                <img src={imageSrc} alt={filename || 'Current image'} />
              </div>
            )}

            {hasImage && (
              <div className="image-meta-grid">
                <div className="image-meta-chip">
                  <span className="label">Filename</span>
                  <span className="value" title={filename}>{filename || '—'}</span>
                </div>
                <div className="image-meta-chip">
                  <span className="label">Format</span>
                  <span className="value">{mimeType || '—'}</span>
                </div>
                <div className="image-meta-chip">
                  <span className="label">Size</span>
                  <span className="value">{approxSizeMB ? `${approxSizeMB.toFixed(2)} MB` : '—'}</span>
                </div>
              </div>
            )}

            <div className="image-app-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleRevertPayload}
                disabled={!isDirty}
              >
                <RefreshCw size={16} />
                Revert
              </button>
              <div className="image-app-action-tray">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleClearImage}
                  disabled={!hasImage}
                >
                  Clear
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
            </div>
          </section>

          <section className="app-surface image-app-panel image-app-preview-panel">
            <div className="image-app-panel-heading">
              <div>
                <p className="eyebrow">Player Preview</p>
                <p className="panel-helper">Matches the player client filter, shaders, and timing.</p>
              </div>
            </div>
            <div className="image-preview-card">
              <PlayerImagePreview src={imageSrc} loopIntervalMs={PLAYER_LOOP_INTERVAL_MS} />
            </div>
            <p className="image-preview-hint">
              {hasImage
                ? `Preview replays the player load animation every ${PLAYER_LOOP_DURATION_SECONDS} seconds.`
                : 'No asset loaded. Players currently see nothing.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ImageApp;
