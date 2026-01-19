// Shared types matching backend

export enum VisualEffect {
  BROKEN_SCREEN = 'broken-screen',
  CORRUPTED_TEXT = 'corrupted-text',
  BLOODY = 'bloody',
  GLITCH = 'glitch',
  STATIC = 'static',
  SCREEN_FLICKER = 'screen-flicker'
}

export enum AppCategory {
  TEXT = 'Text',
  TELEMETRY = 'Telemetry',
  LOGBOOK = 'Logbook',
  IMAGE = 'Image',
  MAP = 'Map',
  TERMINAL = 'Terminal',
  AI_CHAT = 'AI_Chat'
}

// Telemetry Types
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

// Logbook Types
export enum LogSeverity {
  INFO = 'info',
  IMPORTANT = 'important',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface LogEntry {
  id: string;            // UUID
  timestamp: string;     // Serialized GameTime JSON
  severity: LogSeverity;
  author: string;
  text: string;          // Max 256 characters
}

export interface LogbookAppData {
  entries: LogEntry[];
}

// Image Types
export interface ImageAppData {
  imageData: string;  // Base64 encoded image data
  mimeType: string;   // e.g., 'image/png', 'image/jpeg', etc.
  filename: string;   // Original filename
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
  isPlaced?: boolean;  // Whether the token is deployed on the tactical grid
  placedLayerId?: string; // Which layer currently owns this deployment
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
  markers?: MapMarker[]; // legacy field for backward compatibility
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

// Terminal Types
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
  manual?: string;
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
  isTest?: boolean;
}

export interface TerminalExecuteResponse {
  status: 'auto-responded' | 'pending' | 'error' | 'approved' | 'rejected';
  executionId?: string;
  response?: string;
  currentPath?: string;
  execution?: TerminalCommandExecution;
}

export interface TerminalAppData {
  filesystem: TerminalFileSystem;
  sessions: Record<string, TerminalSessionState>;
  customCommands: TerminalCustomCommand[];
  executionHistory: TerminalCommandExecution[];
}

// AI Chat Types
export interface LLMChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;  // Game time when message was sent
}

export interface LLMChatHistoryEntry {
  id: string;                    // Unique entry ID
  username: string;              // Player who sent the message
  userMessage: string;           // What the player sent
  aiResponse: string;            // AI's response
  timestamp: string;             // Game time when interaction occurred
}

export interface LLMChatContextOptions {
  includeGameTime?: boolean;          // Include current game time (default: true)
  includeUserProfile?: boolean;       // Include user character details (default: true)
  includeMessages?: boolean;          // Include user's messages (default: true)
  includeLogbooks?: boolean;          // Include logbook entries (default: true)
  includeTelemetry?: boolean;         // Include ship telemetry data (default: false)
  includeTerminalCommands?: boolean;  // Include terminal commands (default: false)
}

export interface LLMChatPreset {
  id: string;
  label: string;
  endpoint: string;
  modelName: string;
  model: string;
  apiToken: string;
  systemInstructions: string;
  contextOptions?: LLMChatContextOptions;  // Control what context is provided to this agent
}

export interface LLMChatAppData {
  endpoint?: string;              // Legacy API endpoint URL
  modelName?: string;             // Legacy display name for the model
  model?: string;                 // Legacy model identifier (e.g., 'gpt-4')
  apiToken?: string;              // Legacy API authentication token
  systemInstructions?: string;    // Legacy system prompt defining AI behavior
  presets?: LLMChatPreset[];      // Named agent presets
  activePresetId?: string;        // Currently active preset id
  conversationHistories: { [username: string]: LLMChatMessage[] };  // Per-user conversation history
  interactionHistory: LLMChatHistoryEntry[];  // All interactions for GM visibility
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
  real_time_ref: number;
}

export interface Character {
  id: number;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  title: string;
  current_app_id?: string | null;
  current_section?: string | null;
  last_activity_at?: string | null;
  can_access_messages?: boolean;
  visual_effects?: VisualEffect[];
  background?: string;
  personality?: string;
  fear?: string;
  secret?: string;
  motivation?: string;
  agenda?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GameApp {
  id: string;
  name: string;
  category: AppCategory;
  allowed_users: string[]; // List of usernames that can access this app
  order_index: number;
  data?: any;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  sender: string;
  recipients: string[];
  subject: string;
  body: string;
  sent_at: string;
  read_status: { [username: string]: boolean };
  created_at?: string;
  updated_at?: string;
}

export type GamestateSection = 'gameTime' | 'characters' | 'apps' | 'messages' | 'settings';

export interface ThemeEffectSettings {
  embers: {
    primaryColor: string;
    secondaryColor: string;
    driftSpeed: number;
    density: number;
    glow: number;
    swayAmount: number;
    swaySpeed: number;
  };
  heartbeat: {
    coreColor: string;
    ringColor: string;
    pulseRate: number;
    intensity: number;
  };
  silicon: {
    gridColor: string;
    glareColor: string;
    sweepSpeed: number;
    gridScale: number;
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

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: PlayerThemeSettings;
}

export interface GamestatePayload {
  version: string;
  exportedAt: string;
  gameTime: GameTimeState;
  characters: Record<string, any>[];
  apps: Record<string, any>[];
  messages: Record<string, any>[];
  settings: { key: string; value: string }[];
  selectedSections?: GamestateSection[];
}

export interface GamestateSummaryResponse {
  meta: {
    version: string;
    generatedAt: string;
  };
  counts: {
    characters: number;
    apps: number;
    messages: number;
    settings: number;
  };
  gameTime: GameTimeState;
}

export interface GamestatePreviewResponse {
  meta: {
    version: string;
    exportedAt: string;
  };
  counts: {
    characters: number;
    apps: number;
    messages: number;
    settings: number;
  };
  gameState: GamestatePayload;
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

export enum SocketEvent {
  CHARACTER_CREATED = 'character:created',
  CHARACTER_UPDATED = 'character:updated',
  CHARACTER_DELETED = 'character:deleted',
  CHARACTER_APP_CHANGED = 'character:app_changed',
  CHARACTER_ACTIVITY_UPDATED = 'character:activity_updated',
  VISUAL_EFFECTS_CHANGED = 'visual_effects:changed',
  PLAYER_ACTIVITY_REPORT = 'player:activity_report',
  PLAYER_SESSION_BIND = 'player:session_bind',
  PLAYER_SESSION_UNBIND = 'player:session_unbind',
  PLAYER_SESSION_CONFLICT = 'player:session_conflict',
  APP_CREATED = 'app:created',
  APP_UPDATED = 'app:updated',
  APP_DELETED = 'app:deleted',
  GAME_TIME_UPDATED = 'game_time:updated',
  GAME_TIME_PAUSED = 'game_time:paused',
  GAME_TIME_RESUMED = 'game_time:resumed',
  MESSAGE_CREATED = 'message:created',
  MESSAGE_UPDATED = 'message:updated',
  MESSAGE_DELETED = 'message:deleted',
  MESSAGE_READ_STATUS_CHANGED = 'message:read_status_changed',
  TERMINAL_COMMAND_QUEUED = 'terminal:command_queued',
  TERMINAL_COMMAND_EXECUTED = 'terminal:command_executed',
  TERMINAL_COMMAND_RESPONDED = 'terminal:command_responded',
  LLM_CHAT_INTERACTION = 'llm_chat:interaction',
  BROADCAST_SENT = 'broadcast:sent',
  CLIENT_CONNECTED = 'client:connected',
  CLIENT_DISCONNECTED = 'client:disconnected',
  SYNC_REQUEST = 'sync:request',
  SYNC_RESPONSE = 'sync:response'
}

export interface SocketEventPayload {
  event: SocketEvent;
  data: any;
  timestamp: number;
}
