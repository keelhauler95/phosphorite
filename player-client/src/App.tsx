import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, type CSSProperties } from 'react';
import Scanlines from './components/Scanlines';
import LoginScreen from './components/LoginScreen';
import MainMenu from './components/MainMenu';
import GameHeader from './components/GameHeader';
import ComposeMessage from './components/ComposeMessage';
import Teletype from './components/Teletype';
import ImageApp from './components/ImageApp';
import PlayerMapApp from './components/MapApp';
import LogbookApp from './components/LogbookApp';
import TelemetryApp from './components/TelemetryApp';
import TerminalApp from './components/TerminalApp';
import LLMChatApp from './components/LLMChatApp';
import BroadcastDisplay from './components/BroadcastDisplay';
import { 
  BrokenScreen, 
  CorruptedText, 
  BloodyScreen, 
  GlitchEffect, 
  StaticNoise, 
  ScreenFlicker 
} from './components/VisualEffects';
import { Character, GameApp, Message, SocketEvent, GameTimeState, Broadcast, VisualEffect, PlayerThemeSettings } from './types';
import { messagesApi, settingsApi } from './services/api';
import { socketService } from './services/socket';
import { DEFAULT_PLAYER_THEME, applyPlayerTheme, parsePlayerTheme, ThemeInput } from './utils/theme';
import './App.scss';

type AppState = 'login' | 'menu' | 'app' | 'mail_menu' | 'inbox' | 'sent' | 'compose' | 'message';

const PRESET_ALIAS: Record<string, string> = {
  'satellite-blue': 'phosphor',
  'silicon-glass': 'silicon',
  'verdant-signal': 'sulfur',
  'furnace-amber': 'neon',
  'sulfur-warning': 'sulfur',
  'neon-dream': 'neon',
  'osmium-vein': 'osmium',
  'chlorine': 'sulfur'
};

const normalizePresetId = (value?: string | null) => {
  if (!value) return 'custom';
  const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return 'custom';
  return PRESET_ALIAS[slug] || slug;
};

const clampValue = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const BASE_VIEWPORT_WIDTH = 1920;
const pxToViewportWidth = (value: number) => `${((value / BASE_VIEWPORT_WIDTH) * 100).toFixed(4)}vw`;

type EmberStyle = CSSProperties & Record<string, string>;

type EmberParticle = {
  id: string;
  style: EmberStyle;
};

function App() {
  const [state, setState] = useState<AppState>('login');
  const [character, setCharacter] = useState<Character | null>(null);
  const [apps, setApps] = useState<GameApp[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  const [selectedApp, setSelectedApp] = useState<GameApp | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [previousMailView, setPreviousMailView] = useState<'inbox' | 'sent'>('inbox');
  const [gameTime, setGameTime] = useState<GameTimeState | null>(null);
  const [headerText, setHeaderText] = useState<string>('PHOSPHORITE');
  const [loginText, setLoginText] = useState<string>('WELCOME TO THE PHOSPHORITE TERMINAL');
  const [showUnreadBadge, setShowUnreadBadge] = useState(false);
  const [renderMessageList, setRenderMessageList] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<Broadcast | null>(null);
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [themeEffects, setThemeEffects] = useState<PlayerThemeSettings['effects']>(DEFAULT_PLAYER_THEME.effects);
  const [playerTheme, setPlayerTheme] = useState<PlayerThemeSettings>(DEFAULT_PLAYER_THEME);
  const [themePresetId, setThemePresetId] = useState<string>(normalizePresetId(DEFAULT_PLAYER_THEME.presetId));
  const [composePrefill, setComposePrefill] = useState<{ recipients: string[]; subject: string } | null>(null);
  const [imageFitMode, setImageFitMode] = useState<'height' | 'width'>('height');
  const commsEnabled = character?.can_access_messages ?? true;
  const lastActivitySignature = useRef<string | null>(null);
  const boundCharacterIdRef = useRef<number | null>(null);

  const resetClientView = useCallback((options?: { preserveSystemMessage?: boolean }) => {
    setCharacter(null);
    setApps([]);
    setMessages([]);
    setSentMessages([]);
    setSelectedApp(null);
    setSelectedMessage(null);
    setPreviousMailView('inbox');
    setGameTime(null);
    setShowUnreadBadge(false);
    setRenderMessageList(false);
    setActiveBroadcast(null);
    setVisualEffects([]);
    setComposePrefill(null);
    lastActivitySignature.current = null;
    boundCharacterIdRef.current = null;
    if (!options?.preserveSystemMessage) {
      setSystemMessage(null);
    }
    setState('login');
  }, []);

  const unbindSession = useCallback((options?: { suppressDisconnectActivity?: boolean }) => {
    if (!boundCharacterIdRef.current) {
      return;
    }

    socketService.emit(SocketEvent.PLAYER_SESSION_UNBIND, {
      characterId: boundCharacterIdRef.current,
      suppressDisconnectActivity: Boolean(options?.suppressDisconnectActivity)
    });

    boundCharacterIdRef.current = null;
  }, []);

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

  const applyThemeFromPayload = useCallback((raw?: ThemeInput) => {
    const parsedTheme = parsePlayerTheme(raw);
    applyPlayerTheme(parsedTheme);
    setThemeEffects(parsedTheme.effects);
    setThemePresetId(normalizePresetId(parsedTheme.presetId));
    setPlayerTheme(parsedTheme);
  }, []);

  const emberParticles = useMemo<EmberParticle[]>(() => {
    if (!themeEffects.embers) {
      return [];
    }

    const settings = playerTheme.effectSettings.embers;
    const density = clampValue(settings.density, 12, 72);
    const driftSpeed = clampValue(settings.driftSpeed, 0.25, 4);
    const glow = clampValue(settings.glow, 0, 1);
    const swaySpeed = clampValue(settings.swaySpeed, 2, 14);
    const swayAmount = clampValue(settings.swayAmount, 6, 140);
    const particleCount = Math.min(90, Math.max(18, Math.round(density * 1.4)));

    const makeRand = (seed: number) => (offset: number) => {
      const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    return Array.from({ length: particleCount }).map((_, index) => {
      const seed = (index + 1) * 0.73 + density * 0.13;
      const rand = makeRand(seed);
      const duration = (12 + rand(0.5) * 10) / driftSpeed;
      const delay = -rand(0.6) * 10 / driftSpeed;
      const scale = 0.5 + rand(0.3) * 1.1;
      const opacity = 0.25 + glow * (0.4 + rand(0.4) * 0.6);
      const drift = rand(0.2) * 180 - 90;
      const blur = rand(0.9) * 0.6;
      const left = rand(0.1) * 100;
      const swayRange = swayAmount * (0.35 + rand(0.5));
      const swayDuration = Math.max(2.5, swaySpeed * (0.65 + rand(0.55)));
      const swayDelay = -rand(0.85) * swayDuration;
      const hoverLow = -16 - rand(0.85) * 40;
      const hoverHigh = hoverLow - (8 + rand(0.7) * 22);

      const style: EmberStyle = {
        left: `${left.toFixed(2)}%`,
        '--ember-scale': scale.toFixed(2),
        '--ember-opacity': opacity.toFixed(2),
        '--ember-drift': pxToViewportWidth(drift),
        '--ember-duration': `${duration.toFixed(2)}s`,
        '--ember-delay': `${delay.toFixed(2)}s`,
        '--ember-blur': blur.toFixed(2),
        '--ember-sway-range': pxToViewportWidth(swayRange),
        '--ember-sway-duration': `${swayDuration.toFixed(2)}s`,
        '--ember-sway-delay': `${swayDelay.toFixed(2)}s`,
        '--ember-hover-low': `${hoverLow.toFixed(2)}vh`,
        '--ember-hover-high': `${hoverHigh.toFixed(2)}vh`
      };

      return { id: `ember-${index}`, style };
    });
  }, [playerTheme.effectSettings.embers, themeEffects.embers]);

  const terminalClassName = useMemo(() => {
    const classes = ['phosphor-terminal', `preset-${themePresetId}`];
    if (themeEffects.chromaticAberration) {
      classes.push('chromatic-enabled');
    }
    return classes.join(' ');
  }, [themeEffects.chromaticAberration, themePresetId]);

  // Load settings on app mount and set up global socket listeners (before login)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await settingsApi.getAll();
        if (settings.headerText) setHeaderText(settings.headerText);
        if (settings.loginText) setLoginText(settings.loginText);
        applyThemeFromPayload(settings.playerTheme);
      } catch (error) {
        console.error('Failed to load settings:', error);
        applyThemeFromPayload(undefined);
      }
    };
    loadSettings();

    // Connect to socket and listen for settings updates globally
    socketService.connect();

    // Settings updated - update header and login text immediately (works before login too)
    const unsubscribeSettingUpdated = socketService.on(SocketEvent.SETTING_UPDATED, (payload: any) => {
      const { key, value } = payload.data || payload;
      if (key === 'headerText') {
        setHeaderText(value);
      } else if (key === 'loginText') {
        setLoginText(value);
      } else if (key === 'playerTheme') {
        applyThemeFromPayload(value);
      }
    });

    return () => {
      unsubscribeSettingUpdated();
    };
  }, [applyThemeFromPayload]);

  // Set up game time WebSocket listeners (separate from app listeners to avoid re-subscription)
  useEffect(() => {
    if (!character) return;

    socketService.connect();

    // Game time event handlers
    const unsubscribeGameTimeUpdated = socketService.on(SocketEvent.GAME_TIME_UPDATED, (payload: any) => {
      const updatedTime = payload.data || payload;
      if (updatedTime && typeof updatedTime === 'object') {
        setGameTime(updatedTime as GameTimeState);
      }
    });

    const unsubscribeGameTimePaused = socketService.on(SocketEvent.GAME_TIME_PAUSED, (payload: any) => {
      const updatedTime = payload.data || payload;
      if (updatedTime && typeof updatedTime === 'object') {
        setGameTime(updatedTime as GameTimeState);
      }
    });

    const unsubscribeGameTimeResumed = socketService.on(SocketEvent.GAME_TIME_RESUMED, (payload: any) => {
      const updatedTime = payload.data || payload;
      if (updatedTime && typeof updatedTime === 'object') {
        setGameTime(updatedTime as GameTimeState);
      }
    });

    return () => {
      unsubscribeGameTimeUpdated();
      unsubscribeGameTimePaused();
      unsubscribeGameTimeResumed();
    };
  }, [character]); // Only re-run when character changes (login/logout)

  // Request full snapshot after login for apps and initial game time
  useEffect(() => {
    if (!character) return;

    socketService.connect();

    const handleSyncResponse = (payload: any) => {
      const snapshot = payload.data || payload;
      if (!snapshot || typeof snapshot !== 'object') return;

      if (snapshot.apps && Array.isArray(snapshot.apps)) {
        const allowedApps = snapshot.apps.filter((app: GameApp) =>
          app.allowed_users.includes(character.username) ||
          app.allowed_users.includes('*')
        );
        setApps(sortApps(allowedApps));
        setSelectedApp((current) => {
          if (!current) {
            return current;
          }
          const replacement = allowedApps.find((app: GameApp) => app.id === current.id);
          if (replacement) {
            return replacement;
          }
          setState((prev) => (prev === 'app' ? 'menu' : prev));
          return null;
        });
      }

      if (snapshot.characters && Array.isArray(snapshot.characters)) {
        const updatedCharacter = snapshot.characters.find((entry: Character) => entry.username === character.username);
        if (updatedCharacter) {
          setCharacter((prev) => {
            if (!prev) {
              return prev;
            }
            return { ...prev, ...updatedCharacter } as Character;
          });
          setVisualEffects(updatedCharacter.visual_effects || []);
        }
      }

      if (snapshot.messages && Array.isArray(snapshot.messages)) {
        const inboxMessages = snapshot.messages.filter((message: Message) =>
          Array.isArray(message.recipients) && message.recipients.includes(character.username)
        );
        const sent = snapshot.messages.filter((message: Message) => message.sender === character.username);
        setMessages(inboxMessages);
        setSentMessages(sent);
      }

      if (snapshot.gameTime) {
        setGameTime(snapshot.gameTime as GameTimeState);
      }

      if (snapshot.settings) {
        if (snapshot.settings.headerText) {
          setHeaderText(snapshot.settings.headerText);
        }
        if (snapshot.settings.loginText) {
          setLoginText(snapshot.settings.loginText);
        }
        if (snapshot.settings.playerTheme) {
          applyThemeFromPayload(snapshot.settings.playerTheme);
        }
      }
    };

    const unsubscribeSync = socketService.on(SocketEvent.SYNC_RESPONSE, handleSyncResponse);
    socketService.requestSync();

    return () => {
      unsubscribeSync && unsubscribeSync();
    };
  }, [character, sortApps, applyThemeFromPayload, selectedApp]);

  // Set up other WebSocket listeners
  useEffect(() => {
    if (!character) return;

    socketService.connect();

    // App created - check if player has permission
    const unsubscribeAppCreated = socketService.on(SocketEvent.APP_CREATED, (payload: any) => {
      const newApp = payload.data || payload;
      if (newApp.allowed_users.includes(character.username) || 
          newApp.allowed_users.includes('*')) {
        setApps(prevApps => {
          // Check if app already exists to avoid duplicates
          const exists = prevApps.some(a => a.id === newApp.id);
          if (exists) {
            return sortApps(prevApps);
          }
          return sortApps([...prevApps, newApp]);
        });
      }
    });

    // App updated - update if player has permission, remove if permission revoked
    const unsubscribeAppUpdated = socketService.on(SocketEvent.APP_UPDATED, (payload: any) => {
      const updatedApp = payload.data || payload;
      const hasPermission = updatedApp.allowed_users.includes(character.username) || 
                            updatedApp.allowed_users.includes('*');

      setApps(prevApps => {
        const index = prevApps.findIndex(a => a.id === updatedApp.id);
        let nextApps = prevApps;

        if (hasPermission) {
          if (index >= 0) {
            const updatedList = [...prevApps];
            updatedList[index] = updatedApp;
            nextApps = updatedList;
          } else {
            nextApps = [...prevApps, updatedApp];
          }
        } else if (index >= 0) {
          nextApps = prevApps.filter(a => a.id !== updatedApp.id);
        }

        return sortApps(nextApps);
      });

      // Update selected app if it's the one being viewed
      if (selectedApp && selectedApp.id === updatedApp.id) {
        if (hasPermission) {
          setSelectedApp(updatedApp);
        } else {
          // Permission revoked while viewing - go back to menu
          setSelectedApp(null);
          setState('menu');
        }
      }
    });

    // App deleted - remove from list
    const unsubscribeAppDeleted = socketService.on(SocketEvent.APP_DELETED, (payload: any) => {
      const appId = payload.data?.id || payload.data || payload;
      setApps(prevApps => sortApps(prevApps.filter(a => a.id !== appId)));

      if (selectedApp && selectedApp.id === appId) {
        setSelectedApp(null);
        setState('menu');
      }
    });

    // Message created - add if player is recipient and not already in list
    const unsubscribeMessageCreated = socketService.on(SocketEvent.MESSAGE_CREATED, (payload: any) => {
      const newMessage = payload.data || payload;
      if (newMessage.recipients.includes(character.username)) {
        setMessages(prevMessages => {
          // Check if message already exists to avoid duplicates
          const exists = prevMessages.some(m => m.id === newMessage.id);
          if (exists) {
            return prevMessages;
          }
          return [...prevMessages, newMessage];
        });
        // Re-trigger unread badge animation if on mail menu
        if (state === 'mail_menu') {
          setShowUnreadBadge(false);
          setTimeout(() => setShowUnreadBadge(true), 50);
        }
      }
    });

    // Message updated - update if player is recipient
    const unsubscribeMessageUpdated = socketService.on(SocketEvent.MESSAGE_UPDATED, (payload: any) => {
      const updatedMessage = payload.data || payload;
      if (updatedMessage.recipients.includes(character.username)) {
        setMessages(prevMessages => {
          const index = prevMessages.findIndex(m => m.id === updatedMessage.id);
          if (index >= 0) {
            const newMessages = [...prevMessages];
            newMessages[index] = updatedMessage;
            return newMessages;
          }
          // Don't add message if it doesn't exist - MESSAGE_CREATED handles that
          return prevMessages;
        });
      }
    });

    // Message read status changed
    const unsubscribeMessageReadStatus = socketService.on(SocketEvent.MESSAGE_READ_STATUS_CHANGED, (payload: any) => {
      const data = payload.data || payload;
      const messageId = data.messageId;
      const username = data.username;
      const isRead = data.is_read !== undefined ? data.is_read : data.isRead;
      
      if (username === character.username) {
        setMessages(prevMessages => {
          const index = prevMessages.findIndex(m => m.id === messageId);
          if (index >= 0) {
            const newMessages = [...prevMessages];
            const message = { ...newMessages[index] };
            message.read_status = {
              ...message.read_status,
              [username]: isRead
            };
            newMessages[index] = message;
            return newMessages;
          }
          return prevMessages;
        });
      }
    });

    // Message deleted - remove from list
    const unsubscribeMessageDeleted = socketService.on(SocketEvent.MESSAGE_DELETED, (payload: any) => {
      const messageId = payload.data?.id || payload.data || payload;
      setMessages(prevMessages => prevMessages.filter(m => m.id !== messageId));
    });

    // Broadcast sent - check if this character is a recipient
    const unsubscribeBroadcastSent = socketService.on(SocketEvent.BROADCAST_SENT, (payload: any) => {
      const broadcast = payload.data || payload;
      // Check if this character is in the recipients list
      if (broadcast.recipients && 
          (broadcast.recipients.includes(character.username) || broadcast.recipients.includes('*'))) {
        setActiveBroadcast(broadcast as Broadcast);
      }
    });

    // Visual effects changed - update effects for this character
    const unsubscribeVisualEffects = socketService.on(SocketEvent.VISUAL_EFFECTS_CHANGED, (payload: any) => {
      const { username, visual_effects } = payload.data || payload;
      if (username === character.username) {
        setVisualEffects(visual_effects || []);
      }
    });

    const unsubscribeCharacterUpdated = socketService.on(SocketEvent.CHARACTER_UPDATED, (payload: any) => {
      const updated = payload.data || payload;
      if (updated?.username === character.username) {
        setCharacter(prev => prev ? { ...prev, ...updated } : updated);
        if (updated.visual_effects) {
          setVisualEffects(updated.visual_effects || []);
        }
      }
    });

    return () => {
      unsubscribeAppCreated();
      unsubscribeAppUpdated();
      unsubscribeAppDeleted();
      unsubscribeMessageCreated();
      unsubscribeMessageUpdated();
      unsubscribeMessageReadStatus();
      unsubscribeMessageDeleted();
      unsubscribeBroadcastSent();
      unsubscribeVisualEffects();
      unsubscribeCharacterUpdated();
    };
  }, [character, selectedApp, sortApps]);

  // Defer message list rendering to allow header to render first
  useEffect(() => {
    if (state === 'inbox' || state === 'sent') {
      setRenderMessageList(false);
      // Use requestAnimationFrame to defer rendering until after the header paints
      const frameId = requestAnimationFrame(() => {
        setRenderMessageList(true);
      });
      return () => cancelAnimationFrame(frameId);
    } else {
      setRenderMessageList(false);
    }
  }, [state]);

  // Ensure that when transitioning between menu-like views we render already scrolled to top
  useLayoutEffect(() => {
    const scrollToTopStates = new Set(['menu', 'mail_menu', 'inbox', 'sent', 'compose', 'message']);
    if (!scrollToTopStates.has(state)) return;

    const container = document.querySelector('.terminal-content') as HTMLElement | null;
    if (!container) return;

    // Instantly set scroll to top (no animation) before paint to avoid visible jump
    container.scrollTop = 0;
  }, [state]);

  useEffect(() => {
    if (character && !commsEnabled) {
      setMessages([]);
      setSentMessages([]);
      setSelectedMessage(null);
      if (['mail_menu', 'inbox', 'sent', 'compose', 'message'].includes(state)) {
        setState('menu');
      }
    }
  }, [character, commsEnabled, state]);

  useEffect(() => {
    if (!character?.id) {
      return;
    }

    socketService.connect();
    const payload = { characterId: character.id };

    socketService.emit(SocketEvent.PLAYER_SESSION_BIND, payload);
    boundCharacterIdRef.current = character.id;

    const emitLogoutStatus = () => {
      socketService.emit(SocketEvent.PLAYER_ACTIVITY_REPORT, {
        characterId: character.id,
        current_app_id: null,
        section: 'LOGGED OUT',
        last_activity_at: new Date().toISOString()
      });
    };

    const handleBeforeUnload = () => {
      emitLogoutStatus();
      unbindSession({ suppressDisconnectActivity: true });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unbindSession();
    };
  }, [character?.id, unbindSession]);

  useEffect(() => {
    if (!character) {
      lastActivitySignature.current = null;
      return;
    }

    socketService.connect();

    const activity = (() => {
      switch (state) {
        case 'login':
          return null; // No activity before login is complete
        case 'menu':
          return { current_app_id: null, section: 'Main menu' };
        case 'mail_menu':
          return { current_app_id: null, section: 'Comms menu' };
        case 'inbox':
          return { current_app_id: null, section: 'Comms > Inbox' };
        case 'sent':
          return { current_app_id: null, section: 'Comms > Sent' };
        case 'compose':
          return { current_app_id: null, section: 'Comms > Compose' };
        case 'message': {
          if (!selectedMessage) {
            return null;
          }
          const subject = selectedMessage.subject ? ` "${selectedMessage.subject}"` : '';
          return { current_app_id: null, section: `Reading message${subject}` };
        }
        case 'app': {
          if (!selectedApp) {
            return null;
          }
          return { current_app_id: selectedApp.id, section: `${selectedApp.name}` };
        }
        default:
          return null;
      }
    })();

    if (!activity) {
      return;
    }

    const signature = `${activity.current_app_id ?? 'null'}|${activity.section}`;
    if (lastActivitySignature.current === signature) {
      return;
    }

    lastActivitySignature.current = signature;

    socketService.emit(SocketEvent.PLAYER_ACTIVITY_REPORT, {
      characterId: character.id,
      current_app_id: activity.current_app_id ?? null,
      section: activity.section ?? null,
      last_activity_at: new Date().toISOString()
    });
  }, [character, state, selectedApp, selectedMessage]);

  useEffect(() => {
    if (!character) {
      return;
    }

    const unsubscribeConflict = socketService.on(SocketEvent.PLAYER_SESSION_CONFLICT, (payload: any) => {
      if (payload?.characterId && payload.characterId !== character.id) {
        return;
      }

      setSystemMessage('login detected from another terminal, you have been logged out');
      unbindSession({ suppressDisconnectActivity: true });
      resetClientView({ preserveSystemMessage: true });
    });

    return () => {
      unsubscribeConflict && unsubscribeConflict();
    };
  }, [character, resetClientView, unbindSession]);

  const handleLogin = async (char: Character) => {
    setSystemMessage(null);
    setCharacter(char);
    setApps([]);
    setMessages([]);
    setSentMessages([]);
    setGameTime(null);
    let userMessages: Message[] = [];
    if (char.can_access_messages !== false) {
      try {
        userMessages = await messagesApi.getByRecipient(char.username);
        const ids = userMessages.map(m => m.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
          console.error('DUPLICATE MESSAGES FROM API:', ids.length, 'messages but only', uniqueIds.size, 'unique IDs');
          console.error('Duplicates:', userMessages.filter((m, idx) => ids.indexOf(m.id) !== idx));
        }
      } catch (error) {
        console.error('Failed to load inbox:', error);
      }
    }

    setMessages(userMessages);
    setVisualEffects(char.visual_effects || []);
    setState('menu');
  };

  const handleLogout = () => {
    if (character) {
      socketService.emit(SocketEvent.PLAYER_ACTIVITY_REPORT, {
        characterId: character.id,
        current_app_id: null,
        section: 'LOGGED OUT',
        last_activity_at: new Date().toISOString()
      });
      unbindSession({ suppressDisconnectActivity: true });
    }

    resetClientView();
  };

  const handleSelectApp = async (app: GameApp) => {
    setSelectedApp(app);
    setState('app');
  };

  const handleSelectMail = () => {
    if (!commsEnabled) return;
    setShowUnreadBadge(false); // Reset badge visibility when entering mail menu
    setState('mail_menu');
  };

  const handleSelectInbox = () => {
    if (!commsEnabled) return;
    setState('inbox');
  };

  const handleSelectSent = () => {
    if (!commsEnabled) return;
    setState('sent');
    // Fetch messages in the background
    if (character) {
      messagesApi.getSentByUser(character.username)
        .then(sent => {
          setSentMessages(sent);
        })
        .catch(error => {
          console.error('Failed to load sent messages:', error);
        });
    }
  };

  const handleSelectCompose = () => {
    if (!commsEnabled) return;
    setComposePrefill(null);
    setState('compose');
  };

  const handleBackToMenu = () => {
    setSelectedApp(null);
    setSelectedMessage(null);
    setComposePrefill(null);
    setImageFitMode('height');
    setState('menu');
  };

  const handleBackToMailMenu = () => {
    if (!commsEnabled) {
      setComposePrefill(null);
      setState('menu');
      return;
    }
    setSelectedMessage(null);
    setComposePrefill(null);
    setState('mail_menu');
  };

  const handleBackToMailList = () => {
    if (!commsEnabled) {
      setSelectedMessage(null);
      setComposePrefill(null);
      setState('menu');
      return;
    }
    setSelectedMessage(null);
    setComposePrefill(null);
    setState(previousMailView);
  };

  const handleSelectMessage = async (message: Message) => {
    if (!commsEnabled) return;
    setSelectedMessage(message);
    // Track which list we came from for proper back navigation
    setPreviousMailView(state === 'inbox' ? 'inbox' : 'sent');
    setState('message');

    // Mark as read if not already read
    if (character && !message.read_status?.[character.username]) {
      try {
        await messagesApi.markAsRead(message.id, character.username);
        // The WebSocket event will update the state
      } catch (error) {
        console.error('Failed to mark message as read:', error);
      }
    }
  };

  const formatGameTime = (gameTimeJson: string): string => {
    try {
      const time = JSON.parse(gameTimeJson);
      const hours = String(time.hour).padStart(2, '0');
      const minutes = String(time.minute).padStart(2, '0');
      const seconds = String(time.second).padStart(2, '0');
      return `${time.era}.${time.day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      return gameTimeJson; // Return as-is if parsing fails
    }
  };

  const ensureReplySubject = useCallback((subject?: string | null) => {
    if (!subject) {
      return 'Re: ';
    }
    const trimmed = subject.trim();
    if (!trimmed) {
      return 'Re: ';
    }
    if (/^re:/i.test(trimmed)) {
      return trimmed;
    }
    return `Re: ${trimmed}`;
  }, []);

  const handleReplyToMessage = useCallback(() => {
    if (!selectedMessage) {
      return;
    }
    const sender = selectedMessage.sender?.trim();
    if (!sender) {
      return;
    }
    const replySubject = ensureReplySubject(selectedMessage.subject ?? '');
    setComposePrefill({ recipients: [sender], subject: replySubject });
    setState('compose');
  }, [selectedMessage, ensureReplySubject]);

  return (
    <div className={terminalClassName}>
      {(themeEffects.scanlines || themeEffects.staticNoise) && (
        <Scanlines scanlines={themeEffects.scanlines} staticNoise={themeEffects.staticNoise} />
      )}
      {themeEffects.embers && (
        <div className="theme-embers-overlay" aria-hidden="true">
          {emberParticles.map((particle) => (
            <span key={particle.id} className="ember-particle" style={particle.style}>
              <span className="ember-core" />
            </span>
          ))}
        </div>
      )}
      {themeEffects.heartbeat && <div className="theme-heartbeat-overlay" aria-hidden="true" />}
      {themeEffects.grid && <div className="theme-grid-overlay" aria-hidden="true" />}
      {themeEffects.glare && <div className="theme-glare-overlay" aria-hidden="true" />}
      {themeEffects.vignette && <div className="theme-vignette-overlay" />}
      {themeEffects.chromaticAberration && <div className="theme-chromatic-overlay" />}

      <div className="terminal-content">
        {state === 'login' && (
          <div className="login-view">
            <div className="game-header">
              <span className="game-header-left">{headerText}</span>
              <span className="game-header-right">ACCESS: STANDBY</span>
            </div>
            <div className="game-header-separator" aria-hidden="true"></div>
            <LoginScreen onLogin={handleLogin} loginText={loginText} systemMessage={systemMessage ?? undefined} />
          </div>
        )}

        {state === 'menu' && character && (
          <MainMenu
            username={character.username}
            apps={apps}
            messages={messages}
            gameTime={gameTime}
            headerText={headerText}
            onSelectApp={handleSelectApp}
            onSelectMail={handleSelectMail}
            onLogout={handleLogout}
            commsEnabled={commsEnabled}
          />
        )}

        {state === 'app' && selectedApp && character && (
          <div className="app-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            {selectedApp.category !== 'Telemetry' && selectedApp.category !== 'Terminal' && (
              <div className="app-header">
                <span className="back-link" onClick={handleBackToMenu}>
                  <Teletype text="< Back to Menu" speed={25} autoScroll={false} />
                </span>
                {selectedApp.category === 'Image' && (
                  <button
                    type="button"
                    className="app-header-action"
                    onClick={() => setImageFitMode(imageFitMode === 'height' ? 'width' : 'height')}
                  >
                    <Teletype
                      text={imageFitMode === 'height' ? '> Zoom to width' : '> Zoom to height'}
                      speed={45}
                      autoScroll={false}
                    />
                  </button>
                )}
              </div>
            )}
            <div className="app-content">
              {selectedApp.category === 'Text' && (
                <Teletype
                  text={selectedApp.data?.text?.trim() ? selectedApp.data.text : '...'}
                  speed={60}
                  className="app-text-content"
                />
              )}
              {selectedApp.category === 'Image' && (
                <ImageApp
                  imageData={selectedApp.data.imageData || ''}
                  mimeType={selectedApp.data.mimeType || 'image/png'}
                  onComplete={() => {}}
                  className="luminosity"
                  fitMode={imageFitMode}
                />
              )}
              {selectedApp.category === 'Map' && selectedApp.data && (
                <PlayerMapApp data={selectedApp.data} />
              )}
              {selectedApp.category === 'Logbook' && selectedApp.data && (
                <LogbookApp
                  entries={selectedApp.data.entries || []}
                  currentGameTime={gameTime}
                />
              )}
              {selectedApp.category === 'Telemetry' && selectedApp.data && (
                <TelemetryApp
                  data={selectedApp.data}
                  onBackToMenu={handleBackToMenu}
                />
              )}
              {selectedApp.category === 'Terminal' && character && (
                <TerminalApp
                  appId={selectedApp.id}
                  username={character.username}
                  onBackToMenu={handleBackToMenu}
                />
              )}
              {selectedApp.category === 'AI_Chat' && selectedApp.data && character && (
                <LLMChatApp
                  appId={selectedApp.id}
                  appData={selectedApp.data}
                  username={character.username}
                />
              )}
              {selectedApp.category !== 'Text' && selectedApp.category !== 'Image' && selectedApp.category !== 'Map' && selectedApp.category !== 'Logbook' && selectedApp.category !== 'Telemetry' && selectedApp.category !== 'Terminal' && selectedApp.category !== 'AI_Chat' && (
                <div className="app-placeholder">
                  App implementation coming soon...
                  <br /><br />
                  Category: {selectedApp.category}
                  <br /><br />
                  App Data:
                  <pre>{JSON.stringify(selectedApp.data, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {state === 'mail_menu' && character && commsEnabled && (
          <div className="mail-menu-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            <div className="mail-menu-content">
              <div className="menu-section">
                <div className="menu-list">
                  <div className="menu-entry">
                    <span className="menu-link" onClick={handleBackToMenu}>
                      <Teletype
                        text="< Back to Main Menu"
                        speed={25}
                        autoScroll={false}
                        startDelay={0}
                        scrollOnStart={true}
                      />
                    </span>
                  </div>

                  <div className="menu-entry">
                    <span className="menu-link" onClick={handleSelectInbox}>
                      <Teletype 
                        text="> Incoming Messages" 
                        speed={25} 
                        autoScroll={false}
                        startDelay={0}
                        scrollOnStart={true}
                        onComplete={() => setShowUnreadBadge(true)}
                      />
                    </span>
                    {showUnreadBadge && messages.filter(m => !m.read_status?.[character.username]).length > 0 && (
                      <span className="unread-badge">
                        <Teletype 
                          text={` (${messages.filter(m => !m.read_status?.[character.username]).length} unread)`} 
                          speed={35} 
                          autoScroll={false}
                          startDelay={0}
                        />
                      </span>
                    )}
                  </div>

                  <div className="menu-entry">
                    <span className="menu-link" onClick={handleSelectSent}>
                      <Teletype text="> Sent Messages" speed={28} autoScroll={false} startDelay={200} scrollOnStart={true} />
                    </span>
                  </div>

                  <div className="menu-entry">
                    <span className="menu-link" onClick={handleSelectCompose}>
                      <Teletype text="> Send New Message" speed={32} autoScroll={false} startDelay={400} scrollOnStart={true} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {state === 'inbox' && character && commsEnabled && (
          <div className="inbox-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            <div className="inbox-header">
              <span className="back-link" onClick={handleBackToMailMenu}>
                <Teletype text="< Back to Comms" speed={25} autoScroll={false} />
              </span>
            </div>
            <div className="inbox-content">
              {renderMessageList && (
                <>
                  {messages.length === 0 ? (
                    <Teletype text="No messages" className="inbox-empty" speed={30} autoScroll={false} />
                  ) : (
                    <div className="message-list">
                      {messages
                        .sort((a, b) => {
                          // Sort by sent_at in descending order (newest first)
                          try {
                            const timeA = JSON.parse(a.sent_at);
                            const timeB = JSON.parse(b.sent_at);
                            
                            // Compare era, then day, then hour, then minute, then second
                            if (timeB.era !== timeA.era) return timeB.era - timeA.era;
                            if (timeB.day !== timeA.day) return timeB.day - timeA.day;
                            if (timeB.hour !== timeA.hour) return timeB.hour - timeA.hour;
                            if (timeB.minute !== timeA.minute) return timeB.minute - timeA.minute;
                            return timeB.second - timeA.second;
                          } catch (error) {
                            // If parsing fails, maintain original order
                            return 0;
                          }
                        })
                        .map((msg, index) => {
                          const isUnread = !msg.read_status?.[character.username];
                          const unreadMark = isUnread ? '*' : ' ';
                          const messageText = `[${unreadMark}] FROM: ${msg.sender}  ${msg.subject}`;
                          // Random speed between 20 and 40 cps, seeded by message id for consistency
                          const speed = 20 + (parseInt(msg.id.toString().split('').reduce((a, b) => a + b.charCodeAt(0), 0).toString().slice(-2)) % 21);
                          const startDelay = index * 200;
                          
                          return (
                            <div 
                              key={msg.id} 
                              className="message-list-item"
                              onClick={() => handleSelectMessage(msg)}
                            >
                              <Teletype text={messageText} speed={speed} autoScroll={false} startDelay={startDelay} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        )}

        {state === 'sent' && character && commsEnabled && (
          <div className="sent-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            <div className="sent-header">
              <span className="back-link" onClick={handleBackToMailMenu}>
                <Teletype text="< Back to Comms" speed={25} autoScroll={false} />
              </span>
            </div>
            <div className="sent-content">
              {renderMessageList && (
                <>
                  {sentMessages.length === 0 ? (
                    <Teletype text="No sent messages" className="sent-empty" speed={30} autoScroll={false} />
                  ) : (
                    <div className="message-list">
                      {sentMessages
                        .sort((a, b) => {
                          try {
                            const timeA = JSON.parse(a.sent_at);
                            const timeB = JSON.parse(b.sent_at);
                            if (timeB.era !== timeA.era) return timeB.era - timeA.era;
                            if (timeB.day !== timeA.day) return timeB.day - timeA.day;
                            if (timeB.hour !== timeA.hour) return timeB.hour - timeA.hour;
                            if (timeB.minute !== timeA.minute) return timeB.minute - timeA.minute;
                            return timeB.second - timeA.second;
                          } catch (error) {
                            return 0;
                          }
                        })
                        .map((msg, index) => {
                          const messageText = `TO: ${msg.recipients.join(', ')}  ${msg.subject}`;
                          // Random speed between 20 and 40 cps, seeded by message id for consistency
                          const speed = 20 + (parseInt(msg.id.toString().split('').reduce((a, b) => a + b.charCodeAt(0), 0).toString().slice(-2)) % 21);
                          const startDelay = index * 200;
                          
                          return (
                            <div 
                              key={msg.id} 
                              className="message-list-item"
                              onClick={() => handleSelectMessage(msg)}
                            >
                              <Teletype text={messageText} speed={speed} autoScroll={false} startDelay={startDelay} />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {state === 'compose' && character && commsEnabled && (
          <div className="compose-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            <div className="compose-header">
              <span className="back-link" onClick={handleBackToMailMenu}>
                <Teletype text="< Back to Comms" speed={25} autoScroll={false} />
              </span>
            </div>
            <div className="compose-content">
              <ComposeMessage
                onSend={async (recipients, subject, body) => {
                  try {
                    await messagesApi.create({
                      sender: character.username,
                      recipients,
                      subject,
                      body
                    });
                    handleBackToMailMenu();
                  } catch (error) {
                    console.error('Failed to send message:', error);
                    alert('Failed to send message');
                  }
                }}
                onCancel={handleBackToMailMenu}
                initialRecipients={composePrefill?.recipients}
                initialSubject={composePrefill?.subject}
              />
            </div>
          </div>
        )}

        {state === 'message' && selectedMessage && character && commsEnabled && (
          <div className="message-view">
            <GameHeader username={character.username} gameTime={gameTime} headerText={headerText} />
            <div className="message-detail-header">
              <span className="back-link" onClick={handleBackToMailList}>
                <Teletype text="< back" speed={25} autoScroll={false} />
              </span>
            </div>
            <div className="message-detail-content">
              <Teletype 
                text={`FROM: ${selectedMessage.sender}\nSUBJECT: ${selectedMessage.subject}\nSENT: ${formatGameTime(selectedMessage.sent_at)}\n\n${selectedMessage.body}`}
                speed={120}
              />
            </div>
            {selectedMessage.sender && selectedMessage.sender.trim() && (
              <div className="message-reply-controls">
                <button
                  type="button"
                  className="message-reply-link"
                  onClick={handleReplyToMessage}
                  aria-label="Reply to message"
                >
                  <Teletype
                    key={`reply-${selectedMessage.id}`}
                    text="> Reply"
                    speed={25}
                    autoScroll={false}
                    startDelay={200}
                  />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Broadcast overlay - interrupts any current activity */}
        {activeBroadcast && (
          <BroadcastDisplay
            type={activeBroadcast.type}
            content={activeBroadcast.content}
            mimeType={activeBroadcast.mimeType}
            duration={activeBroadcast.duration}
            onComplete={() => {
              setActiveBroadcast(null);
              setState('menu');
            }}
          />
        )}
      </div>

      {/* Visual Effects - applied as overlays */}
      {visualEffects.includes(VisualEffect.BROKEN_SCREEN) && <BrokenScreen />}
      {visualEffects.includes(VisualEffect.CORRUPTED_TEXT) && <CorruptedText />}
      {visualEffects.includes(VisualEffect.BLOODY) && <BloodyScreen />}
      {visualEffects.includes(VisualEffect.GLITCH) && <GlitchEffect />}
      {visualEffects.includes(VisualEffect.STATIC) && <StaticNoise />}
      {visualEffects.includes(VisualEffect.SCREEN_FLICKER) && <ScreenFlicker />}
    </div>
  );
}

export default App;
