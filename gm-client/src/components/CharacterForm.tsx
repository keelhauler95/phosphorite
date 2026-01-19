import { useState, useEffect } from 'react';
import { Character } from '../types';
import { charactersApi } from '../services/api';

interface Props {
  character?: Character | null;
  onClose?: () => void;
  onSuccess?: (character?: Character) => void;
}

const createDefaultFormState = () => ({
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  title: '',
  background: '',
  personality: '',
  fear: '',
  secret: '',
  motivation: '',
  agenda: '',
  can_access_messages: true
});

function CharacterForm({ character = null, onClose, onSuccess }: Props) {
  const [formData, setFormData] = useState(createDefaultFormState);

  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (character) {
      setFormData({
        username: character.username,
        password: character.password || '',
        first_name: character.first_name,
        last_name: character.last_name,
        title: character.title,
        background: character.background || '',
        personality: character.personality || '',
        fear: character.fear || '',
        secret: character.secret || '',
        motivation: character.motivation || '',
        agenda: character.agenda || '',
        can_access_messages: character.can_access_messages ?? true
      });
    } else {
      setFormData(createDefaultFormState());
    }
    setErrors([]);
  }, [character]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setLoading(true);

    try {
      const characterCanAccess = character?.can_access_messages ?? true;

      if (character) {
        const updates: any = {
          first_name: formData.first_name,
          last_name: formData.last_name,
          title: formData.title,
          background: formData.background,
          personality: formData.personality,
          fear: formData.fear,
          secret: formData.secret,
          motivation: formData.motivation,
          agenda: formData.agenda
        };
        if (formData.password) {
          if (formData.password && formData.password !== character.password) {
            updates.password = formData.password;
          }
        }
        if (formData.can_access_messages !== characterCanAccess) {
          updates.can_access_messages = formData.can_access_messages;
        }
        const response = await charactersApi.update(character.id, updates);
        onSuccess?.(response.data);
        setFormData(prev => ({ ...prev, password: '' }));
      } else {
        if (!formData.password) {
          setErrors(['Password is required for new characters']);
          setLoading(false);
          return;
        }
        const response = await charactersApi.create(formData);
        onSuccess?.(response.data);
        setFormData(createDefaultFormState());
      }
    } catch (error: any) {
      console.error('Form error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to save character';
      setErrors([errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const isEditing = Boolean(character);

  return (
    <form className="character-detail-panel creation-panel" onSubmit={handleSubmit}>
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">{isEditing ? 'Update User' : 'Create User'}</p>
          <h2>{isEditing ? character?.username : 'New User'}</h2>
          {!isEditing && <p className="detail-subtitle">Define credentials and backstory</p>}
        </div>
        <div className="detail-actions">
          {onClose && (
            <button type="button" className="ghost-btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>
          )}
          <button type="submit" className="accent-btn" disabled={loading}>
            {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="error-box inline">
          {errors.map((error, i) => (
            <p key={i}>{error}</p>
          ))}
        </div>
      )}

      <section className="detail-card app-surface">
        <h3 className="section-heading">Operator Info</h3>
        <div className="detail-grid identity-grid">
          <label className="detail-field">
            <span>Username</span>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              disabled={isEditing}
            />
          </label>
          <label className="detail-field">
            <span>First Name</span>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              required
            />
          </label>
          <label className="detail-field">
            <span>Last Name</span>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              required
            />
          </label>
          <label className="detail-field">
            <span>Title</span>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="password-comms-row">
          <label className="detail-field full-width password-field">
            <span>Password</span>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required={!isEditing}
            />
          </label>
          <button
            type="button"
            aria-pressed={formData.can_access_messages}
            className={`comms-pill ${formData.can_access_messages ? 'is-on' : 'is-off'}`}
            onClick={() =>
              setFormData({ ...formData, can_access_messages: !formData.can_access_messages })
            }
          >
            <span className="pill-label">Comms</span>
            <span className="pill-track" aria-hidden="true">
              <span className="pill-thumb" />
            </span>
          </button>
        </div>
      </section>

      <section className="detail-card app-surface">
        <h3 className="section-heading">Profile</h3>
        <div className="profile-stack wide-block">
          <label className="profile-field full-width">
            <span>Background</span>
            <textarea
              rows={3}
              value={formData.background}
              onChange={(e) => setFormData({ ...formData, background: e.target.value })}
            />
          </label>
          <label className="profile-field full-width">
            <span>Personality</span>
            <textarea
              rows={3}
              value={formData.personality}
              onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
            />
          </label>
        </div>
        <div className="profile-stack mini-grid">
          <label className="profile-field">
            <span>Fear</span>
            <textarea
              rows={2}
              value={formData.fear}
              onChange={(e) => setFormData({ ...formData, fear: e.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>Secret</span>
            <textarea
              rows={2}
              value={formData.secret}
              onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>Motivation</span>
            <textarea
              rows={2}
              value={formData.motivation}
              onChange={(e) => setFormData({ ...formData, motivation: e.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>Agenda</span>
            <textarea
              rows={2}
              value={formData.agenda}
              onChange={(e) => setFormData({ ...formData, agenda: e.target.value })}
            />
          </label>
        </div>
      </section>
    </form>
  );
}

export default CharacterForm;
