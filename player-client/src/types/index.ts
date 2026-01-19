// Type definitions matching backend
export enum VisualEffect {
  BROKEN_SCREEN = 'broken-screen',
  CORRUPTED_TEXT = 'corrupted-text',
  BLOODY = 'bloody',
  GLITCH = 'glitch',
  STATIC = 'static',
  SCREEN_FLICKER = 'screen-flicker'
}

export interface GameTime {
  era: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface GameTimeState extends GameTime {
  is_paused: boolean;
  real_time_ref: number; // Unix timestamp (ms) when this game time was set
}

export interface Character {
  id: number;
  username: string;
  password: string;
  current_app_id?: string | null;
  current_section?: string | null;
  last_activity_at?: string | null;
  can_access_messages?: boolean;
  background?: string;
  personality?: string;
  fear?: string;
  secret?: string;
  motivation?: string;
  agenda?: string;
  visual_effects?: VisualEffect[];
}

export interface GameApp {
  id: string;
  name: string;
  category: AppCategory;
  allowed_users: string[]; // Match backend snake_case
  order_index: number;
  data: any;
}

export type AppCategory = 'Text' | 'Telemetry' | 'Logbook' | 'Image' | 'Map' | 'Terminal' | 'AI_Chat';

export interface NumericalParameter {
  name: string;
  unit: string;
  value: number;
  lowerLimit: number;        // Absolute minimum (red zone starts here)
  upperLimit: number;        // Absolute maximum (red zone starts here)
  criticalLower: number;     // Critical threshold below target (red zone)
  criticalUpper: number;     // Critical threshold above target (red zone)
  warningLower: number;      // Warning threshold below target (yellow zone)
  warningUpper: number;      // Warning threshold above target (yellow zone)
  noise: number;             // Random variation amount
  responsiveness: number;    // How quickly value moves toward target (0-1)
  targetValue: number;       // Desired steady-state value
}

export interface TextualParameter {
  name: string;
  unit: string;
  value: string;
  expectedValue: string;
}

export interface MonitoringGroup {
  name: string;
  parameters: (NumericalParameter | TextualParameter)[];
}

export interface TelemetryAppData {
  monitoringGroups: MonitoringGroup[];
}

export type MapMarkerIcon =
  | 'circle-user'
  | 'bot'
  | 'drone'
  | 'flag-triangle-right'
  | 'skull'
  | 'rocket'
  | 'star'
  | 'triangle'
  | 'circle'
  | 'diamond'
  | 'cross'
  | 'box'
  | 'map-pin';

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapMarker {
  id: string;
  label: string;
  description?: string;
  icon: MapMarkerIcon;
  color: string;
  position: MapPoint;
  locked?: boolean;
  isPlaced?: boolean;
  placedLayerId?: string;
}

export interface MapMask {
  id: string;
  label: string;
  color: string;
  opacity: number;
  points: MapPoint[];
  isActive: boolean;
}

export interface MapLayer {
  id: string;
  name: string;
  markers?: MapMarker[];
  backgroundImageData?: string;
  backgroundImageMimeType?: string;
  backgroundImageFilename?: string;
}

export interface MapAppData {
  mapImageData?: string;
  mapImageMimeType?: string;
  mapImageFilename?: string;
  markers: MapMarker[];
  masks: MapMask[];
  layers?: MapLayer[];
  activeLayerId?: string;
}

// Terminal Types (subset used by player terminal)
export type TerminalNodeType = 'directory' | 'file';

export type TerminalRunMode = 'auto' | 'gm';

export interface TerminalPermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface TerminalDirectoryPermissions {
  read: boolean;
  write: boolean;
}

interface TerminalNodeBase {
  id: string;
  type: TerminalNodeType;
  name: string;
  parentId: string | null;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalDirectoryNode extends TerminalNodeBase {
  type: 'directory';
  permissions: TerminalDirectoryPermissions;
  childrenIds: string[];
}

export interface TerminalFileNode extends TerminalNodeBase {
  type: 'file';
  permissions: TerminalPermissionSet;
  openContent: string;
  runContent: string;
  runMode: TerminalRunMode;
}

export type TerminalNode = TerminalDirectoryNode | TerminalFileNode;

export interface TerminalFileSystem {
  rootId: string;
  nodes: Record<string, TerminalNode>;
}

export interface TerminalConfirmation {
  action: 'delete' | 'overwrite';
  targetPath: string;
}

export interface TerminalSessionState {
  currentPath: string;
  pendingConfirmation?: TerminalConfirmation;
}

export type TerminalArgumentType = 'string' | 'number' | 'choice';

export interface TerminalCustomCommandArgument {
  name: string;
  type: TerminalArgumentType;
  required: boolean;
  description?: string;
  choices?: string[];
  defaultValue?: string;
}

export type TerminalResponseMode = 'auto' | 'gm';

export interface TerminalCustomCommand {
  id: string;
  name: string;
  syntax: string;
  description: string;
  arguments: TerminalCustomCommandArgument[];
  responseMode: TerminalResponseMode;
  autoResponseTemplate?: string;
  hidden?: boolean;
}

export type TerminalExecutionContext =
  | { type: 'file-run'; path: string }
  | { type: 'file-open'; path: string }
  | { type: 'custom-command'; commandId: string; syntax: string }
  | { type: 'system'; command: string };

export interface TerminalCommandExecution {
  id: string;
  commandId?: string;
  username: string;
  input: string;
  parsedCommand: string;
  parsedParameters: { [key: string]: any };
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'auto-responded';
  response: string;
  gmNotes?: string;
  context?: TerminalExecutionContext;
}

export interface TerminalAppData {
  filesystem: TerminalFileSystem;
  sessions: Record<string, TerminalSessionState>;
  customCommands: TerminalCustomCommand[];
  executionHistory: TerminalCommandExecution[];
}

// LLM Chat Types
export interface LLMChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface LLMChatHistoryEntry {
  id: string;
  username: string;
  userMessage: string;
  aiResponse: string;
  timestamp: string;
}

export interface LLMChatPreset {
  id: string;
  label: string;
  endpoint: string;
  modelName: string;
  model: string;
  apiToken: string;
  systemInstructions: string;
}

export interface LLMChatAppData {
  endpoint?: string;
  modelName?: string;
  model?: string;
  apiToken?: string;
  systemInstructions?: string;
  presets?: LLMChatPreset[];
  activePresetId?: string;
  conversationHistories: { [username: string]: LLMChatMessage[] };
  interactionHistory: LLMChatHistoryEntry[];
}

export interface Message {
  id: string;
  sender: string;
  recipients: string[];
  subject: string;
  body: string;
  sent_at: string; // JSON serialized GameTime
  read_status: { [username: string]: boolean }; // Per-user read status
  created_at?: string;
  updated_at?: string;
}

export enum BroadcastType {
  TEXT = 'text',
  IMAGE = 'image'
}

export interface Broadcast {
  id: string;
  type: BroadcastType;
  recipients: string[];
  content: string;
  mimeType?: string;
  duration: number;
  timestamp: string;
}

export interface ThemeEffectSettings {
  embers: {
    primaryColor: string;
    secondaryColor: string;
    driftSpeed: number; // Multiplier applied to animation duration
    density: number; // Controls ember spacing (px)
    glow: number; // Additional opacity boost 0-1
    swayAmount: number; // Horizontal sway range in px
    swaySpeed: number; // Seconds per horizontal sway oscillation
  };
  heartbeat: {
    coreColor: string;
    ringColor: string;
    pulseRate: number; // Seconds per pulse (lower is faster)
    intensity: number; // 0-1 multiplier for scale/opacity changes
  };
  silicon: {
    gridColor: string;
    glareColor: string;
    sweepSpeed: number; // Seconds per sweep
    gridScale: number; // Pixel spacing for grid (converted to vw at runtime)
  };
}

export interface PlayerThemeSettings {
  presetId: string | null;
  palette: {
    foreground: string;
    background: string;
    alert: string;
    gradient: {
      type: 'radial' | 'linear';
      angle: number;
      start: string;
      end: string;
      radius: number;
      intensity: number;
      enabled: boolean;
    };
    glow: {
      foreground: number;
      background: number;
      alert: number;
    };
    media: {
      hueShift: number;
      saturation: number;
      brightness: number;
      contrast: number;
    };
  };
  typography: {
    fontFamily: string;
    fontScale: number;
    lineHeightScale: number;
    letterSpacingScale: number;
  };
  effects: {
    scanlines: boolean;
    staticNoise: boolean;
    vignette: boolean;
    chromaticAberration: boolean;
    embers: boolean;
    heartbeat: boolean;
    grid: boolean;
    glare: boolean;
  };
  effectSettings: ThemeEffectSettings;
}

// Socket Events - matching backend
export enum SocketEvent {
  // Character events
  CHARACTER_CREATED = 'character:created',
  CHARACTER_UPDATED = 'character:updated',
  CHARACTER_DELETED = 'character:deleted',
  CHARACTER_APP_CHANGED = 'character:app_changed',
  CHARACTER_ACTIVITY_UPDATED = 'character:activity_updated',
  VISUAL_EFFECTS_CHANGED = 'visual_effects:changed',

  // Player session events
  PLAYER_ACTIVITY_REPORT = 'player:activity_report',
  PLAYER_SESSION_BIND = 'player:session_bind',
  PLAYER_SESSION_UNBIND = 'player:session_unbind',
  PLAYER_SESSION_CONFLICT = 'player:session_conflict',

  // App events
  APP_CREATED = 'app:created',
  APP_UPDATED = 'app:updated',
  APP_DELETED = 'app:deleted',

  // Game time events
  GAME_TIME_UPDATED = 'game_time:updated',
  GAME_TIME_PAUSED = 'game_time:paused',
  GAME_TIME_RESUMED = 'game_time:resumed',

  // Message events
  MESSAGE_CREATED = 'message:created',
  MESSAGE_UPDATED = 'message:updated',
  MESSAGE_DELETED = 'message:deleted',
  MESSAGE_READ_STATUS_CHANGED = 'message:read_status_changed',

  // Broadcast events
  BROADCAST_SENT = 'broadcast:sent',

  // Settings events
  SETTING_UPDATED = 'setting:updated',

  // Client events
  CLIENT_CONNECTED = 'client:connected',
  CLIENT_DISCONNECTED = 'client:disconnected',

  // State sync
  SYNC_REQUEST = 'sync:request',
  SYNC_RESPONSE = 'sync:response'
}

// Session state
export interface PlayerSession {
  character: Character;
  availableApps: GameApp[];
  messages: Message[];
}
