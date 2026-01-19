import { ChangeEvent, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Send,
  Type,
  UploadCloud
} from 'lucide-react';
import { Character, BroadcastType } from '../types';
import { broadcastApi } from '../services/api';
import BroadcastPreview from './BroadcastPreview';

interface Props {
  characters: Character[];
}

const TEXT_LIMIT = 1200;
const clampDuration = (value: number) => Math.min(300, Math.max(0.5, value));

function BroadcastView({ characters }: Props) {
  const [broadcastType, setBroadcastType] = useState<BroadcastType>(BroadcastType.TEXT);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [textContent, setTextContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [duration, setDuration] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.username.localeCompare(b.username)),
    [characters]
  );

  const selectedCount = selectedRecipients.size;
  const allRecipientUsernames = useMemo(
    () => sortedCharacters.map(char => char.username),
    [sortedCharacters]
  );

  const isTextMode = broadcastType === BroadcastType.TEXT;
  const charCount = textContent.length;
  const textCountLabel = `${charCount}/${TEXT_LIMIT}`;
  const nearingLimit = charCount > TEXT_LIMIT * 0.85;
  const selectNone = () => setSelectedRecipients(new Set());
  const nudgeDuration = (delta: number) => {
    setDuration((prev) => clampDuration(parseFloat((prev + delta).toFixed(2))));
  };
  const handleDurationInput = (value: number) => {
    if (Number.isNaN(value)) {
      return;
    }
    setDuration(clampDuration(value));
  };

  const toggleRecipient = (username: string) => {
    const newRecipients = new Set(selectedRecipients);
    if (newRecipients.has(username)) {
      newRecipients.delete(username);
    } else {
      newRecipients.add(username);
    }
    setSelectedRecipients(newRecipients);
  };

  const selectAll = () => {
    setSelectedRecipients(new Set(allRecipientUsernames));
  };

  const clearImagePayload = () => {
    setImageFile(null);
    setImagePreview('');
  };

  const resetPayload = () => {
    setTextContent('');
    clearImagePayload();
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      clearImagePayload();
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    setError(null);
    setSuccess(null);

    // Validation
    if (selectedRecipients.size === 0) {
      setError('Please select at least one recipient');
      return;
    }

    if (broadcastType === BroadcastType.TEXT && !textContent.trim()) {
      setError('Please enter broadcast text');
      return;
    }

    if (broadcastType === BroadcastType.IMAGE && (!imageFile || !imagePreview)) {
      setError('Please select an image');
      return;
    }

    if (duration <= 0) {
      setError('Duration must be greater than 0');
      return;
    }

    setIsSending(true);

    try {
      if (isTextMode) {
        await broadcastApi.send({
          type: BroadcastType.TEXT,
          recipients: Array.from(selectedRecipients),
          content: textContent,
          duration
        });
      } else {
        const base64 = imagePreview.split(',')[1];
        if (!base64) {
          throw new Error('Unable to read the image payload');
        }
        await broadcastApi.send({
          type: BroadcastType.IMAGE,
          recipients: Array.from(selectedRecipients),
          content: base64,
          mimeType: imageFile!.type,
          duration
        });
      }

      setSuccess('Broadcast sent successfully!');
      // Reset form
      resetPayload();
    } catch (err: any) {
      console.error('Failed to send broadcast:', err);
      setError(err.response?.data?.error || 'Failed to send broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="broadcast-console">

      {error && (
        <div className="broadcast-alert error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="broadcast-alert success" role="status">
          {success}
        </div>
      )}

      <div className="broadcast-grid">
        <section className="app-surface broadcast-card channel-card">
          <div className="card-heading">
            <p className="eyebrow">Mode</p>
            <span className="broadcast-helper">Choose what type of broadcast to send</span>
          </div>
          <div className="broadcast-type-toggle" role="group" aria-label="Broadcast payload type">
            <button
              type="button"
              className={isTextMode ? 'type-pill active' : 'type-pill'}
              onClick={() => setBroadcastType(BroadcastType.TEXT)}
            >
              <Type size={18} />
              <span>Text Message</span>
            </button>
            <button
              type="button"
              className={!isTextMode ? 'type-pill active' : 'type-pill'}
              onClick={() => setBroadcastType(BroadcastType.IMAGE)}
            >
              <ImageIcon size={18} />
              <span>Image Banner</span>
            </button>
          </div>

          <div className="recipient-toolbar">
            <div>
              <h3 className="section-heading">Recipients</h3>
              <p className="broadcast-helper">
                {selectedCount === 0 ? 'No recipients selected' : `${selectedCount} recipient${selectedCount === 1 ? '' : 's'} targeted`}
              </p>
            </div>
            <div className="recipient-actions">
              <button type="button" className="ghost-btn small" onClick={selectAll} disabled={!sortedCharacters.length}>
                Select All
              </button>
              <button type="button" className="ghost-btn small" onClick={selectNone} disabled={selectedCount === 0}>
                Clear Selection
              </button>
            </div>
          </div>

          <div className="recipients-grid broadcast-recipient-grid">
            {sortedCharacters.length === 0 ? (
              <p className="broadcast-helper">No characters available.</p>
            ) : (
              sortedCharacters.map(char => {
                const isSelected = selectedRecipients.has(char.username);
                return (
                  <label
                    key={char.username}
                    className={`recipient-pill broadcast-recipient ${isSelected ? 'active' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRecipient(char.username)}
                    />
                    <div className="recipient-copy">
                      <span className="recipient-handle">@{char.username}</span>
                      <span className="recipient-meta">
                        {[char.first_name, char.last_name].filter(Boolean).join(' ') || 'No profile info'}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </section>

        <section className="app-surface broadcast-card payload-card">
          <div className="payload-heading-row">
            <p className="eyebrow">Payload</p>
            <p className="eyebrow">Player Preview</p>
          </div>

          <div className="payload-content">
            <div className="payload-input-stack">
              {isTextMode ? (
                <div className="textarea-shell">
                  <textarea
                    className="broadcast-textarea"
                    value={textContent}
                    maxLength={TEXT_LIMIT}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="ALL HANDS: ..."
                  />
                  <span className={`textarea-count ${nearingLimit ? 'alert' : ''}`}>{textCountLabel}</span>
                </div>
              ) : (
                <div className="broadcast-upload">
                  <label className={`broadcast-dropzone ${imageFile ? 'has-image' : ''}`}>
                    <input type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
                    <div className="dropzone-content">
                      <UploadCloud className="dropzone-icon" size={36} />
                      <div className="dropzone-copy">
                        <p>{imageFile ? 'Image ready for preview' : 'Drag an image here or choose a file'}</p>
                        <span className="broadcast-helper">{imageFile ? imageFile.name : 'PNG or JPG under 1MB recommended'}</span>
                      </div>
                    </div>
                    {imageFile && (
                      <button
                        type="button"
                        className="ghost-btn small dropzone-clear"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          clearImagePayload();
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </label>
                </div>
              )}
            </div>
            <div className="payload-preview-column">
              <div className="broadcast-preview-card">
                <BroadcastPreview
                  type={broadcastType}
                  text={textContent}
                  imageSrc={imagePreview}
                  duration={duration}
                />
              </div>
            </div>
          </div>

          <div className="broadcast-footer">
            <div className="duration-control-compact">
              <label htmlFor="broadcast-duration" className="duration-label">Duration</label>
              <input
                id="broadcast-duration"
                type="range"
                min={0.5}
                max={120}
                step={0.5}
                value={duration}
                onChange={(e) => handleDurationInput(parseFloat(e.target.value))}
                className="duration-slider"
              />
              <div className="duration-input">
                <input
                  type="number"
                  min={0.5}
                  max={300}
                  step={0.5}
                  value={duration}
                  onChange={(e) => handleDurationInput(parseFloat(e.target.value))}
                  className="duration-number"
                />
                <div className="duration-chevron-stack">
                  <button type="button" className="duration-chevron" onClick={() => nudgeDuration(0.5)} aria-label="Increase duration">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" className="duration-chevron" onClick={() => nudgeDuration(-0.5)} aria-label="Decrease duration">
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            </div>
            <div className="broadcast-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  resetPayload();
                  selectNone();
                }}
                disabled={!textContent && !imagePreview && selectedCount === 0}
              >
                Reset
              </button>
              <button type="button" className="accent-btn" onClick={handleSend} disabled={isSending}>
                {isSending ? (
                  'Sending...'
                ) : (
                  <span className="send-label">
                    <Send size={16} />
                    Send
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default BroadcastView;
