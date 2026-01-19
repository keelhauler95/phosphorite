import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { gamestateApi } from '../services/api';
import { GamestatePayload, GamestateSection } from '../types';

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  preview?: string;
  path: string[];
}

type SelectionState = Record<string, boolean>;

const SECTION_LABELS: Record<GamestateSection, string> = {
  gameTime: 'Game Time',
  characters: 'Characters',
  apps: 'Apps',
  messages: 'Messages',
  settings: 'Settings'
};

const formatPreview = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value.slice(0, 120) + (value.length > 120 ? '…' : '');
  }
  return JSON.stringify(value, null, 2).slice(0, 160);
};

const buildTree = (data: GamestatePayload): TreeNode[] => {
  const sections: TreeNode[] = [];

  const gameTimeNode: TreeNode = {
    id: 'gameTime',
    label: SECTION_LABELS.gameTime,
    path: ['gameTime'],
    children: Object.entries(data.gameTime).map(([key, value]) => ({
      id: `gameTime.${key}`,
      label: key,
      path: ['gameTime', key],
      preview: formatPreview(value)
    }))
  };
  sections.push(gameTimeNode);

  const buildArrayChildren = (sectionKey: keyof GamestatePayload, labelField: string) =>
    (data[sectionKey] as Record<string, any>[]).map((item, idx) => {
      const primaryLabel = item[labelField] || `${SECTION_LABELS[sectionKey as GamestateSection]} ${idx + 1}`;
      return {
        id: `${sectionKey}.${idx}`,
        label: primaryLabel,
        path: [sectionKey, String(idx)],
        children: Object.entries(item).map(([key, value]) => ({
          id: `${sectionKey}.${idx}.${key}`,
          label: key,
          path: [sectionKey, String(idx), key],
          preview: formatPreview(value)
        }))
      } as TreeNode;
    });

  sections.push({
    id: 'characters',
    label: SECTION_LABELS.characters,
    path: ['characters'],
    children: buildArrayChildren('characters', 'username')
  });

  sections.push({
    id: 'apps',
    label: SECTION_LABELS.apps,
    path: ['apps'],
    children: buildArrayChildren('apps', 'name')
  });

  sections.push({
    id: 'messages',
    label: SECTION_LABELS.messages,
    path: ['messages'],
    children: buildArrayChildren('messages', 'subject')
  });

  sections.push({
    id: 'settings',
    label: SECTION_LABELS.settings,
    path: ['settings'],
    children: data.settings.map((setting, idx) => ({
      id: `settings.${setting.key || idx}`,
      label: setting.key || `Setting ${idx + 1}`,
      path: ['settings', setting.key || String(idx)],
      preview: formatPreview(setting.value)
    }))
  });

  return sections;
};

const flattenSelection = (nodes: TreeNode[], state: SelectionState = {}, parentValue = true) => {
  nodes.forEach((node) => {
    const currentValue = state[node.id] ?? parentValue;
    state[node.id] = currentValue;
    if (node.children) {
      flattenSelection(node.children, state, currentValue);
    }
  });
  return state;
};

const applySelectionToTree = (nodes: TreeNode[], nodeId: string, value: boolean, target: SelectionState): boolean => {
  for (const node of nodes) {
    if (node.id === nodeId) {
      const applyBranch = (branch: TreeNode) => {
        target[branch.id] = value;
        branch.children?.forEach(applyBranch);
      };
      applyBranch(node);
      return true;
    }
    if (node.children && applySelectionToTree(node.children, nodeId, value, target)) {
      return true;
    }
  }
  return false;
};

const collectSelectedSections = (state: SelectionState): GamestateSection[] => {
  return (Object.keys(SECTION_LABELS) as GamestateSection[]).filter((section) => state[section]);
};

const getCheckboxState = (node: TreeNode, selection: SelectionState): { checked: boolean; indeterminate: boolean } => {
  if (!node.children?.length) {
    return { checked: selection[node.id] || false, indeterminate: false };
  }
  
  const childStates = node.children.map(child => getCheckboxState(child, selection));
  const allChecked = childStates.every(state => state.checked && !state.indeterminate);
  const noneChecked = childStates.every(state => !state.checked && !state.indeterminate);
  
  if (allChecked) {
    return { checked: true, indeterminate: false };
  } else if (noneChecked) {
    return { checked: false, indeterminate: false };
  } else {
    return { checked: false, indeterminate: true };
  }
};

const TreeBox: React.FC<{
  node: TreeNode;
  selection: SelectionState;
  onToggle: (nodeId: string, isSelected: boolean) => void;
}> = ({ node, selection, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  const childrenRef = useRef<HTMLDivElement>(null);
  const checkboxState = getCheckboxState(node, selection);
  const hasChildren = Boolean(node.children?.length);
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = checkboxState.indeterminate;
    }
  }, [checkboxState.indeterminate]);

  const toggleSelf = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onToggle(node.id, !checkboxState.checked);
  };

  const toggleExpansion = () => setExpanded((prev) => !prev);

  const handleBoxClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on checkbox
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('input[type="checkbox"]')) {
      return;
    }
    
    // Don't toggle if clicking on a nested child tree-box
    if (target.closest('.tree-box') !== e.currentTarget) {
      return;
    }
    
    if (hasChildren) {
      e.stopPropagation();
      toggleExpansion();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasChildren) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpansion();
    }
  };

  return (
    <div 
      className={`tree-box ${hasChildren ? 'tree-box--parent tree-box--clickable' : ''}`.trim()}
      onClick={handleBoxClick}
      onKeyDown={handleKeyDown}
      role={hasChildren ? 'button' : undefined}
      tabIndex={hasChildren ? 0 : -1}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div className="tree-box-header">
        <div className="tree-box-label">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={checkboxState.checked}
            onChange={toggleSelf}
            aria-label={`Select ${node.label}`}
          />
          <span>{node.label}</span>
        </div>
        {hasChildren && (
          <ChevronRight 
            size={18} 
            className={`tree-box-chevron ${expanded ? 'tree-box-chevron--expanded' : ''}`}
          />
        )}
      </div>
      {node.preview && (
        <pre className="tree-box-preview">{node.preview}</pre>
      )}
      {hasChildren && (
        <div 
          ref={childrenRef}
          className="tree-box-children"
          style={{
            maxHeight: expanded ? `${childrenRef.current?.scrollHeight || 1000}px` : '0',
            opacity: expanded ? 1 : 0
          }}
        >
          {node.children!.map((child) => (
            <TreeBox key={child.id} node={child} selection={selection} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
};

const GamestateView: React.FC = () => {
  const [snapshot, setSnapshot] = useState<GamestatePayload | null>(null);
  const [importPreview, setImportPreview] = useState<GamestatePayload | null>(null);
  const [exportSelection, setExportSelection] = useState<SelectionState>({});
  const [importSelection, setImportSelection] = useState<SelectionState>({});
  const [importContent, setImportContent] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadSnapshot = async () => {
      try {
        const response = await gamestateApi.export();
        setSnapshot(response);
        setExportSelection(flattenSelection(buildTree(response)));
      } catch (error) {
        console.error('Failed to load snapshot', error);
        setStatusError('Unable to load the current gamestate.');
      }
    };
    loadSnapshot();
  }, []);

  const exportTree = useMemo(() => (snapshot ? buildTree(snapshot) : []), [snapshot]);
  const importTree = useMemo(() => (importPreview ? buildTree(importPreview) : []), [importPreview]);

  const createToggleHandler = (tree: TreeNode[], selectionSetter: React.Dispatch<React.SetStateAction<SelectionState>>) =>
    (nodeId: string, isSelected: boolean) => {
      selectionSetter((current) => {
        const next = { ...current };
        applySelectionToTree(tree, nodeId, isSelected, next);
        return next;
      });
    };

  const exportToggle = useMemo(() => createToggleHandler(exportTree, setExportSelection), [exportTree]);
  const importToggle = useMemo(() => createToggleHandler(importTree, setImportSelection), [importTree]);

  const selectedExportSections = useMemo(() => collectSelectedSections(exportSelection), [exportSelection]);
  const selectedImportSections = useMemo(() => collectSelectedSections(importSelection), [importSelection]);

  const serializeSelected = (data: GamestatePayload, selectedSections: GamestateSection[]) => {
    const payload: Record<string, any> = {
      version: data.version,
      exportedAt: data.exportedAt,
      selectedSections
    };
    selectedSections.forEach((sectionKey) => {
      payload[sectionKey] = data[sectionKey];
    });
    return payload;
  };

  const handleExport = async () => {
    if (!snapshot) return;
    try {
      setIsExporting(true);
      setStatusError(null);
      setExportSuccess(false);
      if (!selectedExportSections.length) {
        setStatusError('Pick at least one section to export.');
        setIsExporting(false);
        return;
      }
      const payload = JSON.stringify(serializeSelected(snapshot, selectedExportSections), null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `gamestate_${selectedExportSections.join('-')}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error('Export error', error);
      setStatusError('Failed to export the selected gamestate.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      const jsonContent = loadEvent.target?.result as string;
      if (!jsonContent) return;
      try {
        setStatusError(null);
        setImportSuccess(false);
        const response = await gamestateApi.preview(jsonContent);
        const tree = buildTree(response.data.gameState);
        const defaultSelection = flattenSelection(tree);
        const hintedSections = response.data.gameState.selectedSections;
        if (hintedSections?.length) {
          const allowed = new Set<GamestateSection>(hintedSections);
          tree.forEach((node) => {
            if (Object.prototype.hasOwnProperty.call(SECTION_LABELS, node.id) && !allowed.has(node.id as GamestateSection)) {
              applySelectionToTree(tree, node.id, false, defaultSelection);
            }
          });
        }
        setImportPreview(response.data.gameState);
        setImportSelection(defaultSelection);
        setImportContent(jsonContent);
      } catch (error) {
        console.error('Preview failed', error);
        setStatusError('Failed to parse the uploaded file.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importPreview || !importContent) {
      setStatusError('Upload a file before importing.');
      return;
    }
    const selectedSections = collectSelectedSections(importSelection);
    if (!selectedSections.length) {
      setStatusError('Select at least one section to import.');
      return;
    }
    try {
      setIsImporting(true);
      setStatusError(null);
      setImportSuccess(false);
      await gamestateApi.import({
        jsonContent: importContent,
        sections: selectedImportSections
      });
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (error) {
      console.error('Import error', error);
      setStatusError('Failed to import the selected sections.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="app-interface gamestate-grid">

      {statusError && (
        <div className="error-box">
          <p>{statusError}</p>
        </div>
      )}

      <div className="app-interface-content gamestate-panels">
        <section className="gamestate-panel">
          <header>
            <h3>Export</h3>
            <p>Select the parts of the live gamestate you want to archive.</p>
          </header>
          <div className="tree-stack">
            {exportTree.map((node) => (
              <TreeBox
                key={node.id}
                node={node}
                selection={exportSelection}
                onToggle={exportToggle}
              />
            ))}
          </div>
          <footer className="gamestate-footer">
            <button 
              className={`primary-btn ${exportSuccess ? 'btn-success' : ''}`}
              onClick={handleExport} 
              disabled={isExporting || !snapshot || !selectedExportSections.length}
            >
              {isExporting ? 'Preparing…' : 'Export Selected'}
            </button>
          </footer>
        </section>

        <section className="gamestate-panel">
          <header>
            <h3>Import</h3>
            <p>Load a file and choose the sections you want to apply.</p>
          </header>
          <input
            type="file"
            accept="application/json,.json"
            ref={importInputRef}
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <div className="tree-stack">
            {importTree.length ? (
              importTree.map((node) => (
                <TreeBox
                  key={node.id}
                  node={node}
                  selection={importSelection}
                  onToggle={importToggle}
                />
              ))
            ) : (
              <p className="tree-placeholder">Upload a gamestate file to preview its contents.</p>
            )}
          </div>
          <footer className="gamestate-footer">
            <button className="secondary-btn" onClick={() => importInputRef.current?.click()}>
              Choose File
            </button>
            <button 
              className={`primary-btn ${importSuccess ? 'btn-success' : ''}`}
              onClick={handleImport} 
              disabled={isImporting || !importPreview || !selectedImportSections.length}
            >
              {isImporting ? 'Applying…' : 'Import Selected'}
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
};

export default GamestateView;
