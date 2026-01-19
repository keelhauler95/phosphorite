import { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Message, Character, GameTime } from '../types';
import { messagesApi } from '../services/api';

interface Props {
  message: Message;
  characters: Character[];
  onBack: () => void;
  onDelete: (id: string) => void;
}

function MessageDetail({ message, characters, onBack, onDelete }: Props) {
  const [formData, setFormData] = useState({
    sender: message.sender,
    subject: message.subject,
    body: message.body
  });

  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set(message.recipients));
  const [readStatus, setReadStatus] = useState<Record<string, boolean>>(message.read_status);
  const [customTime, setCustomTime] = useState<GameTime>(() => {
    try {
      return JSON.parse(message.sent_at);
    } catch (e) {
      return { era: 0, day: 1, hour: 0, minute: 0, second: 0 };
    }
  });

  const toggleRecipient = (username: string) => {
    const newRecipients = new Set(selectedRecipients);
    if (newRecipients.has(username)) {
      newRecipients.delete(username);
      // Remove from read status when unchecking
      const newReadStatus = { ...readStatus };
      delete newReadStatus[username];
      setReadStatus(newReadStatus);
    } else {
      newRecipients.add(username);
      // Add to read status as unread when checking
      setReadStatus({ ...readStatus, [username]: false });
    }
    setSelectedRecipients(newRecipients);
  };

  const toggleReadStatus = (username: string) => {
    setReadStatus({
      ...readStatus,
      [username]: !readStatus[username]
    });
  };

  const handleSave = async () => {
    try {
      const dataToSubmit: any = {
        sender: formData.sender.trim(),
        recipients: Array.from(selectedRecipients),
        subject: formData.subject.trim(),
        body: formData.body.trim(),
        sent_at: JSON.stringify(customTime),
        read_status: readStatus
      };

      await messagesApi.update(message.id, dataToSubmit);
    } catch (error: any) {
      console.error('Update error:', error);
      alert(error.response?.data?.error || 'Failed to update message');
    }
  };

  const handleDelete = async () => {
    onDelete(message.id);
  };

  return (
    <div className="app-interface">
      <div className="app-interface-header">
        <div className="app-interface-title-row">
          <div className="app-title-cluster">
            <button onClick={onBack} className="back-btn" type="button" title="Back to messages">
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="sr-only">Back to messages</span>
            </button>
            <h2>{message.subject}</h2>
          </div>
          <button onClick={handleDelete} className="delete-btn" type="button">
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete Message</span>
          </button>
        </div>
      </div>

      <div className="app-interface-content">
        <div className="message-detail-layout">
          {/* Left Column - Message Info */}
          <div className="message-left-column">
            <div className="message-info-section">
              <h3>Message Details</h3>
              
              <div className="message-field">
                <label>Sender</label>
                <input
                  type="text"
                  value={formData.sender}
                  onChange={(e) => setFormData({ ...formData, sender: e.target.value })}
                />
              </div>

              <div className="message-field">
                <label>Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  maxLength={48}
                />
              </div>

              <div className="message-field">
                <label>Sent At</label>
                <div className="time-inputs">
                  <input
                    type="number"
                    min="0"
                    value={customTime.era}
                    onChange={(e) => setCustomTime({ ...customTime, era: parseInt(e.target.value) || 0 })}
                    placeholder="Era"
                    title="Era"
                  />
                  <input
                    type="number"
                    min="1"
                    value={customTime.day}
                    onChange={(e) => setCustomTime({ ...customTime, day: parseInt(e.target.value) || 1 })}
                    placeholder="Day"
                    title="Day"
                  />
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={customTime.hour}
                    onChange={(e) => setCustomTime({ ...customTime, hour: parseInt(e.target.value) || 0 })}
                    placeholder="HH"
                    title="Hour"
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customTime.minute}
                    onChange={(e) => setCustomTime({ ...customTime, minute: parseInt(e.target.value) || 0 })}
                    placeholder="MM"
                    title="Minute"
                  />
                  <span>:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customTime.second}
                    onChange={(e) => setCustomTime({ ...customTime, second: parseInt(e.target.value) || 0 })}
                    placeholder="SS"
                    title="Second"
                  />
                </div>
              </div>
            </div>

            {/* Recipients Section */}
            <div className="message-recipients-section">
              <h3>Recipients</h3>
              <div className="recipients-list">
                {characters.map(char => {
                  const isRecipient = selectedRecipients.has(char.username);
                  const isRead = readStatus[char.username];
                  return (
                    <div key={char.username} className="recipient-row">
                      <label className="recipient-checkbox">
                        <input
                          type="checkbox"
                          checked={isRecipient}
                          onChange={() => toggleRecipient(char.username)}
                        />
                        <span className="recipient-username">{char.username}</span>
                      </label>
                      {isRecipient && (
                        <button
                          type="button"
                          className={`read-status-btn ${isRead ? 'read' : 'unread'}`}
                          onClick={() => toggleReadStatus(char.username)}
                          title={isRead ? 'Mark as unread' : 'Mark as read'}
                        >
                          {isRead ? '✓ Read' : '○ Unread'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-actions">
              <button onClick={handleSave} className="save-btn">
                Save Changes
              </button>
            </div>
          </div>

          {/* Right Column - Message Body */}
          <div className="message-right-column">
            <div className="message-body-section">
              <h3>Message Body</h3>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                className="message-body-textarea"
                placeholder="Message content..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MessageDetail;
