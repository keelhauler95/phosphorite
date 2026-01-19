import { type CSSProperties, type KeyboardEvent } from 'react';
import { SETTINGS_SECTIONS, type SettingsSection } from './settingsSections';

interface Props {
  onSelect: (section: SettingsSection) => void;
}

function SettingsOverview({ onSelect }: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, section: SettingsSection) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(section);
    }
  };

  return (
    <>
      <div className="panel-header">
        <h2>Settings: Overview</h2>
      </div>
      <div className="list app-grid-wrapper">
        <div className="app-grid">
          {SETTINGS_SECTIONS.map((section, index) => {
            const Icon = section.icon;
            const accentStyle = {
              '--app-accent': section.accent,
              '--app-accent-rgb': section.accentRgb
            } as CSSProperties;
            const orderLabel = `#${(index + 1).toString().padStart(2, '0')}`;

            return (
              <article
                key={section.id}
                className="app-card"
                style={accentStyle}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(section.id)}
                onKeyDown={(event) => handleKeyDown(event, section.id)}
              >
                <header className="app-card-header">
                  <div className="app-card-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <div className="app-card-title">
                    <span className="app-card-order">{orderLabel}</span>
                    <h3>{section.title}</h3>
                  </div>
                </header>
                <div className="app-card-body">
                  <p>{section.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default SettingsOverview;
