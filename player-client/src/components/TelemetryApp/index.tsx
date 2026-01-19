import React, { useState } from 'react';
import { TelemetryAppData, MonitoringGroup, NumericalParameter, TextualParameter } from '../../types';
import Teletype from '../Teletype';
import './style.scss';

interface TelemetryAppProps {
  data: TelemetryAppData;
  onBackToMenu: () => void;
}

const isNumericalParameter = (param: NumericalParameter | TextualParameter): param is NumericalParameter => {
  return 'lowerLimit' in param;
};

const ProgressBar: React.FC<{ value: number; min: number; max: number }> = ({ value, min, max }) => {
  const range = max - min;
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  const filledSegments = Math.round(normalized * 10);
  
  let bar = '│';
  for (let i = 0; i < 10; i++) {
    bar += i < filledSegments ? '█' : '░';
  }
  bar += '│';
  
  return <span className="progress-bar">{bar}</span>;
};

const getParameterStatus = (param: NumericalParameter | TextualParameter): 'normal' | 'warning' | 'critical' | 'error' => {
  if (!isNumericalParameter(param)) {
    // For textual parameters, only mark as error if expected value is provided and doesn't match
    if (param.expectedValue && param.expectedValue.trim() && param.value !== param.expectedValue) {
      return 'error';
    }
    return 'normal';
  }
  
  // For numerical parameters - use explicit thresholds
  const value = param.value ?? 0;
  const criticalLower = param.criticalLower ?? param.lowerLimit;
  const criticalUpper = param.criticalUpper ?? param.upperLimit;
  const warningLower = param.warningLower ?? param.lowerLimit;
  const warningUpper = param.warningUpper ?? param.upperLimit;
  
  // Critical: at or beyond critical thresholds
  if (value <= criticalLower || value >= criticalUpper) {
    return 'critical';
  }
  
  // Warning: beyond warning thresholds
  if (value <= warningLower || value >= warningUpper) {
    return 'warning';
  }
  
  // Normal: within safe range
  return 'normal';
};

const ParameterRow: React.FC<{ param: NumericalParameter | TextualParameter }> = ({ param }) => {
  const isNumerical = isNumericalParameter(param);
  const value = isNumerical ? param.value.toFixed(2) : param.value;
  const status = getParameterStatus(param);
  
  return (
    <div className={`parameter-row status-${status}`}>
      <span className="param-name">{param.name}</span>
      <span className="param-value">{value}</span>
      {param.unit && <span className="param-unit">{param.unit}</span>}
      {isNumerical && (
        <span className="progress-bar-inline">
          <ProgressBar value={param.value} min={param.lowerLimit} max={param.upperLimit} />
        </span>
      )}
    </div>
  );
};

const MonitoringGroupButton: React.FC<{
  group: MonitoringGroup;
  onSelect: () => void;
  startDelay: number;
}> = ({ group, onSelect, startDelay }) => {
  return (
    <div
      className="monitoring-group-button"
      onClick={onSelect}
    >
      <Teletype
        text={`> ${group.name}`}
        speed={25}
        autoScroll={false}
        startDelay={startDelay}
        scrollOnStart={true}
      />
    </div>
  );
};

const GroupDetailsView: React.FC<{
  group: MonitoringGroup;
  onBack: () => void;
}> = ({ group, onBack }) => {
  return (
    <div className="group-details-view">
      <div className="group-header">
        <span className="back-link" onClick={onBack}>
          <Teletype text="< back" speed={25} />
        </span>
      </div>
      <div className="parameters-list">
        {group.parameters.map((param, index) => (
          <ParameterRow key={index} param={param} />
        ))}
      </div>
    </div>
  );
};

const TelemetryApp: React.FC<TelemetryAppProps> = ({ data, onBackToMenu }) => {
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  
  const handleSelectGroup = (index: number) => {
    setSelectedGroupIndex(index);
  };

  const handleBackFromDetails = () => {
    setSelectedGroupIndex(null);
  };

  // Always render the main structure so back button is available
  const groups = data?.monitoringGroups || [];

  return (
    <div className="telemetry-app">
      {selectedGroupIndex === null ? (
        <div className="groups-list-view">
          <div className="groups-list-header">
            <span className="back-link" onClick={onBackToMenu}>
              <Teletype text="< Back to Menu" speed={25} autoScroll={false} />
            </span>
          </div>
          {groups.length > 0 ? (
            <div className="groups-list">
              {groups.map((group, index) => (
                <MonitoringGroupButton
                  key={index}
                  group={group}
                  onSelect={() => handleSelectGroup(index)}
                  startDelay={index * 200}
                />
              ))}
            </div>
          ) : (
            <div className="no-groups-message">
              <Teletype text="No telemetry groups available" speed={30} />
            </div>
          )}
        </div>
      ) : groups.length > 0 ? (
        <GroupDetailsView
          group={groups[selectedGroupIndex]}
          onBack={handleBackFromDetails}
        />
      ) : null}
    </div>
  );
};

export default TelemetryApp;

