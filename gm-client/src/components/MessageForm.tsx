import { useState, useEffect } from 'react';
import { Message, Character, GameTime } from '../types';
import { messagesApi } from '../services/api';

interface Props {
  message: Message | null;
  characters: Character[];
  currentGameTime: GameTime;
  onClose: () => void;
}

function MessageForm({ message, characters, currentGameTime, onClose }: Props) {
  const [formData, setFormData] = useState({
    sender: '',
    subject: '',
    body: ''
  });

  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState<GameTime>({
    era: 0,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (message) {
      setFormData({
        sender: message.sender,
        subject: message.subject,
        body: message.body
      });
      setSelectedRecipients(new Set(message.recipients));

      // Parse the sent_at time
      try {
        const sentTime = JSON.parse(message.sent_at);
        setCustomTime(sentTime);
        setUseCustomTime(true);
      } catch (e) {
        // If parsing fails, use current game time
        setCustomTime(currentGameTime);
        setUseCustomTime(false);
      }
    } else {
      // Initialize with current game time for new messages, default to NOT using custom time
      setCustomTime(currentGameTime);
      setUseCustomTime(false);
    }
  }, [message, currentGameTime]);

  const toggleRecipient = (username: string) => {
    const newRecipients = new Set(selectedRecipients);
    if (newRecipients.has(username)) {
      newRecipients.delete(username);
    } else {
      newRecipients.add(username);
    }
    setSelectedRecipients(newRecipients);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Validation
    const validationErrors: string[] = [];

    if (!formData.sender.trim()) {
      validationErrors.push('Sender is required');
    }

    if (selectedRecipients.size === 0) {
      validationErrors.push('At least one recipient is required');
    }

    if (!formData.subject.trim()) {
      validationErrors.push('Subject is required');
    } else if (formData.subject.length > 48) {
      validationErrors.push('Subject must be 48 characters or less');
    }

    if (!formData.body.trim()) {
      validationErrors.push('Body is required');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      const dataToSubmit: any = {
        sender: formData.sender.trim(),
        recipients: Array.from(selectedRecipients),
        subject: formData.subject.trim(),
        body: formData.body.trim()
      };

      // If editing and custom time is used, include the custom sent_at time
      if (message && useCustomTime) {
        dataToSubmit.sent_at = JSON.stringify(customTime);
      }

      if (message) {
        await messagesApi.update(message.id, dataToSubmit);
      } else {
        // For new messages, send custom time if specified
        if (useCustomTime) {
          dataToSubmit.sent_at = JSON.stringify(customTime);
        }
        await messagesApi.create(dataToSubmit);
      }
      onClose();
    } catch (error: any) {
      console.error('Form error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to save message';
      setErrors([errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const charCount = formData.subject.length;
  const charCountColor =
    charCount > 48
      ? 'var(--color-accent-red)'
      : charCount > 40
        ? 'var(--color-accent-amber)'
        : 'var(--color-text-muted)';

  const getReadStatus = (username: string): boolean | undefined => {
    if (!message) return undefined;
    return message.read_status[username];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{message ? 'Edit Message' : 'New Message'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {errors.length > 0 && (
            <div className="error-box">
              {errors.map((error, i) => (
                <p key={i}>{error}</p>
              ))}
            </div>
          )}

          <div className="form-group">
            <label>Sender</label>
            <input
              type="text"
              value={formData.sender}
              onChange={(e) => setFormData({ ...formData, sender: e.target.value })}
              placeholder="Username of sender"
              required
            />
          </div>

          <div className="form-group">
            <label>Recipients</label>
            <div className="recipients-box">
              {characters.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9em', margin: 0 }}>No users available</p>
              ) : (
                characters.map(char => (
                  <div key={char.username} className="recipient-item">
                    <label className="recipient-label">
                      <input
                        type="checkbox"
                        checked={selectedRecipients.has(char.username)}
                        onChange={() => toggleRecipient(char.username)}
                      />
                      <span className="recipient-name">{char.username}</span>
                      <span className="recipient-fullname">
                        ({char.first_name} {char.last_name})
                      </span>
                    </label>
                    {message && selectedRecipients.has(char.username) && (
                      <span className={`recipient-status ${getReadStatus(char.username) ? 'read' : 'unread'}`}>
                        {getReadStatus(char.username) ? '✓ Read' : 'Unread'}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="form-group">
            <label>
              Subject
              <small style={{ color: charCountColor, marginLeft: '8px' }}>
                ({charCount}/48)
              </small>
            </label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              maxLength={48}
              placeholder="Message subject"
              required
            />
          </div>

          <div className="form-group">
            <label>Body</label>
            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              rows={8}
              placeholder="Message content..."
              required
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useCustomTime}
                onChange={(e) => setUseCustomTime(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Use custom message time (instead of current game time)
            </label>
          </div>

          {useCustomTime && (
            <div className="form-group">
              <label>Message Time</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Era</label>
                  <input
                    type="number"
                    min="0"
                    value={customTime.era}
                    onChange={(e) => setCustomTime({ ...customTime, era: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Day</label>
                  <input
                    type="number"
                    min="1"
                    value={customTime.day}
                    onChange={(e) => setCustomTime({ ...customTime, day: parseInt(e.target.value) || 1 })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Hour</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={customTime.hour}
                    onChange={(e) => setCustomTime({ ...customTime, hour: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Min</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customTime.minute}
                    onChange={(e) => setCustomTime({ ...customTime, minute: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Sec</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customTime.second}
                    onChange={(e) => setCustomTime({ ...customTime, second: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MessageForm;
