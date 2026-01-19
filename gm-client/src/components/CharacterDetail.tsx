import { useState, useEffect } from 'react';
import { Character, VisualEffect } from '../types';
import { charactersApi } from '../services/api';

interface Props {
  character: Character;
  onBack: () => void;
  onDelete: (id: number) => void;
  showBackButton?: boolean;
}

function CharacterDetail({ character, onBack, onDelete, showBackButton = true }: Props) {
  const [formData, setFormData] = useState({
    first_name: character.first_name,
    last_name: character.last_name,
    title: character.title,
    password: character.password || '',
    background: character.background || '',
    personality: character.personality || '',
    fear: character.fear || '',
    secret: character.secret || '',
    motivation: character.motivation || '',
    agenda: character.agenda || '',
    can_access_messages: character.can_access_messages ?? true
  });

  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>(
    character.visual_effects || []
  );

  // Sync visual effects when character prop updates (from socket events)
  useEffect(() => {
    setVisualEffects(character.visual_effects || []);
  }, [character.visual_effects]);

  useEffect(() => {
    setFormData({
      first_name: character.first_name,
      last_name: character.last_name,
      title: character.title,
      password: character.password || '',
      background: character.background || '',
      personality: character.personality || '',
      fear: character.fear || '',
      secret: character.secret || '',
      motivation: character.motivation || '',
      agenda: character.agenda || '',
      can_access_messages: character.can_access_messages ?? true
    });
  }, [character]);

  const availableEffects = [
    { value: VisualEffect.BROKEN_SCREEN, label: 'Broken Screen' },
    { value: VisualEffect.CORRUPTED_TEXT, label: 'Corrupted Text' },
    { value: VisualEffect.BLOODY, label: 'Bloody Screen' },
    { value: VisualEffect.GLITCH, label: 'Glitch Effect' },
    { value: VisualEffect.STATIC, label: 'Static Noise' },
    { value: VisualEffect.SCREEN_FLICKER, label: 'Screen Flicker' }
  ];

  const handleSave = async () => {
    try {
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
      if (formData.password !== character.password) {
        updates.password = formData.password;
      }
      if ((character.can_access_messages ?? true) !== formData.can_access_messages) {
        updates.can_access_messages = formData.can_access_messages;
      }
      await charactersApi.update(character.id, updates);
    } catch (error: any) {
      console.error('Update error:', error);
      alert(error.response?.data?.error || 'Failed to update user');
    }
  };

  const handleDelete = async () => {
    onDelete(character.id);
  };

  return (
    <div className="character-detail-panel">
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">User Details</p>
          <h2>{character.username}</h2>
          <p className="detail-subtitle">{character.first_name} {character.last_name}</p>
        </div>
        <div className="detail-actions">
          {showBackButton && (
            <button onClick={onBack} className="ghost-btn">Back</button>
          )}
          <button onClick={handleDelete} className="ghost-btn danger">Delete</button>
          <button onClick={handleSave} className="accent-btn">Save Changes</button>
        </div>
      </div>

      <section className="detail-card app-surface">
        <h3 className="section-heading">Operator Info</h3>
        <div className="detail-grid identity-grid">
          <label className="detail-field">
            <span>Username</span>
            <input type="text" value={character.username} disabled />
          </label>
          <label className="detail-field">
            <span>First Name</span>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            />
          </label>
          <label className="detail-field">
            <span>Last Name</span>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            />
          </label>
          <label className="detail-field">
            <span>Title</span>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
        <h3 className="section-heading">Visual Effects</h3>
        <div className="effect-toggle-list">
          {availableEffects.map((effect) => {
            const isActive = visualEffects.includes(effect.value);
            return (
              <label
                key={effect.value}
                className={`effect-toggle-row ${isActive ? 'active' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isActive}
                  onChange={async (e) => {
                    const newEffects = e.target.checked
                      ? [...visualEffects, effect.value]
                      : visualEffects.filter(ef => ef !== effect.value);

                    setVisualEffects(newEffects);

                    try {
                      await charactersApi.updateVisualEffects(character.id, newEffects);
                    } catch (error: any) {
                      console.error('Failed to update visual effects:', error);
                      alert('Failed to update visual effects');
                      setVisualEffects(visualEffects);
                    }
                  }}
                />
                <span className="effect-toggle-switch" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                <div className="effect-toggle-copy">
                  <span className="effect-toggle-label">{effect.label}</span>
                  <span className="effect-toggle-status">{isActive ? 'Enabled' : 'Disabled'}</span>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <section className="detail-card app-surface">
        <h3 className="section-heading">Narrative Hooks</h3>
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
    </div>
  );
}

export default CharacterDetail;
