import { FormEvent, ReactNode, useEffect, useMemo, useState, useId } from 'react';
import CodeEditor from '@uiw/react-textarea-code-editor';
import '@uiw/react-textarea-code-editor/dist.css';
import { ArrowLeft, FilePlus, FolderPlus, FileText, Folder, FolderOpen, Trash2, Info, Pencil, Plus, XCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import AccessControlPanel from './AccessControlPanel';
import { appsApi, terminalApi } from '../services/api';
import {
  Character,
  GameApp,
  TerminalAppData,
  TerminalCommandExecution,
  TerminalCustomCommand,
  TerminalCustomCommandArgument,
  TerminalDirectoryNode,
  TerminalDirectoryPermissions,
  TerminalFileSystem,
  TerminalNode,
  TerminalPermissionSet,
  TerminalRunMode,
  TerminalExecuteResponse
} from '../types';

interface Props {
  app: GameApp;
  characters: Character[];
  onBack?: () => void;
  onDelete?: (appId: string) => void;
}

type Tab = 'filesystem' | 'commands' | 'queue' | 'history';

const TAB_ORDER: Tab[] = ['filesystem', 'commands', 'queue', 'history'];

const TAB_LABELS: Record<Tab, string> = {
  filesystem: 'Files',
  commands: 'Commands',
  queue: 'Queue',
  history: 'History'
};

const DEFAULT_DIRECTORY_PERMISSIONS: TerminalDirectoryPermissions = {
  read: true,
  write: true
};

const DEFAULT_FILE_PERMISSIONS: TerminalPermissionSet = {
  read: true,
  write: true,
  execute: true
};

const createRootDirectory = (): TerminalDirectoryNode => {
  const now = new Date().toISOString();
  return {
    id: 'root',
    type: 'directory',
    name: 'root',
    parentId: null,
    hidden: false,
    permissions: { ...DEFAULT_DIRECTORY_PERMISSIONS },
    childrenIds: [],
    createdAt: now,
    updatedAt: now
  };
};

const blankCommand = (): TerminalCustomCommand => ({
  id: uuidv4(),
  name: '',
  syntax: '',
  description: '',
  arguments: [],
  responseMode: 'gm',
  autoResponseTemplate: '',
  manual: '',
  hidden: false
});

const blankArgument = (): TerminalCustomCommandArgument => ({
  name: '',
  type: 'string',
  required: true,
  description: '',
  choices: [],
  defaultValue: ''
});

interface InfoHintProps {
  text: string;
  onClick?: () => void;
  active?: boolean;
  ariaControls?: string;
}

type HistorySortColumn = 'timestamp' | 'username' | 'command' | 'arguments' | 'status' | 'response';

type HistoryFilters = {
  time: string;
  user: string;
  command: string;
  arguments: string;
  status: string;
  response: string;
};

const HISTORY_FILTER_DEFAULTS: HistoryFilters = {
  time: '',
  user: '',
  command: '',
  arguments: '',
  status: '',
  response: ''
};

const HISTORY_STATUS_OPTIONS: Array<TerminalCommandExecution['status']> = [
  'pending',
  'approved',
  'rejected',
  'auto-responded'
];

const InfoHint = ({ text, onClick, active = false, ariaControls }: InfoHintProps) => {
  const className = ['info-hint', onClick ? 'clickable' : '', active ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  const icon = active && onClick ? <XCircle size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={text}
        aria-label={text}
        aria-pressed={active}
        aria-expanded={ariaControls ? active : undefined}
        aria-controls={ariaControls}
        onClick={onClick}
      >
        {icon}
      </button>
    );
  }

  return (
    <span className={className} title={text} role="img" aria-label={text}>
      {icon}
    </span>
  );
};

const normalizeCustomCommand = (command: TerminalCustomCommand): TerminalCustomCommand => ({
  ...command,
  id: command.id || uuidv4(),
  arguments: Array.isArray(command.arguments) ? command.arguments : [],
  responseMode: command.responseMode || 'gm',
  hidden: Boolean(command.hidden),
  manual: command.manual || '',
  autoResponseTemplate: command.responseMode === 'auto' ? command.autoResponseTemplate || '' : command.autoResponseTemplate
});

const buildCommandSyntax = (name: string, args: TerminalCustomCommandArgument[]): string => {
  const base = name?.trim() || 'command';
  if (!args.length) {
    return base;
  }

  const segments = args.map((arg) => {
    const token = `-${arg.name}`;
    const value = `<${arg.name}>`;
    return arg.required ? `${token} ${value}` : `[${token} ${value}]`;
  });

  return `${base} ${segments.join(' ')}`.trim();
};

const normalizeExecutionHistory = (history?: TerminalCommandExecution[]): TerminalCommandExecution[] => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.map((entry) => ({
    ...entry,
    response: entry.response || '',
    status: entry.status || 'pending'
  }));
};

const normalizeFilesystem = (filesystem?: TerminalFileSystem): TerminalFileSystem => {
  const clonedNodes: Record<string, TerminalNode> = filesystem?.nodes
    ? JSON.parse(JSON.stringify(filesystem.nodes))
    : {};

  Object.keys(clonedNodes).forEach((key) => {
    const node = clonedNodes[key];
    if (!node) {
      delete clonedNodes[key];
      return;
    }

    const baseNode = {
      ...node,
      hidden: Boolean(node.hidden),
      createdAt: node.createdAt || new Date().toISOString(),
      updatedAt: node.updatedAt || new Date().toISOString(),
      parentId: node.parentId ?? null
    } as TerminalNode;

    if (node.type === 'directory') {
      clonedNodes[key] = {
        ...baseNode,
        type: 'directory',
        permissions: {
          read: (node.permissions as TerminalDirectoryPermissions)?.read ?? true,
          write: (node.permissions as TerminalDirectoryPermissions)?.write ?? true
        },
        childrenIds: Array.isArray((node as TerminalDirectoryNode).childrenIds)
          ? (node as TerminalDirectoryNode).childrenIds
          : []
      } as TerminalDirectoryNode;
    } else {
      clonedNodes[key] = {
        ...baseNode,
        type: 'file',
        permissions: {
          read: (node.permissions as TerminalPermissionSet)?.read ?? true,
          write: (node.permissions as TerminalPermissionSet)?.write ?? true,
          execute: (node.permissions as TerminalPermissionSet)?.execute ?? true
        },
        openContent: (node as any).openContent ?? '',
        runContent: (node as any).runContent ?? '',
        runMode: (node as any).runMode ?? 'auto'
      } as TerminalNode;
    }
  });

  let rootId = filesystem?.rootId;
  if (!rootId || !clonedNodes[rootId] || clonedNodes[rootId].type !== 'directory') {
    const root = createRootDirectory();
    clonedNodes[root.id] = root;
    rootId = root.id;
  }

  return {
    rootId,
    nodes: clonedNodes
  };
};

const createDefaultTerminalData = (): TerminalAppData => ({
  filesystem: normalizeFilesystem(),
  sessions: {},
  customCommands: [],
  executionHistory: []
});

const normalizeTerminalData = (data?: Partial<TerminalAppData>): TerminalAppData => {
  if (!data) {
    return createDefaultTerminalData();
  }

  return {
    filesystem: normalizeFilesystem(data.filesystem),
    sessions: data.sessions ? { ...data.sessions } : {},
    customCommands: Array.isArray(data.customCommands)
      ? data.customCommands.map((command) => normalizeCustomCommand(command))
      : [],
    executionHistory: normalizeExecutionHistory(data.executionHistory)
  };
};

const cloneTerminalData = (data: TerminalAppData): TerminalAppData => JSON.parse(JSON.stringify(data));

const buildPath = (nodes: Record<string, TerminalNode>, nodeId: string): string => {
  const segments: string[] = [];
  let current: TerminalNode | undefined = nodes[nodeId];

  while (current) {
    segments.unshift(current.name);
    if (!current.parentId) break;
    current = nodes[current.parentId];
  }

  return `/${segments.join('/')}`;
};

const sortChildren = (nodes: Record<string, TerminalNode>, childIds: string[]): string[] => {
  return [...childIds]
    .filter((id) => Boolean(nodes[id]))
    .sort((a, b) => {
      const nodeA = nodes[a]!;
      const nodeB = nodes[b]!;
      if (nodeA.type !== nodeB.type) {
        return nodeA.type === 'directory' ? -1 : 1;
      }
      return nodeA.name.localeCompare(nodeB.name);
    });
};

const removeNodeFromFs = (filesystem: TerminalFileSystem, nodeId: string) => {
  const node = filesystem.nodes[nodeId];
  if (!node) return;

  if (node.type === 'directory') {
    node.childrenIds.forEach((childId) => removeNodeFromFs(filesystem, childId));
  }

  if (node.parentId) {
    const parent = filesystem.nodes[node.parentId];
    if (parent && parent.type === 'directory') {
      parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
    }
  }

  delete filesystem.nodes[nodeId];
};

const formatTimestamp = (timestamp: string): string => {
  try {
    const parsed = JSON.parse(timestamp);
    return `E${parsed.era} D${parsed.day} ${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`;
  } catch {
    return timestamp;
  }
};

const describeExecutionContext = (execution: TerminalCommandExecution): string => {
  if (!execution.context) return '';
  switch (execution.context.type) {
    case 'file-run':
      return `Run ${execution.context.path}`;
    case 'file-open':
      return `Open ${execution.context.path}`;
    case 'custom-command':
      return execution.context.syntax;
    case 'system':
      return execution.context.command;
    default:
      return '';
  }
};

const getComparableTimestamp = (timestamp: string) => {
  const unixTime = Date.parse(timestamp);
  if (!Number.isNaN(unixTime)) {
    return { numeric: unixTime, textual: timestamp };
  }

  try {
    const parsed = JSON.parse(timestamp);
    if (parsed && typeof parsed === 'object') {
      const era = Number(parsed.era ?? 0);
      const day = Number(parsed.day ?? 0);
      const hour = Number(parsed.hour ?? 0);
      const minute = Number(parsed.minute ?? 0);
      const second = Number(parsed.second ?? 0);
      const synthetic = era * 1_000_000_000 + day * 1_000_000 + hour * 10_000 + minute * 100 + second;
      const textual = `E${era} D${day} ${hour}:${minute}`;
      return { numeric: synthetic, textual };
    }
  } catch {
    // fall through
  }

  return { numeric: Number.NaN, textual: timestamp };
};

const formatParsedArguments = (execution: TerminalCommandExecution): string => {
  const parameters = execution.parsedParameters || {};
  const entries = Object.entries(parameters);
  if (!entries.length) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }
      if (typeof value === 'object' && value !== null) {
        return `${key}: ${JSON.stringify(value)}`;
      }
      if (value === undefined || value === null) {
        return `${key}: —`;
      }
      return `${key}: ${String(value)}`;
    })
    .join(', ');
};

function TerminalApp({ app, characters, onBack, onDelete }: Props) {
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set(app.allowed_users));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [terminalData, setTerminalData] = useState<TerminalAppData>(() => normalizeTerminalData(app.data));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(terminalData.filesystem.rootId);
  const [nodeDraft, setNodeDraft] = useState<TerminalNode | null>(null);
  const [selectedTab, setSelectedTab] = useState<Tab>('filesystem');
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [commandForm, setCommandForm] = useState<TerminalCustomCommand>(blankCommand());
  const [argumentForm, setArgumentForm] = useState<TerminalCustomCommandArgument>(blankArgument());
  const [editingArgumentIndex, setEditingArgumentIndex] = useState<number | null>(null);
  const [choiceDraft, setChoiceDraft] = useState('');
  const [newArgumentForm, setNewArgumentForm] = useState<TerminalCustomCommandArgument>(blankArgument());
  const [newChoiceDraft, setNewChoiceDraft] = useState('');
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);
  const [testCommandUsername, setTestCommandUsername] = useState(app.allowed_users[0] || '');
  const [testCommandInput, setTestCommandInput] = useState('');
  const [testCommandResult, setTestCommandResult] = useState<TerminalExecuteResponse | null>(null);
  const [testCommandError, setTestCommandError] = useState<string | null>(null);
  const [isTestingCommand, setIsTestingCommand] = useState(false);
  const templateInfoId = useId();
  const testUserListId = useId();
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState<Set<string>>(() => {
    const initialData = normalizeTerminalData(app.data);
    return new Set([initialData.filesystem.rootId]);
  });
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({ ...HISTORY_FILTER_DEFAULTS });
  const [historySort, setHistorySort] = useState<{ column: HistorySortColumn; direction: 'asc' | 'desc' }>(
    { column: 'timestamp', direction: 'desc' }
  );

  const computedSyntax = useMemo(() => buildCommandSyntax(commandForm.name, commandForm.arguments), [commandForm.name, commandForm.arguments]);

  const tabButtonId = (tab: Tab) => `terminal-tab-${tab}`;
  const tabPanelId = (tab: Tab) => `terminal-panel-${tab}`;

  useEffect(() => {
    setSelectedUsers(new Set(app.allowed_users));
  }, [app.allowed_users]);

  useEffect(() => {
    setTestCommandUsername((prev) => prev || app.allowed_users[0] || '');
  }, [app.allowed_users]);

  useEffect(() => {
    const normalized = normalizeTerminalData(app.data);
    setTerminalData(normalized);
    const fallbackId = normalized.filesystem.rootId;
    const nextSelected = normalized.filesystem.nodes[selectedNodeId || ''] ? selectedNodeId : fallbackId;
    setSelectedNodeId(nextSelected);
  }, [app.data]);

  useEffect(() => {
    if (selectedNodeId) {
      const node = terminalData.filesystem.nodes[selectedNodeId];
      setNodeDraft(node ? JSON.parse(JSON.stringify(node)) : null);
    } else {
      setNodeDraft(null);
    }
  }, [selectedNodeId, terminalData]);

  useEffect(() => {
    const rootId = terminalData.filesystem.rootId;
    setExpandedDirectoryIds((prev) => {
      let changed = false;
      const next = new Set(prev);

      prev.forEach((id) => {
        if (!terminalData.filesystem.nodes[id]) {
          next.delete(id);
          changed = true;
        }
      });

      if (!next.has(rootId)) {
        next.add(rootId);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [terminalData]);

  useEffect(() => {
    if (argumentForm.type !== 'choice') {
      setChoiceDraft('');
    }
  }, [argumentForm.type]);

  useEffect(() => {
    if (newArgumentForm.type !== 'choice') {
      setNewChoiceDraft('');
    }
  }, [newArgumentForm.type]);

  useEffect(() => {
    if (commandForm.responseMode !== 'auto') {
      setShowTemplateGuide(false);
    }
  }, [commandForm.responseMode]);

  useEffect(() => {
    setTestCommandResult(null);
    setTestCommandError(null);
    setTestCommandInput('');
  }, [editingCommandId]);

  const selectedNode = selectedNodeId ? terminalData.filesystem.nodes[selectedNodeId] : null;

  const pendingExecutions = useMemo(
    () => terminalData.executionHistory.filter((execution) => execution.status === 'pending'),
    [terminalData.executionHistory]
  );

  const hasActiveHistoryFilters = useMemo(
    () =>
      Object.entries(historyFilters).some(([key, value]) => {
        if (key === 'status') {
          return Boolean(value);
        }
        return value.trim().length > 0;
      }),
    [historyFilters]
  );

  const historyEntries = useMemo(() => {
    const timeFilter = historyFilters.time.trim().toLowerCase();
    const userFilter = historyFilters.user.trim().toLowerCase();
    const commandFilter = historyFilters.command.trim().toLowerCase();
    const argumentsFilter = historyFilters.arguments.trim().toLowerCase();
    const responseFilter = historyFilters.response.trim().toLowerCase();
    const statusFilter = historyFilters.status;

    const filtered = terminalData.executionHistory.filter((entry) => {
      if (statusFilter && entry.status !== statusFilter) {
        return false;
      }

      if (timeFilter) {
        const formatted = formatTimestamp(entry.timestamp).toLowerCase();
        const raw = String(entry.timestamp).toLowerCase();
        if (!formatted.includes(timeFilter) && !raw.includes(timeFilter)) {
          return false;
        }
      }

      if (userFilter && !entry.username.toLowerCase().includes(userFilter)) {
        return false;
      }

      if (commandFilter) {
        const combinedCommand = `${entry.parsedCommand} ${entry.input || ''}`.toLowerCase();
        if (!combinedCommand.includes(commandFilter)) {
          return false;
        }
      }

      const argumentSummary = formatParsedArguments(entry).toLowerCase();
      if (argumentsFilter && !argumentSummary.includes(argumentsFilter)) {
        return false;
      }

      const responseValue = (entry.response || '').toLowerCase();
      if (responseFilter && !responseValue.includes(responseFilter)) {
        return false;
      }

      return true;
    });

    const sorted = filtered.sort((a, b) => {
      let comparison = 0;

      switch (historySort.column) {
        case 'timestamp': {
          const aTs = getComparableTimestamp(a.timestamp);
          const bTs = getComparableTimestamp(b.timestamp);

          const aNumeric = aTs.numeric;
          const bNumeric = bTs.numeric;

          if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric)) {
            comparison = aNumeric - bNumeric;
          } else if (!Number.isNaN(aNumeric)) {
            comparison = 1;
          } else if (!Number.isNaN(bNumeric)) {
            comparison = -1;
          } else {
            comparison = aTs.textual.localeCompare(bTs.textual, undefined, { sensitivity: 'base' });
          }
          break;
        }
        case 'username':
          comparison = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
          break;
        case 'command':
          comparison = a.parsedCommand.localeCompare(b.parsedCommand, undefined, { sensitivity: 'base' });
          break;
        case 'arguments': {
          const aArgs = formatParsedArguments(a).toLowerCase();
          const bArgs = formatParsedArguments(b).toLowerCase();
          comparison = aArgs.localeCompare(bArgs);
          break;
        }
        case 'status':
          comparison = a.status.localeCompare(b.status, undefined, { sensitivity: 'base' });
          break;
        case 'response': {
          const aResponse = (a.response || '').toLowerCase();
          const bResponse = (b.response || '').toLowerCase();
          comparison = aResponse.localeCompare(bResponse);
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison === 0 && historySort.column !== 'timestamp') {
        const aTs = getComparableTimestamp(a.timestamp);
        const bTs = getComparableTimestamp(b.timestamp);
        const aNumeric = aTs.numeric;
        const bNumeric = bTs.numeric;

        if (!Number.isNaN(aNumeric) && !Number.isNaN(bNumeric)) {
          comparison = aNumeric - bNumeric;
        } else {
          comparison = aTs.textual.localeCompare(bTs.textual, undefined, { sensitivity: 'base' });
        }
      }

      return historySort.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [terminalData.executionHistory, historyFilters, historySort]);

  const getColumnAriaSort = (column: HistorySortColumn): 'ascending' | 'descending' | 'none' => {
    if (historySort.column !== column) {
      return 'none';
    }
    return historySort.direction === 'asc' ? 'ascending' : 'descending';
  };

  const getSortIndicatorState = (column: HistorySortColumn): 'asc' | 'desc' | 'none' => {
    if (historySort.column !== column) {
      return 'none';
    }
    return historySort.direction;
  };

  const buildSortButtonLabel = (column: HistorySortColumn, label: string) => {
    if (historySort.column !== column) {
      return `Sort by ${label} (ascending)`;
    }
    const orderLabel = historySort.direction === 'asc' ? 'ascending' : 'descending';
    return `Sort by ${label}. Currently ${orderLabel}. Activate to toggle order.`;
  };

  const handleHistorySort = (column: HistorySortColumn) => {
    setHistorySort((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      const defaultDirection = column === 'timestamp' ? 'desc' : 'asc';
      return { column, direction: defaultDirection };
    });
  };

  const updateHistoryFilter = (key: keyof HistoryFilters, value: string) => {
    setHistoryFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearHistoryFilters = () => {
    setHistoryFilters(() => ({ ...HISTORY_FILTER_DEFAULTS }));
  };

  const resetHistoryView = () => {
    setHistorySort({ column: 'timestamp', direction: 'desc' });
    clearHistoryFilters();
  };

  const trackedTestExecution = useMemo(() => {
    if (!testCommandResult?.executionId) {
      return null;
    }

    return (
      terminalData.executionHistory.find(
        (entry) => entry.id === testCommandResult.executionId && entry.isTest
      ) || null
    );
  }, [terminalData.executionHistory, testCommandResult?.executionId]);

  useEffect(() => {
    if (!testCommandResult || !trackedTestExecution) {
      return;
    }

    const mappedStatus: TerminalExecuteResponse['status'] = (() => {
      switch (trackedTestExecution.status) {
        case 'approved':
        case 'rejected':
          return trackedTestExecution.status;
        case 'auto-responded':
          return 'auto-responded';
        default:
          return 'pending';
      }
    })();

    const mappedResponse = trackedTestExecution.response || testCommandResult.response || '';

    if (
      mappedStatus !== testCommandResult.status ||
      mappedResponse !== (testCommandResult.response || '')
    ) {
      setTestCommandResult((prev) =>
        prev
          ? {
              ...prev,
              status: mappedStatus,
              response: mappedResponse
            }
          : prev
      );
    }
  }, [trackedTestExecution, testCommandResult?.executionId, testCommandResult?.status, testCommandResult?.response]);

  const toggleUser = async (username: string) => {
    const next = new Set(selectedUsers);
    if (next.has(username)) {
      next.delete(username);
    } else {
      next.add(username);
    }
    setSelectedUsers(next);

    setError(null);
    try {
      await appsApi.update(app.id, { allowed_users: Array.from(next) });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update allowed users');
      setSelectedUsers(new Set(app.allowed_users));
    }
  };

  const saveAppData = async (nextData: TerminalAppData) => {
    setSaving(true);
    setError(null);
    setTerminalData(nextData);
    try {
      await appsApi.update(app.id, { data: nextData });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save terminal data');
    } finally {
      setSaving(false);
    }
  };

  const commitData = (mutator: (draft: TerminalAppData) => void) => {
    const draft = cloneTerminalData(terminalData);
    mutator(draft);
    saveAppData(draft);
  };

  const handleDirectoryToggle = (directoryId: string) => {
    setExpandedDirectoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(directoryId)) {
        next.delete(directoryId);
      } else {
        next.add(directoryId);
      }
      return next;
    });
  };

  const handleAddNode = (type: 'directory' | 'file') => {
    const fallbackParent = terminalData.filesystem.rootId;
    const base = selectedNode;
    const parentId = base?.type === 'directory' ? base.id : base?.parentId || fallbackParent;
    const parent = parentId ? terminalData.filesystem.nodes[parentId] : null;
    if (!parent || parent.type !== 'directory') {
      return;
    }

    const now = new Date().toISOString();
    const newId = uuidv4();
    const newNode: TerminalNode =
      type === 'directory'
        ? {
            id: newId,
            type: 'directory',
            name: 'new-folder',
            parentId: parent.id,
            hidden: false,
            permissions: { read: true, write: true },
            childrenIds: [],
            createdAt: now,
            updatedAt: now
          }
        : {
            id: newId,
            type: 'file',
            name: 'new-file.txt',
            parentId: parent.id,
            hidden: false,
            permissions: { ...DEFAULT_FILE_PERMISSIONS },
            openContent: '',
            runContent: '',
            runMode: 'auto',
            createdAt: now,
            updatedAt: now
          };

    commitData((draft) => {
      draft.filesystem.nodes[newId] = newNode;
      const parentNode = draft.filesystem.nodes[parent.id] as TerminalDirectoryNode;
      parentNode.childrenIds = [...parentNode.childrenIds, newId];
      parentNode.updatedAt = now;
    });

    setSelectedNodeId(newId);
    setExpandedDirectoryIds((prev) => {
      const next = new Set(prev);
      next.add(parent.id);
      return next;
    });
  };

  const handleDeleteNode = () => {
    if (!selectedNode || !selectedNodeId) return;
    if (!selectedNode.parentId) {
      alert('Root directory cannot be deleted.');
      return;
    }
    if (!confirm(`Delete ${buildPath(terminalData.filesystem.nodes, selectedNodeId)} and all of its contents?`)) {
      return;
    }

    commitData((draft) => {
      removeNodeFromFs(draft.filesystem, selectedNodeId);
    });

    setSelectedNodeId(selectedNode.parentId);
  };

  const mutateNode = (nodeId: string, updater: (node: TerminalNode) => void) => {
    commitData((draft) => {
      const target = draft.filesystem.nodes[nodeId];
      if (!target) return;
      updater(target);
      target.updatedAt = new Date().toISOString();
    });
  };

  const handleToggleHiddenFlag = (nodeId: string) => {
    mutateNode(nodeId, (node) => {
      if (!node.parentId) return;
      node.hidden = !node.hidden;
    });
  };

  const handleTogglePermissionFlag = (nodeId: string, permission: 'read' | 'write' | 'execute') => {
    mutateNode(nodeId, (node) => {
      if (node.type === 'directory') {
        if (permission === 'execute') return;
        node.permissions = {
          ...node.permissions,
          [permission]: !node.permissions[permission]
        };
        return;
      }

      node.permissions = {
        ...node.permissions,
        [permission]: !node.permissions[permission]
      };
    });
  };

  const handleCycleRunMode = (nodeId: string) => {
    mutateNode(nodeId, (node) => {
      if (node.type !== 'file') return;
      node.runMode = node.runMode === 'auto' ? 'gm' : 'auto';
    });
  };

  const handleSaveNode = () => {
    if (!selectedNode || !nodeDraft) return;

    commitData((draft) => {
      const nodes = draft.filesystem.nodes;
      const target = nodes[selectedNode.id];
      if (!target) return;
      const now = new Date().toISOString();
      target.name = nodeDraft.name || target.name;
      target.updatedAt = now;
      target.hidden = Boolean((nodeDraft as any).hidden);

      if (target.type === 'directory' && nodeDraft.type === 'directory') {
        target.permissions = { ...nodeDraft.permissions };
      }

      if (target.type === 'file' && nodeDraft.type === 'file') {
        target.permissions = { ...nodeDraft.permissions };
        target.openContent = nodeDraft.openContent || '';
        target.runContent = nodeDraft.runContent || '';
        target.runMode = nodeDraft.runMode as TerminalRunMode;
      }

    });
  };

  const handleTabChange = (tab: Tab) => setSelectedTab(tab);

  const resetArgumentEditor = () => {
    setArgumentForm(blankArgument());
    setEditingArgumentIndex(null);
    setChoiceDraft('');
  };

  const resetNewArgumentForm = () => {
    setNewArgumentForm(blankArgument());
    setNewChoiceDraft('');
  };

  const handleStartNewCommand = () => {
    setEditingCommandId(null);
    setCommandForm(blankCommand());
    resetArgumentEditor();
    resetNewArgumentForm();
  };

  const handleEditCommand = (command: TerminalCustomCommand) => {
    setEditingCommandId(command.id);
    const clone = JSON.parse(JSON.stringify(command));
    clone.hidden = Boolean(command.hidden);
    clone.manual = command.manual || '';
    setCommandForm(clone);
    resetArgumentEditor();
    resetNewArgumentForm();
  };

  const handleCommandKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, command: TerminalCustomCommand) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleEditCommand(command);
    }
  };

  const handleSaveCommand = () => {
    if (!commandForm.name.trim()) {
      alert('Command name is required.');
      return;
    }

    const command: TerminalCustomCommand = {
      ...commandForm,
      id: editingCommandId || commandForm.id || uuidv4(),
      syntax: computedSyntax,
      arguments: commandForm.arguments || [],
      manual: commandForm.manual?.trim() || '',
      autoResponseTemplate: commandForm.autoResponseTemplate?.trim() || '',
      hidden: Boolean(commandForm.hidden)
    };

    commitData((draft) => {
      if (editingCommandId) {
        draft.customCommands = draft.customCommands.map((existing) => (existing.id === editingCommandId ? command : existing));
      } else {
        draft.customCommands = [...draft.customCommands, command];
      }
    });

    handleStartNewCommand();
  };

  const handleDeleteCommand = (commandId: string) => {
    if (!confirm('Delete this command?')) return;
    commitData((draft) => {
      draft.customCommands = draft.customCommands.filter((cmd) => cmd.id !== commandId);
    });
    if (editingCommandId === commandId) {
      handleStartNewCommand();
    }
  };

  const handleArgumentSave = () => {
    if (editingArgumentIndex === null) {
      return;
    }

    if (!argumentForm.name.trim()) {
      alert('Argument name is required.');
      return;
    }

    if (argumentForm.type === 'choice' && (!argumentForm.choices || argumentForm.choices.length === 0)) {
      alert('Add at least one choice option before saving.');
      return;
    }

    const safeChoices = argumentForm.choices?.filter((choice) => choice.trim().length) || [];
    const updatedArgument: TerminalCustomCommandArgument = {
      ...argumentForm,
      choices: safeChoices
    };

    const args = [...(commandForm.arguments || [])];
    args[editingArgumentIndex] = updatedArgument;
    setCommandForm({ ...commandForm, arguments: args });
    resetArgumentEditor();
  };

  const handleArgumentCancelEdit = () => {
    resetArgumentEditor();
  };

  const handleNewArgumentSave = () => {
    if (!newArgumentForm.name.trim()) {
      alert('Argument name is required.');
      return;
    }

    if (newArgumentForm.type === 'choice' && (!newArgumentForm.choices || newArgumentForm.choices.length === 0)) {
      alert('Add at least one choice option before saving.');
      return;
    }

    const safeChoices = newArgumentForm.choices?.filter((choice) => choice.trim().length) || [];
    const nextArgument: TerminalCustomCommandArgument = {
      ...newArgumentForm,
      choices: safeChoices
    };

    setCommandForm({
      ...commandForm,
      arguments: [...(commandForm.arguments || []), nextArgument]
    });
    resetNewArgumentForm();
  };

  const handleAddNewChoiceValue = () => {
    const trimmed = newChoiceDraft.trim();
    if (!trimmed) return;
    setNewArgumentForm((prev) => ({
      ...prev,
      choices: Array.from(new Set([...(prev.choices || []), trimmed]))
    }));
    setNewChoiceDraft('');
  };

  const handleRemoveNewChoiceValue = (value: string) => {
    setNewArgumentForm((prev) => ({
      ...prev,
      choices: (prev.choices || []).filter((choice) => choice.toLowerCase() !== value.toLowerCase())
    }));
  };

  const handleAddChoiceValue = () => {
    const trimmed = choiceDraft.trim();
    if (!trimmed) return;
    setArgumentForm((prev) => ({
      ...prev,
      choices: Array.from(new Set([...(prev.choices || []), trimmed]))
    }));
    setChoiceDraft('');
  };

  const handleRemoveChoiceValue = (value: string) => {
    setArgumentForm((prev) => ({
      ...prev,
      choices: (prev.choices || []).filter((choice) => choice.toLowerCase() !== value.toLowerCase())
    }));
  };

  const handleArgumentEdit = (index: number) => {
    const arg = commandForm.arguments[index];
    setArgumentForm({ ...arg, choices: arg.choices || [] });
    setEditingArgumentIndex(index);
    setChoiceDraft('');
  };

  const handleArgumentDelete = (index: number) => {
    const args = commandForm.arguments.filter((_, idx) => idx !== index);
    setCommandForm({ ...commandForm, arguments: args });
    if (editingArgumentIndex === index) {
      resetArgumentEditor();
    } else if (editingArgumentIndex !== null && editingArgumentIndex > index) {
      setEditingArgumentIndex(editingArgumentIndex - 1);
    }
  };

  const handleExecutionUpdate = (executionId: string, status: 'approved' | 'rejected', response: string) => {
    commitData((draft) => {
      const execution = draft.executionHistory.find((entry) => entry.id === executionId);
      if (!execution) return;
      execution.status = status;
      execution.response = response;
    });
  };
  
  const renderInlineControls = (node: TerminalNode) => {
    const toggles: ReactNode[] = [];
    const buildToggle = (label: string, active: boolean, title: string, onClick: () => void) => (
      <button
        key={`${node.id}-${label}`}
        type="button"
        className={`terminal-inline-toggle ${active ? 'active' : ''}`}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {label}
      </button>
    );
  
    if (node.parentId) {
      toggles.push(
        buildToggle('H', Boolean(node.hidden), node.hidden ? 'Hidden from default listings' : 'Visible in listings', () =>
          handleToggleHiddenFlag(node.id)
        )
      );
    }
  
    if (node.type === 'directory') {
      toggles.push(
        buildToggle('R', node.permissions.read, node.permissions.read ? 'Read enabled' : 'Read disabled', () =>
          handleTogglePermissionFlag(node.id, 'read')
        )
      );
      toggles.push(
        buildToggle('W', node.permissions.write, node.permissions.write ? 'Write enabled' : 'Write disabled', () =>
          handleTogglePermissionFlag(node.id, 'write')
        )
      );
      return toggles;
    }
  
    toggles.push(
      buildToggle('R', node.permissions.read, node.permissions.read ? 'Read enabled' : 'Read disabled', () =>
        handleTogglePermissionFlag(node.id, 'read')
      )
    );
    toggles.push(
      buildToggle('W', node.permissions.write, node.permissions.write ? 'Write enabled' : 'Write disabled', () =>
        handleTogglePermissionFlag(node.id, 'write')
      )
    );
    toggles.push(
      buildToggle('X', node.permissions.execute, node.permissions.execute ? 'Execute enabled' : 'Execute disabled', () =>
        handleTogglePermissionFlag(node.id, 'execute')
      )
    );
    toggles.push(
      buildToggle(
        'AUTO',
        node.runMode === 'auto',
        node.runMode === 'auto' ? 'Auto executes' : 'Requires GM review',
        () => handleCycleRunMode(node.id)
      )
    );
  
    return toggles;
  };

  const renderTree = (node: TerminalNode, depth = 0) => {
    if (!node) return null;
    const isDirectory = node.type === 'directory';
    const children = isDirectory ? sortChildren(terminalData.filesystem.nodes, node.childrenIds) : [];
    const label = node.name === '/' ? '/' : isDirectory ? `${node.name}/` : node.name;
    const isSelected = selectedNodeId === node.id;
    const isExpanded = isDirectory ? expandedDirectoryIds.has(node.id) : false;
    const inlineControls = renderInlineControls(node);
    const hasInlineControls = inlineControls.length > 0;
    const treeIcon = isDirectory
      ? isExpanded
        ? <FolderOpen size={16} aria-hidden="true" />
        : <Folder size={16} aria-hidden="true" />
      : <FileText size={16} aria-hidden="true" />;
    const indent = 12 + depth * 14;

    return (
      <div
        key={node.id}
        className={`terminal-tree-node ${isSelected ? 'selected' : ''} ${node.hidden ? 'is-hidden' : ''}`}
      >
        <div
          className="terminal-tree-row"
          style={{ paddingLeft: indent }}
          onClick={() => {
            setSelectedNodeId(node.id);
            if (isDirectory) {
              handleDirectoryToggle(node.id);
            }
          }}
          aria-expanded={isDirectory ? isExpanded : undefined}
        >
          <div className="terminal-tree-main">
            <span className="terminal-tree-icon">{treeIcon}</span>
            <span className={`terminal-tree-name ${node.hidden ? 'is-hidden' : ''}`}>{label}</span>
          </div>
          {hasInlineControls && (
            <div className="terminal-inline-controls">{inlineControls}</div>
          )}
        </div>
        {isDirectory && children.length > 0 && isExpanded && (
          <div className="terminal-tree-children">
            {children.map((childId: string) => {
              const child = terminalData.filesystem.nodes[childId];
              return child ? renderTree(child, depth + 1) : null;
            })}
          </div>
        )}
      </div>
    );
  };

  const renderFilesystemTab = () => (
    <div className="terminal-grid">
      <div className="terminal-tree-panel terminal-card">
        <div className="terminal-tree-actions">
          <button
            type="button"
            className="terminal-icon-button"
            onClick={() => handleAddNode('directory')}
            aria-label="Create folder"
            title="Create folder"
          >
            <FolderPlus size={18} />
          </button>
          <button
            type="button"
            className="terminal-icon-button"
            onClick={() => handleAddNode('file')}
            aria-label="Create file"
            title="Create file"
          >
            <FilePlus size={18} />
          </button>
        </div>
        <div className="terminal-tree-scroll">
          {renderTree(terminalData.filesystem.nodes[terminalData.filesystem.rootId])}
        </div>
      </div>

      <div className="terminal-editor-panel terminal-card">
        {!nodeDraft || !selectedNode ? (
          <p>Select a file or folder to edit its details.</p>
        ) : (
          <div>
            <h3>Properties</h3>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={nodeDraft.name}
                onChange={(e) => setNodeDraft({ ...nodeDraft, name: e.target.value })}
                disabled={!selectedNode.parentId}
              />
            </div>

            {nodeDraft.type === 'file' ? (
              <>
                <div className="form-group">
                  <label>Open Output</label>
                  <textarea
                    rows={4}
                    value={nodeDraft.openContent}
                    onChange={(e) => setNodeDraft({ ...nodeDraft, openContent: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Run Output</label>
                  <textarea
                    rows={4}
                    value={nodeDraft.runContent}
                    onChange={(e) => setNodeDraft({ ...nodeDraft, runContent: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <p className="terminal-helper-text">Use the inline icons to toggle visibility and permissions.</p>
            )}

            <div className="terminal-editor-actions">
              <button className="primary-btn" onClick={handleSaveNode} disabled={!nodeDraft || saving}>
                Save Changes
              </button>
              {selectedNode.parentId && (
                <button className="delete-btn" onClick={handleDeleteNode} disabled={saving}>
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const handleTestCommandSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUser = testCommandUsername.trim();
    const trimmedCommand = testCommandInput.trim();

    if (!trimmedUser || !trimmedCommand) {
      setTestCommandError('Enter both a username and command input to run a test.');
      setTestCommandResult(null);
      return;
    }

    setIsTestingCommand(true);
    setTestCommandError(null);

    try {
      const { data } = await terminalApi.testCommand(app.id, {
        username: trimmedUser,
        input: trimmedCommand
      });
      const nextResult: TerminalExecuteResponse = {
        ...data,
        executionId: data.executionId ?? data.execution?.id
      };

      setTestCommandResult(nextResult);

      if (data.execution && data.execution.status === 'pending') {
        const testExecution = { ...data.execution, isTest: true };
        setTerminalData((prev) => {
          const draft = cloneTerminalData(prev);
          const existingIndex = draft.executionHistory.findIndex((entry) => entry.id === testExecution.id);
          if (existingIndex >= 0) {
            draft.executionHistory[existingIndex] = testExecution;
          } else {
            draft.executionHistory.push(testExecution);
          }
          return draft;
        });
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to run test command. Please try again.';
      setTestCommandError(message);
      setTestCommandResult(null);
    } finally {
      setIsTestingCommand(false);
    }
  };

  const renderCommandsTab = () => {
    const hasCommands = terminalData.customCommands.length > 0;

    return (
      <div className="terminal-commands-layout">
        <div className="terminal-card commands-list-card">
          <div className="terminal-card-header commands-list-header">
            <div>
              <h3>Defined Commands</h3>
              <p className="terminal-helper-text">
                {hasCommands
                  ? 'Select a command to load it into the editor, or add another at the end of the list.'
                  : 'No custom commands yet—tap the ghost tile below to create one.'}
              </p>
            </div>
          </div>

          {hasCommands ? (
            <div className="command-list" role="list">
              {terminalData.customCommands.map((command) => (
                <div
                  key={command.id}
                  className={`command-list-item ${editingCommandId === command.id ? 'active' : ''}`}
                  role="listitem"
                >
                  <div className="command-list-row">
                    <div
                      className="command-list-trigger"
                      onClick={() => handleEditCommand(command)}
                      onKeyDown={(event) => handleCommandKeyDown(event, command)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit ${command.name}`}
                    >
                      <div className="command-list-content">
                        <div className="command-list-title">
                          <span className="command-name">{command.name}</span>
                          <span className="command-description">{command.description || 'No description provided.'}</span>
                        </div>
                        <div className="command-list-syntax">
                          <code>{buildCommandSyntax(command.name, command.arguments)}</code>
                        </div>
                        <div className="command-list-meta">
                          <span className={`command-mode-pill ${command.hidden ? 'unlisted' : 'listed'}`}>
                            {command.hidden ? 'Unlisted' : 'Listed'}
                          </span>
                          <span className={`command-mode-pill ${command.responseMode === 'gm' ? 'gm' : 'auto'}`}>
                            {command.responseMode === 'gm' ? 'GM Review' : 'Auto'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="command-delete-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCommand(command.id);
                        }}
                        aria-label={`Delete ${command.name}`}
                        title="Delete command"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No custom commands yet.</p>
          )}
          <div className="command-ghost">
            <button type="button" onClick={handleStartNewCommand}>
              <span className="ghost-icon">+</span>
              <div>
                <strong>Create new command</strong>
                <p>Start from a blank template</p>
              </div>
            </button>
          </div>
        </div>

        <div className="terminal-card command-form command-form-card">
          <div className="terminal-card-header">
            <div>
              <h3>{editingCommandId ? `Editing ${commandForm.name || 'Command'}` : 'Create Command'}</h3>
              <p className="terminal-helper-text">
                {editingCommandId
                  ? 'Update the fields below and save to overwrite the existing command.'
                  : 'Fill out the details to define a new custom command.'}
              </p>
            </div>
          </div>

          <div className="command-primary-row">
            <div className="form-group">
              <label>
                Name
                <InfoHint text="Players type this keyword to run the command; keep it short, lowercase, and unique." />
              </label>
              <input
                type="text"
                value={commandForm.name}
                placeholder="Command Name"
                onChange={(e) => setCommandForm({ ...commandForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>
                Short Description
                <InfoHint text="Shows in the help/man listing so write a single friendly sentence players immediately understand." />
              </label>
              <input
                type="text"
                maxLength={160}
                value={commandForm.description || ''}
                onChange={(e) => setCommandForm({ ...commandForm, description: e.target.value })}
                placeholder="One-Line Help Summary"
              />
            </div>
            <div className="command-pill-field">
              <span className="command-pill-label">Help listing</span>
              <button
                type="button"
                className={`command-toggle-pill ${commandForm.hidden ? 'unlisted' : 'listed'}`}
                aria-pressed={!commandForm.hidden}
                onClick={() => setCommandForm({ ...commandForm, hidden: !commandForm.hidden })}
                title={commandForm.hidden ? 'Click to expose this command in help' : 'Click to hide this command from help'}
              >
                {commandForm.hidden ? 'Hidden from help' : 'Listed in help'}
              </button>
            </div>
            <div className="command-pill-field">
              <span className="command-pill-label">Execution</span>
              <button
                type="button"
                className={`command-toggle-pill ${commandForm.responseMode === 'auto' ? 'auto' : 'gm'}`}
                aria-pressed={commandForm.responseMode === 'auto'}
                onClick={() =>
                  setCommandForm({
                    ...commandForm,
                    responseMode: commandForm.responseMode === 'auto' ? 'gm' : 'auto'
                  })
                }
                title={commandForm.responseMode === 'auto' ? 'Click to require GM approval' : 'Click to auto-resolve via template'}
              >
                {commandForm.responseMode === 'auto' ? 'Automatic (template)' : 'Manual (GM review)'}
              </button>
            </div>
          </div>

          <div className="form-group full-span">
            <label>
              Manual Entry
              <InfoHint text="Players type man <command> to read this; describe what the action does, tone, and sample flags." />
            </label>
            <textarea
              rows={4}
              value={commandForm.manual || ''}
              onChange={(e) => setCommandForm({ ...commandForm, manual: e.target.value })}
              placeholder="Full text returned by man &lt;command&gt;. Describe syntax, narrative cues, etc."
            />
          </div>
        <div className="terminal-subsection">
          <div className="terminal-section-header">
            <h4>
              Arguments
              <InfoHint text="These become -flag values players type; keep names short and explain what each one changes for them." />
            </h4>
          </div>

          <div className="argument-list-container">
            <div className="argument-list-box">
            {commandForm.arguments.length === 0 && (
              <p className="terminal-helper-text">No arguments yet. Use the ghost row below to add one.</p>
            )}

            {commandForm.arguments.map((arg, index) => {
              const isEditing = editingArgumentIndex === index;
              const typeLabel = arg.type === 'choice' ? 'Choice' : arg.type === 'number' ? 'Number' : 'String';
              return (
                <div
                  key={arg.name + index}
                  className={`argument-row${isEditing ? ' editing' : ''}`}
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        className="argument-input name"
                        value={argumentForm.name}
                        onChange={(e) => setArgumentForm({ ...argumentForm, name: e.target.value })}
                        placeholder="Name"
                      />
                      <input
                        type="text"
                        className="argument-input description"
                        value={argumentForm.description || ''}
                        onChange={(e) => setArgumentForm({ ...argumentForm, description: e.target.value })}
                        placeholder="Description"
                      />
                      <select
                        className="argument-select"
                        value={argumentForm.type}
                        onChange={(e) => {
                          const nextType = e.target.value as TerminalCustomCommandArgument['type'];
                          setArgumentForm((prev) => ({
                            ...prev,
                            type: nextType,
                            choices: nextType === 'choice' ? prev.choices || [] : []
                          }));
                        }}
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="choice">Choice</option>
                      </select>
                      <select
                        className="argument-select"
                        value={argumentForm.required ? 'yes' : 'no'}
                        onChange={(e) => setArgumentForm({ ...argumentForm, required: e.target.value === 'yes' })}
                      >
                        <option value="yes">Required</option>
                        <option value="no">Optional</option>
                      </select>
                      <input
                        type="text"
                        className="argument-input default"
                        value={argumentForm.defaultValue || ''}
                        onChange={(e) => setArgumentForm({ ...argumentForm, defaultValue: e.target.value })}
                        placeholder="Default"
                      />
                      <div className="argument-actions">
                        <button type="button" className="ghost-btn small" onClick={handleArgumentSave}>
                          Save
                        </button>
                        <button type="button" className="ghost-btn small" onClick={handleArgumentCancelEdit}>
                          Cancel
                        </button>
                      </div>
                      {argumentForm.type === 'choice' && (
                        <div className="argument-choices-editor">
                          <label>Choices:</label>
                          <div className="terminal-choice-chips">
                            {argumentForm.choices && argumentForm.choices.length > 0 ? (
                              argumentForm.choices.map((choice) => (
                                <button
                                  type="button"
                                  key={choice}
                                  className="choice-chip"
                                  onClick={() => handleRemoveChoiceValue(choice)}
                                  title="Remove choice"
                                >
                                  <span>{choice}</span>
                                  <span aria-hidden="true">×</span>
                                </button>
                              ))
                            ) : (
                              <span className="terminal-helper-text">No choices yet.</span>
                            )}
                          </div>
                          <div className="terminal-choice-row">
                            <input
                              type="text"
                              className="argument-input choice"
                              value={choiceDraft}
                              onChange={(e) => setChoiceDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddChoiceValue();
                                }
                              }}
                              placeholder="Add choice and press Enter"
                            />
                            <button type="button" className="ghost-btn small" onClick={handleAddChoiceValue}>
                              Add
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="argument-field name">{arg.name}</span>
                      <span className="argument-field description">{arg.description || 'No description'}</span>
                      <span className="argument-field meta">{typeLabel}</span>
                      <span className={`argument-field meta ${arg.required ? 'required' : 'optional'}`}>
                        {arg.required ? 'Required' : 'Optional'}
                      </span>
                      <span className="argument-field meta">
                        {arg.defaultValue || '—'}
                      </span>
                      <div className="argument-actions">
                        <button
                          type="button"
                          className="argument-icon-btn"
                          onClick={() => handleArgumentEdit(index)}
                          aria-label={`Edit ${arg.name || 'argument'}`}
                          title="Edit argument"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="delete-btn small"
                          onClick={() => handleArgumentDelete(index)}
                          aria-label={`Delete ${arg.name || 'argument'}`}
                          title="Delete argument"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                      {arg.type === 'choice' && arg.choices?.length ? (
                        <div className="argument-choices-info">
                          Choices: {arg.choices.join(', ')}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}

            <div className="argument-row ghost">
              <input
                type="text"
                className="argument-input name"
                value={newArgumentForm.name}
                onChange={(e) => setNewArgumentForm({ ...newArgumentForm, name: e.target.value })}
                placeholder="Name"
              />
              <input
                type="text"
                className="argument-input description"
                value={newArgumentForm.description || ''}
                onChange={(e) => setNewArgumentForm({ ...newArgumentForm, description: e.target.value })}
                placeholder="Description"
              />
              <select
                className="argument-select"
                value={newArgumentForm.type}
                onChange={(e) => {
                  const nextType = e.target.value as TerminalCustomCommandArgument['type'];
                  setNewArgumentForm((prev) => ({
                    ...prev,
                    type: nextType,
                    choices: nextType === 'choice' ? prev.choices || [] : []
                  }));
                }}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="choice">Choice</option>
              </select>
              <select
                className="argument-select"
                value={newArgumentForm.required ? 'yes' : 'no'}
                onChange={(e) => setNewArgumentForm({ ...newArgumentForm, required: e.target.value === 'yes' })}
              >
                <option value="yes">Required</option>
                <option value="no">Optional</option>
              </select>
              <input
                type="text"
                className="argument-input default"
                value={newArgumentForm.defaultValue || ''}
                onChange={(e) => setNewArgumentForm({ ...newArgumentForm, defaultValue: e.target.value })}
                placeholder="Default"
              />
              <div className="argument-actions">
                <button type="button" className="argument-icon-btn" onClick={resetNewArgumentForm} title="Clear all fields">
                  <XCircle size={14} aria-hidden="true" />
                </button>
                <button type="button" className="argument-icon-btn accent" onClick={handleNewArgumentSave} title="Add argument">
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>
              {newArgumentForm.type === 'choice' && (
                <div className="argument-choices-editor">
                  <label>Choices:</label>
                  <div className="terminal-choice-chips">
                    {newArgumentForm.choices && newArgumentForm.choices.length > 0 ? (
                      newArgumentForm.choices.map((choice) => (
                        <button
                          type="button"
                          key={choice}
                          className="choice-chip"
                          onClick={() => handleRemoveNewChoiceValue(choice)}
                          title="Remove choice"
                        >
                          <span>{choice}</span>
                          <span aria-hidden="true">×</span>
                        </button>
                      ))
                    ) : (
                      <span className="terminal-helper-text">No choices yet.</span>
                    )}
                  </div>
                  <div className="terminal-choice-row">
                    <input
                      type="text"
                      className="argument-input choice"
                      value={newChoiceDraft}
                      onChange={(e) => setNewChoiceDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddNewChoiceValue();
                        }
                      }}
                      placeholder="Add choice and press Enter"
                    />
                    <button type="button" className="ghost-btn small" onClick={handleAddNewChoiceValue}>
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        {commandForm.responseMode === 'auto' && (
          <div className="terminal-subsection">
            <div className="terminal-section-header">
              <h4>
                Auto Response Template
                <InfoHint
                  text={
                    showTemplateGuide
                      ? 'Hide how this template resolves for players.'
                      : 'Show how this template resolves for players.'
                  }
                  onClick={() => setShowTemplateGuide((prev) => !prev)}
                  active={showTemplateGuide}
                  ariaControls={templateInfoId}
                />
              </h4>
            </div>
            <div
              id={templateInfoId}
              className={`template-info-panel ${showTemplateGuide ? 'open' : ''}`}
            >
              <div className="template-instructions-box">
                <p>
                  The template editor allows you to define logic that interprets player commands and generates automatic responses based on their inputs. Instead of manually reviewing every command, you can set up dynamic templates that respond intelligently to what players type.
                </p>

                <p><strong>Example command:</strong> <code>scan -target reactor -mode deep -priority high</code></p>
                <p>This command has three arguments: <code>target</code>, <code>mode</code>, and <code>priority</code>.</p>

                <h5>Using argument values</h5>
                <p>Reference any argument the player provides using <code>{'{{args.argumentName}}'}</code>:</p>
                <pre>{'Scanning {{args.target}} using {{args.mode}} scan mode...'}</pre>
                <p className="output-example">Player sees: Scanning reactor using deep scan mode...</p>

                <h5>If/else conditions</h5>
                <p>Change the output based on what the player entered. Available comparison helpers:</p>
                <ul>
                  <li><code>eq</code> — equals</li>
                  <li><code>gt</code> — greater than</li>
                  <li><code>lt</code> — less than</li>
                  <li><code>gte</code> — greater than or equal</li>
                  <li><code>lte</code> — less than or equal</li>
                  <li><code>not</code> — negates an expression</li>
                  <li><code>and</code> — combines conditions (all must be true)</li>
                  <li><code>or</code> — combines conditions (at least one must be true)</li>
                </ul>
                <pre>{'{{#if (eq args.priority "high")}}\nPRIORITY ALERT: High-priority scan initiated.\n{{else}}\nStandard scan protocol engaged.\n{{/if}}'}</pre>
                <p className="output-example">If priority is "high": PRIORITY ALERT: High-priority scan initiated.</p>
                <p className="output-example">If priority is anything else: Standard scan protocol engaged.</p>
                <p>Use <code>not</code> to invert a condition:</p>
                <pre>{'{{#if (not (hasArg "stealth"))}}\nRunning in standard visibility mode.\n{{/if}}'}</pre>
                <p className="output-example">Shows message only if the player did NOT provide a -stealth argument.</p>
                <p>Combine multiple conditions with <code>and</code> (all must be true) or <code>or</code> (at least one must be true):</p>
                <pre>{'{{#if (and (hasArg "mode") (eq args.mode "deep"))}}\nInitiating deep scan protocol...\n{{/if}}'}</pre>
                <p className="output-example">Shows only if player provided -mode AND its value is "deep".</p>
                <pre>{'{{#if (or (eq args.priority "high") (eq args.priority "critical"))}}\nEscalating to command staff.\n{{/if}}'}</pre>
                <p className="output-example">Shows if priority is either "high" OR "critical".</p>

                <h5>Checking if an argument was provided</h5>
                <p>Optional arguments might not be provided by the player. Use <code>hasArg</code> to check before referencing them:</p>
                <pre>{'{{#if (hasArg "mode")}}\nScan mode: {{args.mode}}\n{{else}}\nUsing default scan parameters.\n{{/if}}'}</pre>
                <p className="output-example">If player typed -mode deep: Scan mode: deep</p>
                <p className="output-example">If player didn't provide -mode: Using default scan parameters.</p>

                <h5>Loops with ranges</h5>
                <p>Repeat content multiple times. The <code>{'{{this}}'}</code> keyword represents the current iteration number:</p>
                <pre>{'{{#each (range 1 5)}}\nScan pass {{this}} complete.\n{{/each}}'}</pre>
                <p className="output-example">Player sees:</p>
                <p className="output-example">Scan pass 1 complete.</p>
                <p className="output-example">Scan pass 2 complete.</p>
                <p className="output-example">Scan pass 3 complete.</p>
                <p className="output-example">Scan pass 4 complete.</p>
                <p className="output-example">Scan pass 5 complete.</p>

                <h5>Whitespace and formatting</h5>
                <p><strong>Critical:</strong> Line breaks and spaces in your template are ignored by default. To control formatting in player output:</p>
                <ul>
                  <li><code>{'{{newline}}'}</code> or <code>{'\\n'}</code> — Insert a line break</li>
                  <li><code>{'{{indent}}'}</code> or <code>{'\\t'}</code> — Add indentation (tab)</li>
                </ul>
                <p>Without these helpers, your entire template will appear as a single line to the player, even if you write it across multiple lines in the editor.</p>
              </div>
            </div>
            <CodeEditor
              value={commandForm.autoResponseTemplate || ''}
              language="handlebars"
              placeholder="Use {{argumentName}} to reference player input"
              onChange={(event) =>
                setCommandForm({ ...commandForm, autoResponseTemplate: event.target.value })
              }
              padding={12}
              className="terminal-code-editor"
              data-color-mode="dark"
              style={{ fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.5, minHeight: 160, borderRadius: 12, letterSpacing: 'normal', marginTop: 16 }}
            />
          </div>
        )}

        <div className="command-syntax-panel">
          <div className="command-syntax-header">
            <h4>Command Preview</h4>
          </div>
          <code>{computedSyntax}</code>
          <div className="command-test-panel">
            <div className="command-test-header">
              <h5>Run Test</h5>
              <p className="terminal-helper-text">
                Send a sample command to preview the auto-response. Save changes first so the template matches what you test.
              </p>
            </div>
            <form className="command-test-form" onSubmit={handleTestCommandSubmit}>
              <label>
                Test as player
                <input
                  type="text"
                  value={testCommandUsername}
                  onChange={(e) => setTestCommandUsername(e.target.value)}
                  placeholder="player username"
                  list={testUserListId}
                />
              </label>
              <label>
                Command input
                <input
                  type="text"
                  value={testCommandInput}
                  onChange={(e) => setTestCommandInput(e.target.value)}
                  placeholder={computedSyntax || 'command -flag value'}
                />
              </label>
              <button type="submit" className="primary-btn subtle small" disabled={isTestingCommand}>
                {isTestingCommand ? 'Testing…' : 'Run Test'}
              </button>
            </form>
            <datalist id={testUserListId}>
              {app.allowed_users.map((username) => (
                <option key={username} value={username} />
              ))}
            </datalist>
            {testCommandError && (
              <div className="command-test-output error">{testCommandError}</div>
            )}
            {testCommandResult && (
              <div className="command-test-output">
                <div className="command-test-meta">
                  <span>Status: {testCommandResult.status}</span>
                  {testCommandResult.currentPath && <span>Path: {testCommandResult.currentPath}</span>}
                </div>
                {testCommandResult.status === 'pending' && (
                  <p className="terminal-helper-text command-test-queued">
                    Command queued for GM review. Resolve it from the Queue tab to complete the test.
                  </p>
                )}
                <pre>{testCommandResult.response ? testCommandResult.response.trim() : '(no output returned)'}</pre>
              </div>
            )}
          </div>
        </div>

          <div className="terminal-form-actions">
            <button type="button" className="primary-btn subtle" onClick={handleSaveCommand}>
              {editingCommandId ? 'Update Command' : 'Save Command'}
            </button>
            {editingCommandId && (
              <button type="button" className="ghost-btn" onClick={handleStartNewCommand}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderQueueTab = () => (
    <div>
      {pendingExecutions.length === 0 ? (
        <p className="empty-message">No commands waiting for review.</p>
      ) : (
        pendingExecutions.map((execution) => (
          <QueueItem key={execution.id} execution={execution} onResolve={handleExecutionUpdate} />
        ))
      )}
    </div>
  );

  const renderHistoryTab = () => {
    const totalHistoryCount = terminalData.executionHistory.length;
    const displayedCount = historyEntries.length;
    const isDefaultHistorySort = historySort.column === 'timestamp' && historySort.direction === 'desc';
    const canResetHistoryView = hasActiveHistoryFilters || !isDefaultHistorySort;

    if (totalHistoryCount === 0) {
      return <p className="empty-message">No command executions yet.</p>;
    }

    return (
      <div className="terminal-card history-card">
        <div className="history-card-header">
          <div>
            <h3 className="history-title">Execution History</h3>
            <p className="history-subtitle">
              Showing {displayedCount} of {totalHistoryCount} entries
            </p>
          </div>
          {canResetHistoryView && (
            <div className="history-card-actions">
              <button type="button" className="ghost-btn small" onClick={resetHistoryView}>
                Reset view
              </button>
            </div>
          )}
        </div>

        <div className="terminal-table-wrapper history-table-wrapper">
          <table className="terminal-history-table">
            <thead>
              <tr>
                <th scope="col" aria-sort={getColumnAriaSort('timestamp')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('timestamp')}
                      aria-label={buildSortButtonLabel('timestamp', 'Time')}
                      title={buildSortButtonLabel('timestamp', 'Time')}
                    >
                      <span>Time</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('timestamp')} aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      className="history-header-filter"
                      value={historyFilters.time}
                      onChange={(event) => updateHistoryFilter('time', event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter by time"
                    />
                  </div>
                </th>
                <th scope="col" aria-sort={getColumnAriaSort('username')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('username')}
                      aria-label={buildSortButtonLabel('username', 'User')}
                      title={buildSortButtonLabel('username', 'User')}
                    >
                      <span>User</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('username')} aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      className="history-header-filter"
                      value={historyFilters.user}
                      onChange={(event) => updateHistoryFilter('user', event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter by user"
                    />
                  </div>
                </th>
                <th scope="col" aria-sort={getColumnAriaSort('command')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('command')}
                      aria-label={buildSortButtonLabel('command', 'Command')}
                      title={buildSortButtonLabel('command', 'Command')}
                    >
                      <span>Command</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('command')} aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      className="history-header-filter"
                      value={historyFilters.command}
                      onChange={(event) => updateHistoryFilter('command', event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter by command"
                    />
                  </div>
                </th>
                <th scope="col" aria-sort={getColumnAriaSort('arguments')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('arguments')}
                      aria-label={buildSortButtonLabel('arguments', 'Arguments')}
                      title={buildSortButtonLabel('arguments', 'Arguments')}
                    >
                      <span>Arguments</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('arguments')} aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      className="history-header-filter"
                      value={historyFilters.arguments}
                      onChange={(event) => updateHistoryFilter('arguments', event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter by arguments"
                    />
                  </div>
                </th>
                <th scope="col" aria-sort={getColumnAriaSort('status')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('status')}
                      aria-label={buildSortButtonLabel('status', 'Status')}
                      title={buildSortButtonLabel('status', 'Status')}
                    >
                      <span>Status</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('status')} aria-hidden="true" />
                    </button>
                    <select
                      className="history-header-filter"
                      value={historyFilters.status}
                      onChange={(event) => updateHistoryFilter('status', event.target.value)}
                      aria-label="Filter by status"
                    >
                      <option value="">All</option>
                      {HISTORY_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
                <th scope="col" aria-sort={getColumnAriaSort('response')}>
                  <div className="history-header-cell">
                    <button
                      type="button"
                      className="history-sort-button"
                      onClick={() => handleHistorySort('response')}
                      aria-label={buildSortButtonLabel('response', 'Response')}
                      title={buildSortButtonLabel('response', 'Response')}
                    >
                      <span>Response</span>
                      <span className="sort-indicator" data-state={getSortIndicatorState('response')} aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      className="history-header-filter"
                      value={historyFilters.response}
                      onChange={(event) => updateHistoryFilter('response', event.target.value)}
                      placeholder="Filter"
                      aria-label="Filter by response"
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {historyEntries.map((execution) => {
                const argumentSummary = formatParsedArguments(execution);
                const commandInput = execution.input?.trim() ? execution.input : '';
                const responseText = execution.response || '(pending)';

                return (
                  <tr key={execution.id}>
                    <td title={execution.timestamp}>{formatTimestamp(execution.timestamp)}</td>
                    <td title={execution.username}>{execution.username}</td>
                    <td className="history-command-cell" title={commandInput || execution.parsedCommand}>
                      <span className="history-command-main">{execution.parsedCommand}</span>
                      {commandInput && <span className="history-command-input">{commandInput}</span>}
                    </td>
                    <td title={argumentSummary || undefined} className="history-arguments-cell">
                      {argumentSummary || '—'}
                    </td>
                    <td>
                      <div className="history-status-cell">
                        <span className={`history-status history-status--${execution.status}`}>
                          {execution.status}
                        </span>
                        {execution.isTest && <span className="queue-test-badge history-test-badge">Test Run</span>}
                      </div>
                    </td>
                    <td className="terminal-history-response history-response-cell" title={responseText}>
                      {responseText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTabContent = (tab: Tab) => {
    switch (tab) {
      case 'filesystem':
        return renderFilesystemTab();
      case 'commands':
        return renderCommandsTab();
      case 'queue':
        return renderQueueTab();
      case 'history':
        return renderHistoryTab();
      default:
        return null;
    }
  };

  const handleDelete = () => {
    onDelete?.(app.id);
  };

  return (
    <div className="app-interface">
      <div className="app-interface-header">
        <div className="app-interface-title-row">
          <div className="app-title-cluster">
            <button onClick={onBack} className="back-btn" type="button" title="Back to apps list">
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="sr-only">Back to apps list</span>
            </button>
            <h2>{app.name}</h2>
            <span className="category-badge">{app.category}</span>
            {saving && <span className="saving-pill">Saving…</span>}
          </div>
          <button onClick={handleDelete} className="delete-btn" type="button">
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete App</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      <div className="app-access-shell">
        <AccessControlPanel
          title="Access Control"
          characters={characters}
          selectedUsernames={selectedUsers}
          onToggleUser={toggleUser}
        />
      </div>

      <div className="terminal-panel-group">
        <div className="terminal-tabs" role="tablist" aria-label="Terminal sections">
          {TAB_ORDER.map((tab) => {
            const isActive = selectedTab === tab;
            const pendingCount = tab === 'queue' ? pendingExecutions.length : 0;
            const accessibleLabel =
              tab === 'queue' && pendingCount > 0
                ? `${TAB_LABELS[tab]} (${pendingCount} pending)`
                : TAB_LABELS[tab];
            return (
              <button
                key={tab}
                id={tabButtonId(tab)}
                type="button"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-controls={tabPanelId(tab)}
                aria-label={accessibleLabel}
                onClick={() => handleTabChange(tab)}
                className={`terminal-tab ${isActive ? 'active' : ''}`}
              >
                <span className="terminal-tab-label">{TAB_LABELS[tab]}</span>
                {tab === 'queue' && pendingCount > 0 && (
                  <span className="terminal-tab-badge" aria-hidden="true">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="app-interface-content tabbed-panel">
          {TAB_ORDER.map((tab) => (
            <section
              key={tab}
              id={tabPanelId(tab)}
              role="tabpanel"
              aria-labelledby={tabButtonId(tab)}
              hidden={selectedTab !== tab}
              className="terminal-tabpanel"
            >
              {selectedTab === tab && renderTabContent(tab)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function QueueItem({
  execution,
  onResolve
}: {
  execution: TerminalCommandExecution;
  onResolve: (id: string, status: 'approved' | 'rejected', response: string) => void;
}) {
  const [response, setResponse] = useState(execution.response || '');
  const contextDescription = describeExecutionContext(execution);

  return (
    <div className="terminal-card queue-card">
      {execution.isTest && <span className="queue-test-badge">Test Run</span>}
      <div className="queue-meta-grid">
        <div>
          <span className="queue-label">User</span>
          <p>{execution.username}</p>
        </div>
        <div>
          <span className="queue-label">Time</span>
          <p>{formatTimestamp(execution.timestamp)}</p>
        </div>
        <div>
          <span className="queue-label">Command</span>
          <p>{execution.parsedCommand}</p>
        </div>
        <div>
          <span className="queue-label">Context</span>
          <p>{contextDescription}</p>
        </div>
      </div>

      <div className="form-group queue-response">
        <label>Response</label>
        <textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
      </div>

      <div className="terminal-form-actions queue-actions">
        <button className="primary-btn" onClick={() => onResolve(execution.id, 'approved', response)}>
          Approve & Send
        </button>
        <button
          className="delete-btn"
          onClick={() => onResolve(execution.id, 'rejected', response || 'Unable to process this command right now.')}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default TerminalApp;
