import { useState, useEffect } from 'react';
import { GameApp, Character, AppCategory } from '../types';
import { appsApi } from '../services/api';

interface Props {
  app: GameApp | null;
  characters: Character[];
  onClose: () => void;
}

function AppForm({ app, characters, onClose }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    category: AppCategory.TEXT
  });

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (app) {
      setFormData({
        name: app.name,
        category: app.category
      });
      setSelectedUsers(new Set(app.allowed_users));
    }
  }, [app]);

  const toggleUser = (username: string) => {
    const newUsers = new Set(selectedUsers);
    if (newUsers.has(username)) {
      newUsers.delete(username);
    } else {
      newUsers.add(username);
    }
    setSelectedUsers(newUsers);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setLoading(true);

    try {
      if (app) {
        // When editing, only update allowed_users
        await appsApi.update(app.id, {
          allowed_users: Array.from(selectedUsers)
        });
      } else {
        // When creating, include name and category
        const dataToSubmit = {
          name: formData.name,
          category: formData.category,
          allowed_users: Array.from(selectedUsers)
        };
        await appsApi.create(dataToSubmit);
      }
      onClose();
    } catch (error: any) {
      console.error('Form error:', error);
      const errorMsg = error.response?.data?.error || 'Failed to save app';
      setErrors([errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{app ? 'Edit App' : 'Add App'}</h2>
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

          {!app && (
            <>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as AppCategory })}
                  required
                >
                  {Object.values(AppCategory).map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {app && (
            <div className="form-group">
              <label>App Information</label>
              <div style={{ padding: '0.75rem', background: 'var(--color-panel)', border: '1px solid var(--color-border-strong)', borderRadius: '4px' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Name:</strong> {app.name}
                </div>
                <div>
                  <strong>Category:</strong> {app.category}
                </div>
              </div>
              <small style={{ color: 'var(--color-text-muted)', fontSize: '0.85em', marginTop: '0.5rem', display: 'block' }}>
                Name and category cannot be changed after creation
              </small>
            </div>
          )}

          <div className="form-group">
            <label>Allowed Users</label>
            <div className="recipients-box">
              {characters.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9em', margin: 0 }}>No users available</p>
              ) : (
                characters.map(char => (
                  <div key={char.username} className="recipient-item">
                    <label className="recipient-label">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(char.username)}
                        onChange={() => toggleUser(char.username)}
                      />
                      <span className="recipient-name">{char.username}</span>
                      <span className="recipient-fullname">
                        ({char.first_name} {char.last_name})
                      </span>
                    </label>
                  </div>
                ))
              )}
            </div>
            <small style={{ color: 'var(--color-text-muted)', fontSize: '0.85em' }}>
              Select users who can access this app. Leave empty to restrict access to no users.
            </small>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AppForm;
