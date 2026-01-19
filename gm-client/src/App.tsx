import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock3, Menu, Pause, Play, X } from 'lucide-react';
import { Character, GameApp, Message, GameTimeState, SocketEvent, AppCategory, TerminalCommandExecution, TerminalAppData } from './types';
import { charactersApi, appsApi, messagesApi, gameTimeApi } from './services/api';
import socketService from './services/socket';
import GameTimeBar from './components/GameTimeBar';
import Sidebar from './components/Sidebar';
import CharacterList from './components/CharacterList';
import AppList from './components/AppList';
import CharacterForm from './components/CharacterForm';
import CharacterDetail from './components/CharacterDetail';
import MessageHub from './components/MessageHub';
import SettingsForm from './components/SettingsForm';
import TextApp from './components/TextApp';
import TelemetryApp from './components/TelemetryApp';
import LogbookApp from './components/LogbookApp';
import ImageApp from './components/ImageApp';
import MapApp from './components/MapApp';
import TerminalApp from './components/TerminalApp';
import LLMChatApp from './components/LLMChatApp';
import BroadcastView from './components/BroadcastView';
import SettingsOverview from './components/SettingsOverview';
import { SETTINGS_SECTIONS, type SettingsSection } from './components/settingsSections';
import phosphoriteIcon from './assets/phosphorite-icon.svg';
import { useGameClock } from './hooks/useGameClock';
import './App.css';

interface TerminalCommandNotification {
  id: string;
  appId: string;
  appName: string;
  execution: TerminalCommandExecution;
  receivedAt: number;
  draftResponse: string;
}

const cloneTerminalData = (data?: any): TerminalAppData => {
  const base = (data && typeof data === 'object') ? data : {};
  const safe: TerminalAppData = {
    filesystem: base.filesystem || { rootId: '', nodes: {} },
    sessions: base.sessions || {},
    customCommands: Array.isArray(base.customCommands) ? base.customCommands : [],
    executionHistory: Array.isArray(base.executionHistory) ? base.executionHistory : []
  };

  return JSON.parse(JSON.stringify(safe));
};

const getViewportSnapshot = () => {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};

const shouldCollapseSidebar = () => getViewportSnapshot().width < 1100;
const shouldCollapseHeader = () => getViewportSnapshot().height < 760;
const isCompactWidth = () => getViewportSnapshot().width < 960;
const shouldAutoCollapseHeaderWidth = () => getViewportSnapshot().width < 1280;

type RootView = 'characters' | 'apps' | 'messages' | 'broadcast' | 'settings';

interface RouteState {
  view: RootView;
  characterRef?: string | null;
  characterMode?: 'create';
  appRef?: string | null;
  settingsSection?: SettingsSection | null;
}

const SETTINGS_SECTION_IDS = new Set<SettingsSection>(SETTINGS_SECTIONS.map(section => section.id));

const slugify = (value: string) => {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'item';
};

const getCharacterSlug = (character: Character) => {
  const base = character.username
    || [character.first_name, character.last_name].filter(Boolean).join('-')
    || `character-${character.id}`;
  return slugify(base);
};

const getAppSlug = (app: GameApp) => {
  const base = app.name || app.id;
  return slugify(base);
};

const REF_SEPARATOR = '--';

const encodeRef = (slug: string, id: string | number) => {
  return `${slug}${REF_SEPARATOR}${id}`;
};

const extractRefId = (ref?: string | null) => {
  if (!ref || !ref.includes(REF_SEPARATOR)) {
    return null;
  }
  const separatorIndex = ref.lastIndexOf(REF_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }
  return ref.slice(separatorIndex + REF_SEPARATOR.length) || null;
};

const stripRefSuffix = (ref: string) => {
  if (!ref.includes(REF_SEPARATOR)) {
    return ref;
  }
  return ref.slice(0, ref.lastIndexOf(REF_SEPARATOR));
};

const getCharacterRouteSegment = (character: Character) => {
  return encodeRef(getCharacterSlug(character), character.id);
};

const getAppRouteSegment = (app: GameApp) => {
  return encodeRef(getAppSlug(app), app.id);
};

const parseRoute = (pathname: string, hash: string): RouteState => {
  const segments = pathname.split('/').filter(Boolean);
  const normalizedHash = hash ? hash.replace(/^#/, '').trim() : '';
  const hashRef = normalizedHash || null;

  if (segments.length === 0) {
    return hashRef ? { view: 'characters', characterRef: hashRef } : { view: 'characters' };
  }

  const [section, maybeRef] = segments;

  switch (section) {
    case 'characters': {
      if (maybeRef === 'new') {
        return { view: 'characters', characterMode: 'create' };
      }
      if (maybeRef) {
        return { view: 'characters', characterRef: decodeURIComponent(maybeRef) };
      }
      if (hashRef) {
        return { view: 'characters', characterRef: hashRef };
      }
      return { view: 'characters' };
    }
    case 'apps': {
      if (maybeRef) {
        return { view: 'apps', appRef: decodeURIComponent(maybeRef) };
      }
      if (hashRef) {
        return { view: 'apps', appRef: hashRef };
      }
      return { view: 'apps' };
    }
    case 'messages':
      return { view: 'messages' };
    case 'broadcast':
      return { view: 'broadcast' };
    case 'settings': {
      if (maybeRef && SETTINGS_SECTION_IDS.has(maybeRef as SettingsSection)) {
        return { view: 'settings', settingsSection: maybeRef as SettingsSection };
      }
      return { view: 'settings' };
    }
    default:
      return hashRef ? { view: 'characters', characterRef: hashRef } : { view: 'characters' };
  }
};

const findCharacterIdFromRef = (characters: Character[], ref?: string | null) => {
  if (!ref) {
    return null;
  }
  const suffixId = extractRefId(ref);
  if (suffixId) {
    const numericSuffix = Number(suffixId);
    if (Number.isFinite(numericSuffix) && characters.some(character => character.id === numericSuffix)) {
      return numericSuffix;
    }
  }
  const numericId = Number(ref);
  if (Number.isFinite(numericId)) {
    const exists = characters.some(character => character.id === numericId);
    if (exists) {
      return numericId;
    }
  }
  const normalizedRef = slugify(stripRefSuffix(ref));
  const match = characters.find(character => getCharacterSlug(character) === normalizedRef);
  return match ? match.id : null;
};

const findAppIdFromRef = (apps: GameApp[], ref?: string | null) => {
  if (!ref) {
    return null;
  }
  const suffixId = extractRefId(ref);
  if (suffixId) {
    const matchBySuffix = apps.find(app => app.id === suffixId);
    if (matchBySuffix) {
      return matchBySuffix.id;
    }
  }
  const matchById = apps.find(app => app.id === ref);
  if (matchById) {
    return matchById.id;
  }
  const normalizedRef = slugify(stripRefSuffix(ref));
  const matchBySlug = apps.find(app => getAppSlug(app) === normalizedRef);
  return matchBySlug ? matchBySlug.id : null;
};

const matchesCharacterRef = (character: Character, ref?: string | null) => {
  if (!ref) {
    return false;
  }
  if (String(character.id) === ref) {
    return true;
  }
  const suffixId = extractRefId(ref);
  if (suffixId && Number(suffixId) === character.id) {
    return true;
  }
  if (ref === getCharacterRouteSegment(character)) {
    return true;
  }
  return getCharacterSlug(character) === slugify(stripRefSuffix(ref));
};

const matchesAppRef = (app: GameApp, ref?: string | null) => {
  if (!ref) {
    return false;
  }
  if (app.id === ref) {
    return true;
  }
  const suffixId = extractRefId(ref);
  if (suffixId && suffixId === app.id) {
    return true;
  }
  if (ref === getAppRouteSegment(app)) {
    return true;
  }
  return getAppSlug(app) === slugify(stripRefSuffix(ref));
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [apps, setApps] = useState<GameApp[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameTime, setGameTime] = useState<GameTimeState>({
    era: 0,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    is_paused: true,
    real_time_ref: Date.now()
  });
  const [isConnected, setIsConnected] = useState(false);
  const [terminalNotifications, setTerminalNotifications] = useState<TerminalCommandNotification[]>([]);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(() => shouldCollapseHeader() || isCompactWidth() || shouldAutoCollapseHeaderWidth());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => shouldCollapseSidebar());
  const [isCompactViewport, setIsCompactViewport] = useState(() => isCompactWidth());
  const [isClockPanelExpanded, setIsClockPanelExpanded] = useState(false);
  const [isClockActionPending, setIsClockActionPending] = useState(false);
  const routeState = useMemo(() => parseRoute(location.pathname, location.hash), [location]);
  const currentView = routeState.view;
  const activeSettingsSection = routeState.settingsSection ?? null;
  const selectedCharacterId = useMemo(() => (
    routeState.view === 'characters'
      ? findCharacterIdFromRef(characters, routeState.characterRef)
      : null
  ), [characters, routeState]);
  const selectedAppId = useMemo(() => (
    routeState.view === 'apps'
      ? findAppIdFromRef(apps, routeState.appRef)
      : null
  ), [apps, routeState]);
  const isCreatingCharacterRoute = routeState.view === 'characters' && routeState.characterMode === 'create';
  const selectedCharacter = selectedCharacterId != null
    ? characters.find(character => character.id === selectedCharacterId) || null
    : null;
  const selectedApp = selectedAppId
    ? apps.find(app => app.id === selectedAppId) || null
    : null;
  const hasPendingCharacterSelection = currentView === 'characters'
    && Boolean(routeState.characterRef && !selectedCharacter && !isCreatingCharacterRoute);
  const hasPendingAppSelection = currentView === 'apps'
    && Boolean(routeState.appRef && !selectedApp);
  const backendEndpoint = window.location.origin;
  const currentSelectionKey = useMemo(() => {
    if (currentView === 'characters') {
      if (isCreatingCharacterRoute) {
        return 'create';
      }
      return routeState.characterRef ?? 'root';
    }
    if (currentView === 'apps') {
      return routeState.appRef ?? 'root';
    }
    if (currentView === 'settings') {
      return routeState.settingsSection ?? 'overview';
    }
    return 'root';
  }, [currentView, isCreatingCharacterRoute, routeState]);
  const panelTransitionKey = `${currentView}-${currentSelectionKey || 'root'}`;
  const viewAnimationKey = currentView === 'characters' ? currentView : panelTransitionKey;
  const characterDetailTransitionKey = currentView === 'characters' ? (currentSelectionKey ?? 'root') : null;
  const contentBodyRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const glimmerRef = useRef<HTMLDivElement | null>(null);
  const appsRef = useRef<GameApp[]>([]);
  const routeStateRef = useRef(routeState);
  const snoozedNotifications = useRef<Set<string>>(new Set());
  const headerOverrideRef = useRef(false);
  const sidebarOverrideRef = useRef(false);
  const viewportSnapshotRef = useRef(getViewportSnapshot());
  const forceCollapsedHeader = isCompactViewport || viewportSnapshotRef.current.width < 1280;

  const collapseSidebarForAction = useCallback(() => {
    if (!isCompactViewport) {
      return;
    }
    sidebarOverrideRef.current = true;
    setIsSidebarCollapsed(true);
  }, [isCompactViewport]);

  const handleSidebarToggle = () => {
    sidebarOverrideRef.current = true;
    setIsSidebarCollapsed(prev => !prev);
  };

  const handleSidebarClose = useCallback(() => {
    sidebarOverrideRef.current = true;
    setIsSidebarCollapsed(true);
  }, []);

  const handleHeaderToggle = () => {
    if (forceCollapsedHeader) {
      return;
    }
    headerOverrideRef.current = true;
    setIsHeaderCollapsed(prev => !prev);
  };

  const handleClockPanelToggle = () => {
    setIsClockPanelExpanded(prev => !prev);
  };

  const handleCollapsedClockPauseToggle = async () => {
    if (isClockActionPending) {
      return;
    }
    setIsClockActionPending(true);
    try {
      const response = gameTime.is_paused ? await gameTimeApi.resume() : await gameTimeApi.pause();
      setGameTime(response.data);
    } catch (error) {
      console.error('Failed to toggle game clock:', error);
      alert('Failed to update game clock.');
    } finally {
      setIsClockActionPending(false);
    }
  };

  const setRespondingState = (id: string, active: boolean) => {
    setRespondingIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const sortApps = useCallback((list: GameApp[]) => {
    return [...list].sort((a, b) => {
      const aOrder = typeof a.order_index === 'number' ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order_index === 'number' ? b.order_index : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }, []);

  const applyOrderedIds = useCallback((list: GameApp[], orderedIds: string[]) => {
    if (list.length === 0) {
      return list;
    }

    const map = new Map(list.map(app => [app.id, app]));
    const seen = new Set<string>();
    const ordered: GameApp[] = [];

    orderedIds.forEach((id, index) => {
      if (seen.has(id)) return;
      const app = map.get(id);
      if (!app) return;
      seen.add(id);
      ordered.push({ ...app, order_index: index });
    });

    const startIndex = ordered.length;
    const remainder = list
      .filter(app => !seen.has(app.id))
      .map((app, idx) => ({ ...app, order_index: startIndex + idx }));

    return sortApps([...ordered, ...remainder]);
  }, [sortApps]);

  // Setup WebSocket connection
  useEffect(() => {
    const socket = socketService.connect();

    socket.on('connect', () => {
      setIsConnected(true);
      socketService.requestSync();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for real-time updates
    socketService.on(SocketEvent.SYNC_RESPONSE, (payload) => {
      if (payload.data?.characters) {
        setCharacters(payload.data.characters);
      }
      if (payload.data?.apps) {
        setApps(sortApps(payload.data.apps));
      }
      if (payload.data?.messages) {
        setMessages(payload.data.messages);
      }
      if (payload.data?.gameTime) {
        setGameTime(payload.data.gameTime);
      }
    });

    socketService.on(SocketEvent.CHARACTER_CREATED, (payload) => {
      setCharacters(prev => [...prev, payload.data]);
    });

    socketService.on(SocketEvent.CHARACTER_UPDATED, (payload) => {
      setCharacters(prev =>
        prev.map(c => c.id === payload.data.id ? payload.data : c)
      );
    });

    socketService.on(SocketEvent.CHARACTER_DELETED, (payload) => {
      setCharacters(prev => prev.filter(c => c.id !== payload.data.id));
      const latestRoute = routeStateRef.current;
      if (latestRoute.view === 'characters' && matchesCharacterRef(payload.data, latestRoute.characterRef)) {
        navigate('/characters', { replace: true });
      }
    });

    socketService.on(SocketEvent.CHARACTER_APP_CHANGED, (payload) => {
      setCharacters(prev =>
        prev.map(c => c.id === payload.data.characterId ? payload.data.character : c)
      );
    });

    socketService.on(SocketEvent.CHARACTER_ACTIVITY_UPDATED, (payload) => {
      setCharacters(prev =>
        prev.map(c => c.id === payload.data.characterId ? payload.data.character : c)
      );
    });

    socketService.on(SocketEvent.VISUAL_EFFECTS_CHANGED, (payload) => {
      setCharacters(prev =>
        prev.map(c => c.id === payload.data.characterId ? {
          ...c,
          visual_effects: payload.data.visual_effects
        } : c)
      );
    });

    socketService.on(SocketEvent.APP_CREATED, (payload) => {
      setApps(prev => sortApps([...prev, payload.data]));
    });

    socketService.on(SocketEvent.APP_UPDATED, (payload) => {
      setApps(prev => sortApps(
        prev.map(a => a.id === payload.data.id ? payload.data : a)
      ));
    });

    socketService.on(SocketEvent.APP_DELETED, (payload) => {
      setApps(prev => sortApps(prev.filter(a => a.id !== payload.data.id)));
      const latestRoute = routeStateRef.current;
      if (latestRoute.view === 'apps' && matchesAppRef(payload.data, latestRoute.appRef)) {
        navigate('/apps', { replace: true });
      }
    });

    // Game time events
    socketService.on(SocketEvent.GAME_TIME_UPDATED, (payload) => {
      setGameTime(payload.data);
    });

    socketService.on(SocketEvent.GAME_TIME_PAUSED, (payload) => {
      setGameTime(payload.data);
    });

    socketService.on(SocketEvent.GAME_TIME_RESUMED, (payload) => {
      setGameTime(payload.data);
    });

    // Message events
    socketService.on(SocketEvent.MESSAGE_CREATED, (payload) => {
      setMessages(prev => [...prev, payload.data]);
    });

    socketService.on(SocketEvent.MESSAGE_UPDATED, (payload) => {
      setMessages(prev =>
        prev.map(m => m.id === payload.data.id ? payload.data : m)
      );
    });

    socketService.on(SocketEvent.MESSAGE_DELETED, (payload) => {
      setMessages(prev => prev.filter(m => m.id !== payload.data.id));
    });

    socketService.on(SocketEvent.MESSAGE_READ_STATUS_CHANGED, (payload) => {
      const { messageId, username, is_read } = payload.data;
      setMessages(prev =>
        prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              read_status: {
                ...m.read_status,
                [username]: is_read
              }
            };
          }
          return m;
        })
      );
    });

    const handleTerminalQueued = (payload: any) => {
      const { appId, execution } = payload.data || {};
      if (!appId || !execution) {
        return;
      }

      setTerminalNotifications((prev) => {
        if (prev.some((note) => note.id === execution.id)) {
          return prev;
        }
        snoozedNotifications.current.delete(execution.id);
        const matchingApp = appsRef.current.find((app) => app.id === appId);
        return [
          ...prev,
          {
            id: execution.id,
            appId,
            appName: matchingApp?.name || 'Terminal',
            execution,
            receivedAt: Date.now(),
            draftResponse: ''
          }
        ];
      });
    };

    const handleTerminalCleared = (payload: any) => {
      const executionId = payload.data?.execution?.id || payload.data?.executionId;
      if (!executionId) return;
      snoozedNotifications.current.delete(executionId);
      setTerminalNotifications((prev) => prev.filter((note) => note.id !== executionId));
    };

    socketService.on(SocketEvent.TERMINAL_COMMAND_QUEUED, handleTerminalQueued);
    socketService.on(SocketEvent.TERMINAL_COMMAND_EXECUTED, handleTerminalCleared);
    socketService.on(SocketEvent.TERMINAL_COMMAND_RESPONDED, handleTerminalCleared);

    return () => {
      socketService.disconnect();
    };
  }, []); // Only connect/disconnect on mount/unmount

  const handleDeleteCharacter = async (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await charactersApi.delete(id);
      if (routeState.view === 'characters' && selectedCharacterId === id) {
        navigate('/characters');
      }
    } catch (error) {
      console.error('Failed to delete character:', error);
      alert('Failed to delete user');
    }
  };

  const handleDeleteApp = async (id: string) => {
    const appName = apps.find(app => app.id === id)?.name || 'this app';
    if (!confirm(`Delete "${appName}"?`)) return;
    try {
      await appsApi.delete(id);
      if (routeState.view === 'apps' && selectedAppId === id) {
        navigate('/apps');
      }
    } catch (error) {
      console.error('Failed to delete app:', error);
      alert('Failed to delete app');
    }
  };

  const handleReorderApps = useCallback(async (orderedIds: string[]) => {
    setApps(prev => applyOrderedIds(prev, orderedIds));
    try {
      await appsApi.reorder(orderedIds);
    } catch (error) {
      console.error('Failed to reorder apps:', error);
      socketService.requestSync();
    }
  }, [applyOrderedIds]);

  const handleSelectCharacter = (character: Character) => {
    navigate(`/characters/${getCharacterRouteSegment(character)}`);
  };

  const handleSelectApp = (app: GameApp) => {
    collapseSidebarForAction();
    navigate(`/apps/${getAppRouteSegment(app)}`);
  };

  const handleBackToAppList = () => {
    navigate('/apps');
  };

  const handleBackToCharacterList = () => {
    navigate('/characters');
  };

  const handleViewChange = (view: 'characters' | 'apps' | 'messages' | 'broadcast' | 'settings') => {
    collapseSidebarForAction();
    switch (view) {
      case 'characters':
        navigate('/characters');
        break;
      case 'apps':
        navigate('/apps');
        break;
      case 'messages':
        navigate('/messages');
        break;
      case 'broadcast':
        navigate('/broadcast');
        break;
      case 'settings':
        navigate('/settings');
        break;
      default:
        navigate('/characters');
    }
  };

  const handleSettingsSectionSelect = (section: SettingsSection | null) => {
    if (!section) {
      navigate('/settings');
      return;
    }
    navigate(`/settings/${section}`);
  };

  const handleAddCharacter = () => {
    navigate('/characters/new');
  };

  const handleNotificationDraftChange = (id: string, value: string) => {
    setTerminalNotifications((prev) =>
      prev.map((note) => (note.id === id ? { ...note, draftResponse: value } : note))
    );
  };

  const handleCreateApp = useCallback(async ({ name, category }: { name: string; category: AppCategory }) => {
    try {
      await appsApi.create({
        name,
        category,
        allowed_users: []
      });
    } catch (error) {
      console.error('Failed to create app:', error);
      throw error;
    }
  }, []);

  const handleCharacterFormSuccess = (character?: Character) => {
    if (character) {
      navigate(`/characters/${getCharacterRouteSegment(character)}`);
      return;
    }
    navigate('/characters');
  };

  const handleCancelCharacterCreate = () => {
    navigate('/characters');
  };

  const handleDeleteMessage = async (id: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await messagesApi.delete(id);
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message');
    }
  };

  const resolveTerminalNotification = async (
    notification: TerminalCommandNotification,
    status: 'approved' | 'rejected',
    responseText: string
  ) => {
    const targetApp = appsRef.current.find(
      (app) => app.id === notification.appId && app.category === AppCategory.TERMINAL
    );

    if (!targetApp) {
      alert('Terminal app is no longer available.');
      return;
    }

    const terminalData = cloneTerminalData(targetApp.data);
    const executionIndex = terminalData.executionHistory.findIndex(
      (execution) => execution.id === notification.execution.id
    );

    if (executionIndex === -1) {
      alert('This command has already been resolved.');
      snoozedNotifications.current.delete(notification.id);
      setTerminalNotifications((prev) => prev.filter((note) => note.id !== notification.id));
      return;
    }

    terminalData.executionHistory[executionIndex] = {
      ...terminalData.executionHistory[executionIndex],
      status,
      response: responseText
    };

    setRespondingState(notification.id, true);

    try {
      await appsApi.update(notification.appId, { data: terminalData });
      setApps((prev) =>
        prev.map((app) => (app.id === notification.appId ? { ...app, data: terminalData } : app))
      );
      snoozedNotifications.current.delete(notification.id);
      setTerminalNotifications((prev) => prev.filter((note) => note.id !== notification.id));
    } catch (error) {
      console.error('Failed to resolve terminal command', error);
      alert('Failed to update terminal command. Please try again.');
    } finally {
      setRespondingState(notification.id, false);
    }
  };

  const handleNotificationRespond = async (notification: TerminalCommandNotification) => {
    const responseText = (notification.draftResponse || '').trim();
    if (!responseText) {
      alert('Enter a response before sending.');
      return;
    }

    await resolveTerminalNotification(notification, 'approved', responseText);
  };

  const handleNotificationReject = async (notification: TerminalCommandNotification) => {
    const responseText = (notification.draftResponse || '').trim() || 'Unable to process this command right now.';
    await resolveTerminalNotification(notification, 'rejected', responseText);
  };

  const handleNotificationDismiss = (id: string) => {
    snoozedNotifications.current.add(id);
    setTerminalNotifications((prev) => prev.filter((note) => note.id !== id));
  };

  const triggerAnimation = useCallback((element: HTMLElement | null, className: string) => {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth; // force reflow so animation can restart
    element.classList.add(className);
  }, []);

  useEffect(() => {
    triggerAnimation(contentBodyRef.current, 'content-enter');
    if (currentView !== 'characters') {
      triggerAnimation(glimmerRef.current, 'glimmer-enter');
    }
  }, [viewAnimationKey, currentView, triggerAnimation]);

  useEffect(() => {
    if (currentView !== 'characters') return;
    triggerAnimation(detailPanelRef.current, 'content-enter');
  }, [characterDetailTransitionKey, currentView, triggerAnimation]);

  useEffect(() => {
    appsRef.current = apps;
  }, [apps]);

  useEffect(() => {
    routeStateRef.current = routeState;
  }, [routeState]);

  useEffect(() => {
    if (!isHeaderCollapsed) {
      setIsClockPanelExpanded(false);
    }
  }, [isHeaderCollapsed]);

  useEffect(() => {
    if (forceCollapsedHeader) {
      headerOverrideRef.current = false;
      setIsHeaderCollapsed(true);
    }
  }, [forceCollapsedHeader]);

  useEffect(() => {
    const handleResize = () => {
      const snapshot = getViewportSnapshot();
      const prev = viewportSnapshotRef.current;
      const widthDelta = Math.abs(snapshot.width - prev.width);
      const heightDelta = Math.abs(snapshot.height - prev.height);
      viewportSnapshotRef.current = snapshot;

      setIsCompactViewport(snapshot.width < 960);

      if (widthDelta > 240) {
        sidebarOverrideRef.current = false;
      }
      if (heightDelta > 180) {
        headerOverrideRef.current = false;
      }

      const widthCollapsed = snapshot.width < 960;
      const autoCollapseWidth = snapshot.width < 1280;

      if (!sidebarOverrideRef.current) {
        setIsSidebarCollapsed(snapshot.width < 1100);
      }

      if (widthCollapsed) {
        setIsHeaderCollapsed(true);
        headerOverrideRef.current = false;
      } else if (!headerOverrideRef.current) {
        if (autoCollapseWidth) {
          setIsHeaderCollapsed(true);
        } else {
          setIsHeaderCollapsed(snapshot.height < 760);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showSidebarOverlay = !isSidebarCollapsed && isCompactViewport;
  const appClassName = [
    'app',
    isHeaderCollapsed ? 'header-condensed' : 'header-expanded',
    isSidebarCollapsed ? 'sidebar-hidden' : 'sidebar-open',
    isCompactViewport ? 'viewport-compact' : 'viewport-wide',
    showSidebarOverlay ? 'sidebar-overlay-active' : ''
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!showSidebarOverlay) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleSidebarClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSidebarOverlay, handleSidebarClose]);

  useEffect(() => {
    const pendingFromApps: TerminalCommandNotification[] = [];
    const pendingIds = new Set<string>();

    apps.forEach((app) => {
      if (app.category !== AppCategory.TERMINAL) {
        return;
      }

      const data = app.data as TerminalAppData | undefined;
      const executionHistory = Array.isArray(data?.executionHistory) ? data.executionHistory : [];

      executionHistory
        .filter((execution) => execution.status === 'pending')
        .forEach((execution) => {
          pendingIds.add(execution.id);
          pendingFromApps.push({
            id: execution.id,
            appId: app.id,
            appName: app.name,
            execution,
            receivedAt: new Date(execution.timestamp).getTime(),
            draftResponse: ''
          });
        });
    });

    setTerminalNotifications((prev) => {
      const nextMap = new Map<string, TerminalCommandNotification>();
      let changed = false;

      prev.forEach((note) => {
        if (!pendingIds.has(note.id)) {
          changed = true;
          return;
        }
        nextMap.set(note.id, note);
      });

      pendingFromApps.forEach((note) => {
        if (snoozedNotifications.current.has(note.id) || nextMap.has(note.id)) {
          return;
        }
        nextMap.set(note.id, note);
        changed = true;
      });

      if (!changed) {
        return prev;
      }

      return Array.from(nextMap.values()).sort((a, b) => a.receivedAt - b.receivedAt);
    });
  }, [apps]);

  const renderActivePanel = () => {
    if (currentView === 'characters') {
      return (
        <div className="character-hub">
          <div className="app-surface character-column roster-column">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Roster</p>
                <h2>Users</h2>
              </div>
              <span className="count-pill">{characters.length}</span>
            </div>
            <CharacterList
              characters={characters}
              apps={apps}
              selectedId={selectedCharacterId}
              onSelect={handleSelectCharacter}
              onDelete={handleDeleteCharacter}
              onCreate={handleAddCharacter}
              isCreating={isCreatingCharacterRoute}
            />
          </div>

          <div className="app-surface character-column detail-column">
            <div className="detail-panel-shell" ref={detailPanelRef}>
              {isCreatingCharacterRoute ? (
                <CharacterForm
                  onSuccess={handleCharacterFormSuccess}
                  onClose={handleCancelCharacterCreate}
                />
              ) : selectedCharacter ? (
                <CharacterDetail
                  character={selectedCharacter}
                  onBack={handleBackToCharacterList}
                  onDelete={handleDeleteCharacter}
                  showBackButton={false}
                />
              ) : (
                <div className="empty-detail-state">
                  <p className="eyebrow">Details</p>
                  <h3>
                    {hasPendingCharacterSelection
                      ? 'Syncing profile…'
                      : 'Select a user to inspect'}
                  </h3>
                  <p>
                    {hasPendingCharacterSelection
                      ? 'We are waiting for the latest data from the server.'
                      : 'Choose someone from the roster or create a fresh operative.'}
                  </p>
                  {hasPendingCharacterSelection && (
                    <button className="ghost-btn" onClick={handleBackToCharacterList}>
                      Clear Selection
                    </button>
                  )}
                  {!hasPendingCharacterSelection && (
                    <button className="ghost-btn" onClick={handleAddCharacter}>
                      Create User
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (currentView === 'apps') {
      if (selectedApp) {
        switch (selectedApp.category) {
          case 'Text':
            return (
              <TextApp
                app={selectedApp}
                characters={characters}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'Telemetry':
            return (
              <TelemetryApp
                app={selectedApp}
                characters={characters}
                currentGameTime={gameTime}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'Logbook':
            return (
              <LogbookApp
                app={selectedApp}
                characters={characters}
                currentGameTime={gameTime}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'Image':
            return (
              <ImageApp
                app={selectedApp}
                characters={characters}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'Map':
            return (
              <MapApp
                app={selectedApp}
                characters={characters}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'Terminal':
            return (
              <TerminalApp
                app={selectedApp}
                characters={characters}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          case 'AI_Chat':
            return (
              <LLMChatApp
                app={selectedApp}
                characters={characters}
                onBack={handleBackToAppList}
                onDelete={handleDeleteApp}
              />
            );
          default:
            return <div>Unknown app category: {selectedApp.category}</div>;
        }
      }

      if (hasPendingAppSelection) {
        return (
          <div className="app-surface">
            <div className="empty-detail-state">
              <p className="eyebrow">Apps</p>
              <h3>Loading selection…</h3>
              <p>We are waiting for the latest data from the server.</p>
              <button className="ghost-btn" onClick={handleBackToAppList}>
                Back to list
              </button>
            </div>
          </div>
        );
      }

      return (
        <>
          <div className="panel-header">
            <h2>Apps</h2>
          </div>
          <AppList
            apps={apps}
            characters={characters}
            onSelect={handleSelectApp}
            onDelete={handleDeleteApp}
            onReorder={handleReorderApps}
            onCreate={handleCreateApp}
          />
        </>
      );
    }

    if (currentView === 'messages') {
      return (
        <MessageHub
          messages={messages}
          characters={characters}
          currentGameTime={gameTime}
          onDeleteMessage={handleDeleteMessage}
        />
      );
    }

    if (currentView === 'broadcast') {
      return <BroadcastView characters={characters} />;
    }

    if (!activeSettingsSection) {
      return (
        <SettingsOverview onSelect={(section) => handleSettingsSectionSelect(section)} />
      );
    }

    return (
      <SettingsForm
        activeSection={activeSettingsSection}
        onSectionChange={(section) => handleSettingsSectionSelect(section)}
      />
    );
  };

  return (
    <div className={appClassName}>
      <header className={`header${isHeaderCollapsed ? ' is-collapsed' : ''}`}>
        <div className="header-layout-track">
          <div className="header-left">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={handleSidebarToggle}
              aria-controls="app-sidebar"
              aria-expanded={!isSidebarCollapsed}
            >
              {isSidebarCollapsed ? <Menu size={20} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
              <span className="sr-only">{isSidebarCollapsed ? 'Open navigation' : 'Close navigation'}</span>
            </button>
            {!isHeaderCollapsed && (
              <div className="brand-mark">
                <div className="app-logo-wrapper">
                  <img src={phosphoriteIcon} alt="" className="app-logo" />
                </div>
                <span className="brand-name">Phosphorite</span>
              </div>
            )}
          </div>
          <div className="header-center">
            {!isHeaderCollapsed ? (
              <>
                <h1 className="header-title">Game Master Dashboard</h1>
                <div className={`connection-status-card ${isConnected ? 'online' : 'offline'}`}>
                  <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
                  <span className="connection-state">{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </>
            ) : (
              <div className="header-collapsed-dock">
                <div className="brand-mark brand-compact">
                  <div className="app-logo-wrapper">
                    <img src={phosphoriteIcon} alt="" className="app-logo" />
                  </div>
                  <span className="sr-only">Phosphorite</span>
                </div>
                <ConnectionStatusOrb isConnected={isConnected} endpoint={backendEndpoint} />
                <div className="collapsed-clock-cluster">
                  <CollapsedClockDisplay gameTime={gameTime} />
                  <button
                    type="button"
                    className={`clock-action-btn ${gameTime.is_paused ? 'paused' : 'running'}`}
                    onClick={handleCollapsedClockPauseToggle}
                    disabled={!isConnected || isClockActionPending}
                    aria-label={gameTime.is_paused ? 'Resume game clock' : 'Pause game clock'}
                    title={gameTime.is_paused ? 'Resume clock' : 'Pause clock'}
                  >
                    {gameTime.is_paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="clock-toggle-btn"
                    onClick={handleClockPanelToggle}
                    aria-expanded={isClockPanelExpanded}
                  >
                    <Clock3 size={16} aria-hidden="true" />
                    <span className="sr-only">{isClockPanelExpanded ? 'Hide clock controls' : 'Show clock controls'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="header-right">
            {!isHeaderCollapsed && (
              <GameTimeBar
                gameTime={gameTime}
                isConnected={isConnected}
                onTimeUpdate={setGameTime}
              />
            )}
            {!forceCollapsedHeader && (
              <button
                type="button"
                className="header-collapse-btn"
                onClick={handleHeaderToggle}
                aria-pressed={isHeaderCollapsed}
              >
                {isHeaderCollapsed ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
                <span className="sr-only">{isHeaderCollapsed ? 'Expand header' : 'Collapse header'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {isHeaderCollapsed && isClockPanelExpanded && (
        <div className="clock-flyout" role="region" aria-label="Clock controls">
          <div className="clock-flyout-panel">
            <GameTimeBar
              variant="controls"
              lockedMode="set"
              gameTime={gameTime}
              isConnected={isConnected}
              onTimeUpdate={setGameTime}
            />
          </div>
        </div>
      )}

      <div className="main-layout">
        <aside
          id="app-sidebar"
          className={`sidebar-shell${isSidebarCollapsed ? ' collapsed' : ''}${isCompactViewport ? ' mobile' : ''}`}
          aria-hidden={isSidebarCollapsed}
        >
          <Sidebar
            apps={apps}
            currentView={currentView}
            selectedId={selectedAppId}
            onViewChange={handleViewChange}
            onSelectApp={handleSelectApp}
            onReorderApps={handleReorderApps}
            settingsSection={activeSettingsSection}
            onSelectSettingsSection={handleSettingsSectionSelect}
          />
        </aside>

        <main className="main-content">
          <section className="content-panel">
            <div className="view-glimmer" aria-hidden="true" ref={glimmerRef} />
            <div className="content-body" ref={contentBodyRef}>
              {renderActivePanel()}
            </div>
          </section>
        </main>
      </div>

      {showSidebarOverlay && (
        <button type="button" className="sidebar-overlay" onClick={handleSidebarClose} aria-label="Close navigation" />
      )}

      {terminalNotifications.length > 0 && (
        <CommandNotificationOverlay
          notifications={terminalNotifications}
          respondingIds={respondingIds}
          onDraftChange={handleNotificationDraftChange}
          onRespond={handleNotificationRespond}
          onReject={handleNotificationReject}
          onDismiss={handleNotificationDismiss}
        />
      )}
    </div>
  );
}

interface CommandNotificationOverlayProps {
  notifications: TerminalCommandNotification[];
  respondingIds: Set<string>;
  onDraftChange: (id: string, value: string) => void;
  onRespond: (notification: TerminalCommandNotification) => void;
  onReject: (notification: TerminalCommandNotification) => void;
  onDismiss: (id: string) => void;
}

function CommandNotificationOverlay({ notifications, respondingIds, onDraftChange, onRespond, onReject, onDismiss }: CommandNotificationOverlayProps) {
  const pendingLabel = notifications.length === 1 ? '1 pending command' : `${notifications.length} pending commands`;

  return (
    <div className="terminal-notification-overlay" role="dialog" aria-modal="true">
      <div className="terminal-notification-panel">
        <header className="terminal-notification-header">
          <p className="eyebrow">Terminal Queue</p>
          <h3>{pendingLabel}</h3>
          <p>Players are waiting on these commands. Type a response below or dismiss to handle it later.</p>
        </header>
        <div className="terminal-notification-list">
          {notifications.map((notification) => (
            <article key={notification.id} className="terminal-notification-card">
              <div className="terminal-notification-meta">
                <span className="terminal-notification-user">{notification.execution.username}</span>
                <span className="terminal-notification-app">{notification.appName}</span>
                <span className="terminal-notification-time">
                  {new Date(notification.execution.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <pre className="terminal-notification-command">
                {notification.execution.input}
              </pre>
              <textarea
                className="terminal-notification-input"
                placeholder="Type the response players will see"
                value={notification.draftResponse ?? ''}
                onChange={(event) => onDraftChange(notification.id, event.target.value)}
              />
              <div className="terminal-notification-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => onRespond(notification)}
                  disabled={respondingIds.has(notification.id) || !((notification.draftResponse || '').trim())}
                >
                  {respondingIds.has(notification.id) ? 'Sending…' : 'Send response'}
                </button>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => onReject(notification)}
                  disabled={respondingIds.has(notification.id)}
                >
                  {respondingIds.has(notification.id) ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onDismiss(notification.id)}
                  disabled={respondingIds.has(notification.id)}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CollapsedClockDisplayProps {
  gameTime: GameTimeState;
}

function CollapsedClockDisplay({ gameTime }: CollapsedClockDisplayProps) {
  const { displayTime, tickPulse } = useGameClock(gameTime);
  const renderDigit = (value: number) => value.toString().padStart(2, '0');
  const statusClass = gameTime.is_paused ? 'paused' : 'running';

  return (
    <div className={`collapsed-clock-chip ${statusClass}`}>
      <div className="collapsed-clock-meta">
        <span>Era {displayTime.era}</span>
        <span>Day {displayTime.day}</span>
      </div>
      <span className={`collapsed-clock-time time-digits ${tickPulse} ${statusClass}`}>
        {renderDigit(displayTime.hour)}:{renderDigit(displayTime.minute)}:{renderDigit(displayTime.second)}
      </span>
    </div>
  );
}

interface ConnectionStatusOrbProps {
  isConnected: boolean;
  endpoint: string;
}

function ConnectionStatusOrb({ isConnected, endpoint }: ConnectionStatusOrbProps) {
  const statusLabel = isConnected ? 'Connected' : 'Disconnected';
  return (
    <div
      className={`connection-orb ${isConnected ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
      title={`${statusLabel} to ${endpoint}`}
    >
      <span className="connection-orb-core" aria-hidden="true" />
      <span className="sr-only">{`${statusLabel} to ${endpoint}`}</span>
    </div>
  );
}

export default App;
