import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowDown01,
  ArrowDownAZ,
  ArrowUp10,
  ArrowUpZA,
  CircleChevronDown,
  CircleChevronUp,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  List,
  MessagesSquare,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react';
import { Character, GameTime, Message } from '../types';
import { messagesApi } from '../services/api';

interface MessageHubProps {
  messages: Message[];
  characters: Character[];
  currentGameTime: GameTime;
  onDeleteMessage: (id: string) => void;
}

type SortField = 'sentAt' | 'subject' | 'sender' | 'volume';
type SortDirection = 'asc' | 'desc';
type TimelineOrder = 'asc' | 'desc';
type HubViewMode = 'messages' | 'conversations';

interface FilterState {
  search: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  timeFrom: string;
  timeTo: string;
  unreadOnly: boolean;
}

interface FilterMeta {
  searchLower: string;
  senderLower: string;
  recipientLower: string;
  subjectLower: string;
  bodyLower: string;
  timeFromValue: number | null;
  timeToValue: number | null;
  unreadOnly: boolean;
  hasActiveFilters: boolean;
}

interface ConversationThread {
  id: string;
  normalizedSubject: string;
  displaySubject: string;
  participants: string[];
  messages: Message[];
  lastSentAt: string;
  lastSentValue: number;
  unreadCount: number;
  matchingMessageIds: Set<string> | null;
}

interface EditorState {
  id: string;
  sender: string;
  subject: string;
  body: string;
  sentAt: GameTime;
  recipients: Set<string>;
  readStatus: Record<string, boolean>;
}

interface ComposerState {
  sender: string;
  subject: string;
  body: string;
  recipients: Set<string>;
  useCustomTime: boolean;
  customTime: GameTime;
}

const DEFAULT_TIME: GameTime = { era: 0, day: 1, hour: 0, minute: 0, second: 0 };

const TIME_FIELDS: ReadonlyArray<{
  key: keyof GameTime;
  label: string;
  min: number;
  fallback: number;
  aria: string;
  max?: number;
}> = [
  { key: 'era', label: 'E', min: 0, fallback: 0, aria: 'Era' },
  { key: 'day', label: 'D', min: 1, fallback: 1, aria: 'Day' },
  { key: 'hour', label: 'H', min: 0, max: 23, fallback: 0, aria: 'Hour' },
  { key: 'minute', label: 'M', min: 0, max: 59, fallback: 0, aria: 'Minute' },
  { key: 'second', label: 'S', min: 0, max: 59, fallback: 0, aria: 'Second' }
];

type SenderAccent = {
  accent: string;
  accentRgb: string;
};

type BubbleStyle = CSSProperties & {
  '--bubble-accent'?: string;
  '--bubble-accent-rgb'?: string;
};

const SENDER_COLOR_PALETTE: SenderAccent[] = [
  { accent: 'var(--color-accent-cyan)', accentRgb: 'var(--color-accent-cyan-rgb)' },
  { accent: 'var(--color-accent-magenta)', accentRgb: 'var(--color-accent-magenta-rgb)' },
  { accent: 'var(--color-accent-green)', accentRgb: 'var(--color-accent-green-rgb)' },
  { accent: 'var(--color-accent-amber)', accentRgb: 'var(--color-accent-amber-rgb)' },
  { accent: 'var(--color-accent-violet)', accentRgb: 'var(--color-accent-violet-rgb)' },
  { accent: 'var(--color-accent-amber)', accentRgb: 'var(--color-accent-amber-rgb)' },
  { accent: 'var(--color-accent-cyan)', accentRgb: 'var(--color-accent-cyan-rgb)' }
];

type TimeFieldKey = typeof TIME_FIELDS[number]['key'];

interface TimeInputGroupProps {
  time: GameTime;
  onChange: (field: TimeFieldKey, value: number) => void;
  idPrefix: string;
}

const sanitizeNumber = (value: string, fallback: number) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const clampValue = (value: number, min: number, max?: number) => {
  if (Number.isFinite(max)) {
    return Math.min(Math.max(value, min), max as number);
  }
  return Math.max(value, min);
};

const TimeInputGroup = ({ time, onChange, idPrefix }: TimeInputGroupProps) => (
  <div className="time-inputs labeled">
    {TIME_FIELDS.map(field => {
      const currentValue = typeof time[field.key] === 'number' ? Number(time[field.key]) : field.fallback;
      const adjustValue = (delta: number) => {
        const nextValue = clampValue(currentValue + delta, field.min, field.max);
        if (nextValue === currentValue) return;
        onChange(field.key, nextValue);
      };
      return (
        <label key={field.key} className="time-pill">
          <span className="time-pill-label" aria-hidden="true">{field.label}</span>
          <input
            id={`${idPrefix}-${field.key}`}
            type="number"
            min={field.min}
            max={field.max}
            value={currentValue}
            aria-label={field.aria}
            onChange={(event) => {
              const nextValue = clampValue(sanitizeNumber(event.target.value, field.fallback), field.min, field.max);
              onChange(field.key, nextValue);
            }}
          />
          <span className="time-pill-chevrons">
            <button
              type="button"
              className="time-chevron-btn up"
              aria-label={`Increase ${field.aria}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                adjustValue(1);
              }}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="time-chevron-btn down"
              aria-label={`Decrease ${field.aria}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                adjustValue(-1);
              }}
            >
              <ChevronDown size={14} />
            </button>
          </span>
        </label>
      );
    })}
  </div>
);

const normalizeSubject = (subject: string): string => {
  let result = subject.trim();
  while (/^re:\s*/i.test(result)) {
    result = result.replace(/^re:\s*/i, '').trim();
  }
  return result || 'Untitled Thread';
};

const formatGameTime = (timeStr: string): string => {
  try {
    const time = JSON.parse(timeStr) as GameTime;
    const pad = (value: number) => String(value ?? 0).padStart(2, '0');
    return `E${time.era ?? 0} D${time.day ?? 1} ${pad(time.hour ?? 0)}:${pad(time.minute ?? 0)}:${pad(time.second ?? 0)}`;
  } catch {
    return timeStr;
  }
};

const parseSentAt = (timeStr: string): GameTime => {
  try {
    return JSON.parse(timeStr) as GameTime;
  } catch {
    return DEFAULT_TIME;
  }
};

const getConversationTimeParts = (timeStr: string | GameTime) => {
  const time = typeof timeStr === 'string' ? parseSentAt(timeStr) : timeStr;
  const pad = (value: number) => String(value ?? 0).padStart(2, '0');
  return {
    eraDay: `E${time.era ?? 0} D${time.day ?? 1}`,
    clock: `${pad(time.hour ?? 0)}:${pad(time.minute ?? 0)}:${pad(time.second ?? 0)}`
  };
};

const getGameTimeValue = (timeStr: string | GameTime): number => {
  const time: GameTime = typeof timeStr === 'string' ? parseSentAt(timeStr) : timeStr;
  return (time.era ?? 0) * 1_000_000 + (time.day ?? 1) * 10_000 + (time.hour ?? 0) * 3_600 + (time.minute ?? 0) * 60 + (time.second ?? 0);
};

const parseFilterTimeInput = (value: string): number | null => {
  if (!value.trim()) return null;
  const match = value.trim().match(/e?\s*(\d+)\s*d?\s*(\d+)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (!match) return null;
  const era = parseInt(match[1], 10) || 0;
  const day = parseInt(match[2], 10) || 1;
  const hour = parseInt(match[3], 10) || 0;
  const minute = parseInt(match[4], 10) || 0;
  const second = match[5] ? parseInt(match[5], 10) : 0;
  return getGameTimeValue({ era, day, hour, minute, second });
};

const buildConversationThreads = (messages: Message[]): ConversationThread[] => {
  const threads: ConversationThread[] = [];

  messages.forEach((message, index) => {
    const normalizedSubject = normalizeSubject(message.subject);
    const participants = Array.from(new Set([message.sender, ...message.recipients])).sort();
    const messageValue = getGameTimeValue(message.sent_at);
    const threadId = `${normalizedSubject}::${participants.join('|')}` || `${normalizedSubject}-${index}`;

    let target = threads.find(thread => {
      if (thread.normalizedSubject !== normalizedSubject) {
        return false;
      }
      const threadParticipants = new Set(thread.participants);
      const isSubset = participants.every(name => threadParticipants.has(name));
      const threadIsSubset = thread.participants.every(name => participants.includes(name));
      return isSubset || threadIsSubset;
    });

    if (!target) {
      target = {
        id: threadId,
        normalizedSubject,
        displaySubject: message.subject,
        participants: [...participants],
        messages: [],
        lastSentAt: message.sent_at,
        lastSentValue: messageValue,
        unreadCount: 0,
        matchingMessageIds: null
      };
      threads.push(target);
    } else {
      target.participants = Array.from(new Set([...target.participants, ...participants])).sort();
      if (messageValue > target.lastSentValue) {
        target.lastSentValue = messageValue;
        target.lastSentAt = message.sent_at;
        target.displaySubject = message.subject;
      }
    }

    const unreadForMessage = Object.values(message.read_status || {}).filter(read => !read).length;
    target.unreadCount += unreadForMessage;
    target.messages.push(message);
  });

  threads.forEach(thread => {
    thread.messages.sort((a, b) => getGameTimeValue(a.sent_at) - getGameTimeValue(b.sent_at));
  });

  return threads;
};

const createEditorState = (message: Message): EditorState => ({
  id: message.id,
  sender: message.sender,
  subject: message.subject,
  body: message.body,
  sentAt: parseSentAt(message.sent_at),
  recipients: new Set(message.recipients),
  readStatus: { ...message.read_status }
});

const createComposerState = (gameTime: GameTime): ComposerState => ({
  sender: '',
  subject: '',
  body: '',
  recipients: new Set<string>(),
  useCustomTime: false,
  customTime: gameTime
});

const DEFAULT_FILTERS: FilterState = {
  search: '',
  sender: '',
  recipient: '',
  subject: '',
  body: '',
  timeFrom: '',
  timeTo: '',
  unreadOnly: false
};

function MessageHub({ messages, characters, currentGameTime, onDeleteMessage }: MessageHubProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>('sentAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [timelineOrder, setTimelineOrder] = useState<TimelineOrder>('asc');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [composerState, setComposerState] = useState<ComposerState>(() => createComposerState(currentGameTime));
  const [composerErrors, setComposerErrors] = useState<string[]>([]);
  const [composerSaving, setComposerSaving] = useState(false);
  const [viewMode, setViewMode] = useState<HubViewMode>('messages');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [editorIsClosing, setEditorIsClosing] = useState(false);
  const [editorIsOpening, setEditorIsOpening] = useState(false);
  const editorCardRef = useRef<HTMLDivElement | null>(null);
  const editorCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [threadAnimating, setThreadAnimating] = useState(false);
  const conversationColumnRef = useRef<HTMLDivElement | null>(null);

  const clearEditorCloseTimer = useCallback(() => {
    if (editorCloseTimeout.current) {
      clearTimeout(editorCloseTimeout.current);
      editorCloseTimeout.current = null;
    }
  }, []);

  useEffect(() => {
    setComposerState(prev => {
      if (prev.useCustomTime) {
        return prev;
      }
      return {
        ...prev,
        customTime: currentGameTime
      };
    });
  }, [currentGameTime]);

  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.username.localeCompare(b.username)),
    [characters]
  );

  const conversationThreads = useMemo(
    () => buildConversationThreads(messages),
    [messages]
  );

  useEffect(() => {
    if (viewMode === 'messages' && sortField === 'volume') {
      setSortField('sentAt');
    }
  }, [viewMode, sortField]);

  const filterMeta = useMemo<FilterMeta>(() => {
    const searchLower = filters.search.toLowerCase();
    const senderLower = filters.sender.toLowerCase();
    const recipientLower = filters.recipient.toLowerCase();
    const subjectLower = filters.subject.toLowerCase();
    const bodyLower = filters.body.toLowerCase();
    const timeFromValue = parseFilterTimeInput(filters.timeFrom);
    const timeToValue = parseFilterTimeInput(filters.timeTo);
    const hasActiveFilters =
      Boolean(filters.search || filters.sender || filters.recipient || filters.subject || filters.body || filters.timeFrom || filters.timeTo) ||
      filters.unreadOnly;

    return {
      searchLower,
      senderLower,
      recipientLower,
      subjectLower,
      bodyLower,
      timeFromValue,
      timeToValue,
      unreadOnly: filters.unreadOnly,
      hasActiveFilters
    };
  }, [filters]);

  const matchesMessageFilters = useCallback((message: Message) => {
    const subjectMatch = !filterMeta.subjectLower || message.subject.toLowerCase().includes(filterMeta.subjectLower);
    const senderMatch = !filterMeta.senderLower || message.sender.toLowerCase().includes(filterMeta.senderLower);
    const recipientMatch =
      !filterMeta.recipientLower ||
      message.recipients.some(rec => rec.toLowerCase().includes(filterMeta.recipientLower));
    const bodyMatch = !filterMeta.bodyLower || message.body.toLowerCase().includes(filterMeta.bodyLower);
    const searchMatch =
      !filterMeta.searchLower ||
      message.subject.toLowerCase().includes(filterMeta.searchLower) ||
      message.body.toLowerCase().includes(filterMeta.searchLower) ||
      message.sender.toLowerCase().includes(filterMeta.searchLower) ||
      message.recipients.some(rec => rec.toLowerCase().includes(filterMeta.searchLower));
    const hasUnread = Object.values(message.read_status || {}).some(status => !status);
    const unreadMatch = !filterMeta.unreadOnly || hasUnread;
    const messageValue = getGameTimeValue(message.sent_at);
    const afterFrom = filterMeta.timeFromValue === null || messageValue >= filterMeta.timeFromValue;
    const beforeTo = filterMeta.timeToValue === null || messageValue <= filterMeta.timeToValue;

    return (
      subjectMatch &&
      senderMatch &&
      recipientMatch &&
      bodyMatch &&
      searchMatch &&
      unreadMatch &&
      afterFrom &&
      beforeTo
    );
  }, [filterMeta]);

  const filteredMessages = useMemo(
    () => messages.filter(matchesMessageFilters),
    [messages, matchesMessageFilters]
  );

  const filteredMessageIds = useMemo(() => new Set(filteredMessages.map(msg => msg.id)), [filteredMessages]);

  const filteredThreads = useMemo(() => {
    const threadMatches = conversationThreads
      .map(thread => {
        const matchingMessages = thread.messages.filter(matchesMessageFilters);

        if (matchingMessages.length === 0) {
          return null;
        }

        return {
          ...thread,
          matchingMessageIds: filterMeta.hasActiveFilters ? new Set(matchingMessages.map(msg => msg.id)) : null
        } as ConversationThread;
      })
      .filter(Boolean) as ConversationThread[];

    const directionFactor = sortDirection === 'asc' ? 1 : -1;
    const sorter = (a: ConversationThread, b: ConversationThread) => {
      switch (sortField) {
        case 'subject':
          return a.normalizedSubject.localeCompare(b.normalizedSubject) * directionFactor;
        case 'sender': {
          const aSender = a.messages[0]?.sender ?? '';
          const bSender = b.messages[0]?.sender ?? '';
          return aSender.localeCompare(bSender) * directionFactor;
        }
        case 'volume':
          return (a.messages.length - b.messages.length) * directionFactor;
        case 'sentAt':
        default:
          return (a.lastSentValue - b.lastSentValue) * directionFactor;
      }
    };

    return threadMatches.sort(sorter);
  }, [conversationThreads, matchesMessageFilters, sortField, sortDirection, filterMeta.hasActiveFilters]);

  const sortedMessages = useMemo(() => {
    const messagesCopy = [...filteredMessages];
    const directionFactor = sortDirection === 'asc' ? 1 : -1;
    messagesCopy.sort((a, b) => {
      switch (sortField) {
        case 'subject':
          return normalizeSubject(a.subject).localeCompare(normalizeSubject(b.subject)) * directionFactor;
        case 'sender':
          return a.sender.localeCompare(b.sender) * directionFactor;
        case 'volume':
        case 'sentAt':
        default:
          return (getGameTimeValue(a.sent_at) - getGameTimeValue(b.sent_at)) * directionFactor;
      }
    });
    return messagesCopy;
  }, [filteredMessages, sortField, sortDirection]);

  const messageToThreadId = useMemo(() => {
    const map = new Map<string, string>();
    conversationThreads.forEach(thread => {
      thread.messages.forEach(message => {
        map.set(message.id, thread.id);
      });
    });
    return map;
  }, [conversationThreads]);

  useEffect(() => {
    const availableConversationIds = viewMode === 'conversations'
      ? filteredThreads.map(thread => thread.id)
      : filteredMessages
          .map(message => messageToThreadId.get(message.id) || null)
          .filter((id): id is string => Boolean(id));

    if (!availableConversationIds.length) {
      if (selectedConversationId !== null) {
        setSelectedConversationId(null);
      }
      if (selectedMessageId !== null) {
        setSelectedMessageId(null);
      }
      setEditorState(null);
      return;
    }

    if (selectedConversationId && !availableConversationIds.includes(selectedConversationId)) {
      setSelectedConversationId(null);
      setSelectedMessageId(null);
      setEditorState(null);
    }
  }, [
    filteredMessages,
    filteredThreads,
    viewMode,
    messageToThreadId,
    selectedConversationId,
    selectedMessageId
  ]);

  const activeConversation = useMemo(
    () => conversationThreads.find(thread => thread.id === selectedConversationId) ?? null,
    [conversationThreads, selectedConversationId]
  );

  const senderColorMap = useMemo(() => {
    if (!activeConversation) return new Map<string, SenderAccent>();
    const map = new Map<string, SenderAccent>();
    activeConversation.participants.forEach((participant, index) => {
      const accent = SENDER_COLOR_PALETTE[index % SENDER_COLOR_PALETTE.length];
      map.set(participant, accent);
    });
    return map;
  }, [activeConversation]);

  const activeFilteredThread = filteredThreads.find(thread => thread.id === selectedConversationId) ?? null;

  useEffect(() => {
    if (!activeConversation) {
      setSelectedMessageId(null);
      if (editorState) {
        setEditorState(null);
      }
      return;
    }

    const fallbackMessage = activeConversation.messages.find(msg => msg.id === selectedMessageId);
    if (!fallbackMessage && selectedMessageId) {
      setSelectedMessageId(null);
    }
  }, [activeConversation, selectedMessageId, editorState]);

  const timelineMessages = useMemo(() => {
    if (!activeConversation) return [];
    const messagesCopy = [...activeConversation.messages];
    return timelineOrder === 'asc' ? messagesCopy : messagesCopy.reverse();
  }, [activeConversation, timelineOrder]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;
    setThreadAnimating(true);
    const timeoutId = setTimeout(() => setThreadAnimating(false), 420);
    return () => clearTimeout(timeoutId);
  }, [selectedConversationId]);

  const activeMatchSet = filterMeta.hasActiveFilters
    ? activeFilteredThread?.matchingMessageIds ?? filteredMessageIds
    : null;

  const conversationOriginSender = activeConversation?.messages[0]?.sender ?? null;

  const isAlphabeticalSort = sortField === 'subject' || sortField === 'sender';
  const DirectionIcon = isAlphabeticalSort
    ? (sortDirection === 'asc' ? ArrowDownAZ : ArrowUpZA)
    : (sortDirection === 'asc' ? ArrowDown01 : ArrowUp10);
  const sortDirectionLabel = `${sortDirection === 'asc' ? 'Ascending' : 'Descending'} ${isAlphabeticalSort ? 'alphabetical' : sortField === 'volume' ? 'volume' : 'chronological'} sort`;

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters(prev => ({
      ...prev,
      [key]: typeof prev[key] === 'boolean' ? !prev[key] : prev[key]
    }));
  };

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const handleConversationSelect = (thread: ConversationThread) => {
    if (thread.id !== selectedConversationId) {
      setSelectedConversationId(thread.id);
    }
    setSelectedMessageId(null);
    setEditorState(null);
  };

  const handleSidebarMessageSelect = (message: Message) => {
    const parentThreadId = messageToThreadId.get(message.id);
    if (!parentThreadId) return;
    if (parentThreadId !== selectedConversationId) {
      setSelectedConversationId(parentThreadId);
    }
    clearEditorCloseTimer();
    setEditorIsClosing(false);
    setEditorState(null);
    setSelectedMessageId(message.id);
  };

  const handleTimelineMessageEdit = (message: Message) => {
    const parentThreadId = messageToThreadId.get(message.id);
    if (parentThreadId && parentThreadId !== selectedConversationId) {
      setSelectedConversationId(parentThreadId);
    }
    setSelectedMessageId(message.id);
    setEditorState(createEditorState(message));
  };

  const handleEditorClose = useCallback(() => {
    if (!editorState) return;
    setEditorIsOpening(false);
    setEditorIsClosing(true);
    clearEditorCloseTimer();
    editorCloseTimeout.current = setTimeout(() => {
      setEditorState(null);
      setSelectedMessageId(null);
      setEditorIsClosing(false);
      editorCloseTimeout.current = null;
    }, 280);
  }, [editorState, clearEditorCloseTimer]);

  const handleEditorFieldChange = (field: keyof Omit<EditorState, 'id' | 'recipients' | 'readStatus' | 'sentAt'>, value: string) => {
    setEditorState(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleEditorTimeChange = (field: TimeFieldKey, value: number) => {
    setEditorState(prev => (prev ? { ...prev, sentAt: { ...prev.sentAt, [field]: value } } : prev));
  };

  const handleComposerTimeChange = (field: TimeFieldKey, value: number) => {
    setComposerState(prev => ({
      ...prev,
      customTime: {
        ...prev.customTime,
        [field]: value
      }
    }));
  };

  useEffect(() => {
    if (!editorState) {
      setEditorIsOpening(false);
      return undefined;
    }
    setEditorIsClosing(false);
    clearEditorCloseTimer();
    // Reset opening state first, then trigger on next frame
    setEditorIsOpening(false);
    const timer = setTimeout(() => {
      setEditorIsOpening(true);
    }, 10);
    return () => clearTimeout(timer);
  }, [editorState, clearEditorCloseTimer]);

  useEffect(() => () => {
    clearEditorCloseTimer();
  }, [clearEditorCloseTimer]);

    useEffect(() => {
      const handleConversationBackgroundClick = (event: MouseEvent | TouchEvent) => {
        const column = conversationColumnRef.current;
        if (!column || !column.contains(event.target as Node)) {
          return;
        }
        const targetElement = event.target as HTMLElement | null;
        if (editorCardRef.current?.contains(event.target as Node)) {
          return;
        }
        if (targetElement?.closest('.timeline-card')) {
          return;
        }
        setSelectedMessageId(null);
        if (editorState) {
          handleEditorClose();
        }
      };

      document.addEventListener('mousedown', handleConversationBackgroundClick);
      document.addEventListener('touchstart', handleConversationBackgroundClick);

      return () => {
        document.removeEventListener('mousedown', handleConversationBackgroundClick);
        document.removeEventListener('touchstart', handleConversationBackgroundClick);
      };
    }, [editorState, handleEditorClose]);

  const handleEditorRecipientToggle = (username: string) => {
    setEditorState(prev => {
      if (!prev) return prev;
      const nextRecipients = new Set(prev.recipients);
      const nextReadStatus = { ...prev.readStatus };
      if (nextRecipients.has(username)) {
        nextRecipients.delete(username);
        delete nextReadStatus[username];
      } else {
        nextRecipients.add(username);
        nextReadStatus[username] = false;
      }
      return {
        ...prev,
        recipients: nextRecipients,
        readStatus: nextReadStatus
      };
    });
  };

  const handleEditorReadToggle = (username: string) => {
    setEditorState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        readStatus: {
          ...prev.readStatus,
          [username]: !prev.readStatus[username]
        }
      };
    });
  };

  const handleEditorSelectAllRecipients = useCallback(() => {
    if (!sortedCharacters.length) {
      return;
    }
    setEditorState(prev => {
      if (!prev) return prev;
      const everyone = new Set(sortedCharacters.map(character => character.username));
      const nextReadStatus = { ...prev.readStatus };
      everyone.forEach(username => {
        if (!(username in nextReadStatus)) {
          nextReadStatus[username] = false;
        }
      });
      return {
        ...prev,
        recipients: everyone,
        readStatus: nextReadStatus
      };
    });
  }, [sortedCharacters]);

  const handleEditorClearRecipients = useCallback(() => {
    setEditorState(prev => (prev ? { ...prev, recipients: new Set<string>(), readStatus: {} } : prev));
  }, []);

  const handleEditorSave = async () => {
    if (!editorState) return;
    if (!editorState.sender.trim()) {
      alert('Sender is required.');
      return;
    }

    setEditorSaving(true);
    try {
      await messagesApi.update(editorState.id, {
        sender: editorState.sender.trim(),
        recipients: Array.from(editorState.recipients),
        subject: editorState.subject.trim(),
        body: editorState.body.trim(),
        sent_at: JSON.stringify(editorState.sentAt),
        read_status: editorState.readStatus
      });
    } catch (error: any) {
      console.error('Failed to save message', error);
      alert(error.response?.data?.error || 'Failed to save message');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleComposerRecipientToggle = (username: string) => {
    setComposerState(prev => {
      const recipients = new Set(prev.recipients);
      if (recipients.has(username)) {
        recipients.delete(username);
      } else {
        recipients.add(username);
      }
      return { ...prev, recipients };
    });
  };

  const handleComposerSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setComposerErrors([]);

    const validationErrors: string[] = [];
    if (!composerState.sender.trim()) {
      validationErrors.push('Sender is required');
    }
    if (composerState.recipients.size === 0) {
      validationErrors.push('Select at least one recipient');
    }
    if (!composerState.subject.trim()) {
      validationErrors.push('Subject is required');
    }
    if (!composerState.body.trim()) {
      validationErrors.push('Body is required');
    }

    if (validationErrors.length > 0) {
      setComposerErrors(validationErrors);
      return;
    }

    setComposerSaving(true);
    try {
      const payload: any = {
        sender: composerState.sender.trim(),
        recipients: Array.from(composerState.recipients),
        subject: composerState.subject.trim(),
        body: composerState.body.trim()
      };
      if (composerState.useCustomTime) {
        payload.sent_at = JSON.stringify(composerState.customTime);
      }
      await messagesApi.create(payload);
      setComposerState(createComposerState(currentGameTime));
    } catch (error: any) {
      console.error('Failed to send message', error);
      const errorMsg = error.response?.data?.error || 'Failed to send message';
      setComposerErrors([errorMsg]);
    } finally {
      setComposerSaving(false);
    }
  };

  return (
    <div className="message-hub">
      <div className="app-surface message-column list-column">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Messages</h2>
          </div>
          <div className="panel-actions">
            <div className="view-pill" role="group" aria-label="View mode">
              <button
                type="button"
                className={viewMode === 'messages' ? 'active' : ''}
                onClick={() => setViewMode('messages')}
                title="Show individual messages"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                className={viewMode === 'conversations' ? 'active' : ''}
                onClick={() => setViewMode('conversations')}
                title="Group by conversation"
              >
                <MessagesSquare size={16} />
              </button>
            </div>
            <div className="count-pill">
              {viewMode === 'conversations' ? filteredThreads.length : filteredMessages.length}
            </div>
          </div>
        </div>

        <div className="conversation-filters compact">
          <div className="filter-main-bar">
            <div className="filter-chip search-chip">
              <Search width={14} height={14} className="search-chip-icon" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
              <div className="search-chip-actions">
                <button
                  type="button"
                  className={`search-action-btn ${advancedFiltersOpen ? 'active' : ''}`}
                  onClick={() => setAdvancedFiltersOpen(prev => !prev)}
                  aria-expanded={advancedFiltersOpen}
                  aria-pressed={advancedFiltersOpen}
                  title={advancedFiltersOpen ? 'Hide advanced filters' : 'Show advanced filters'}
                >
                  <SlidersHorizontal size={16} />
                  <span className="sr-only">{advancedFiltersOpen ? 'Hide advanced filters' : 'Show advanced filters'}</span>
                </button>
                <button
                  type="button"
                  className="search-action-btn"
                  onClick={() => {
                    resetFilters();
                  }}
                  title="Clear filters"
                  disabled={!filterMeta.hasActiveFilters}
                >
                  <X size={14} />
                  <span className="sr-only">Clear filters</span>
                </button>
              </div>
            </div>
          </div>

          <div
            className={`filter-advanced-wrapper ${advancedFiltersOpen ? 'open' : ''}`}
            aria-hidden={!advancedFiltersOpen}
          >
            <div className="filter-advanced-panel">
              <div className="filter-quick-grid two-column">
                <label className="filter-field">
                  <span>Sender</span>
                  <input
                    type="text"
                    value={filters.sender}
                    onChange={(e) => setFilters({ ...filters, sender: e.target.value })}
                  />
                </label>
                <label className="filter-field">
                  <span>Recipient</span>
                  <input
                    type="text"
                    value={filters.recipient}
                    onChange={(e) => setFilters({ ...filters, recipient: e.target.value })}
                  />
                </label>
                <label className="filter-field">
                  <span>Subject</span>
                  <input
                    type="text"
                    value={filters.subject}
                    onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                  />
                </label>
                <label className="filter-field">
                  <span>Body</span>
                  <input
                    type="text"
                    value={filters.body}
                    onChange={(e) => setFilters({ ...filters, body: e.target.value })}
                  />
                </label>
              </div>
              <div className="filter-quick-grid two-column">
                <label className="filter-field">
                  <span>From</span>
                  <input
                    type="text"
                    placeholder="E1 D3 12:00"
                    value={filters.timeFrom}
                    onChange={(e) => setFilters({ ...filters, timeFrom: e.target.value })}
                  />
                </label>
                <label className="filter-field">
                  <span>To</span>
                  <input
                    type="text"
                    placeholder="E1 D5 18:00"
                    value={filters.timeTo}
                    onChange={(e) => setFilters({ ...filters, timeTo: e.target.value })}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="filter-quick-grid base-row">
            <label className="filter-field filter-checkbox" title="Show unread messages only">
              <span>Unread only</span>
              <span className="toggle-checkbox">
                <input
                  type="checkbox"
                  checked={filters.unreadOnly}
                  onChange={() => toggleFilter('unreadOnly')}
                />
                <span className="toggle-slider" aria-hidden="true" />
              </span>
            </label>
            <div className="sort-control" role="group" aria-label="Sort messages">
              <span className="sort-label">Sort</span>
              <div className="sort-inputs">
                <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                  <option value="sentAt">Sent time</option>
                  <option value="subject">Subject</option>
                  <option value="sender">Sender</option>
                  <option value="volume" disabled={viewMode !== 'conversations'}>Message count</option>
                </select>
                <button
                  type="button"
                  className="sort-direction-btn"
                  onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                  title={`${sortDirectionLabel} (click to toggle)`}
                  aria-label={`${sortDirectionLabel} (click to toggle)`}
                >
                  <DirectionIcon width={18} height={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="conversation-list">
          {viewMode === 'conversations' ? (
            filteredThreads.length === 0 ? (
              <div className="empty-message">No threads match the selected filters.</div>
            ) : (
              filteredThreads.map(thread => {
                const previewSubject = normalizeSubject(thread.displaySubject);
                const timeParts = getConversationTimeParts(thread.lastSentAt);
                return (
                  <button
                    key={thread.id}
                    className={`conversation-card ${thread.id === selectedConversationId ? 'active' : ''}`}
                    onClick={() => handleConversationSelect(thread)}
                  >
                    <div className="conversation-card-heading">
                      <div className="conversation-heading-main">
                        <span className="conversation-subject preview">{previewSubject}</span>
                      </div>
                      <div className="conversation-time-block" aria-label={`Sent ${timeParts.eraDay} at ${timeParts.clock}`}>
                        <span className="conversation-era">{timeParts.eraDay}</span>
                        <span className="conversation-clock">{timeParts.clock}</span>
                      </div>
                    </div>
                  <div className="conversation-participants">
                    {thread.participants.join(', ')}
                  </div>
                  <div className="conversation-footer">
                    <span>{thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}</span>
                    {thread.unreadCount > 0 && (
                      <span className="unread-pill">{thread.unreadCount} unread</span>
                    )}
                  </div>
                  </button>
                );
              })
            )
          ) : (
            sortedMessages.length === 0 ? (
              <div className="empty-message">No messages match the selected filters.</div>
            ) : (
              sortedMessages.map(message => {
                const readCount = Object.values(message.read_status || {}).filter(Boolean).length;
                const readDetails = message.recipients
                  .map(rec => `${rec}: ${message.read_status?.[rec] ? 'Read' : 'Unread'}`)
                  .join('\n');
                const messageTimeParts = getConversationTimeParts(message.sent_at);
                return (
                  <button
                    key={message.id}
                    className={`message-list-item ${message.id === selectedMessageId ? 'active' : ''}`}
                    onClick={() => handleSidebarMessageSelect(message)}
                  >
                    <div className="message-list-item-header">
                      <div className="conversation-heading-main">
                        <span className="conversation-subject preview">{message.subject || 'Untitled message'}</span>
                      </div>
                      <div className="conversation-time-block" aria-label={`Sent ${messageTimeParts.eraDay} at ${messageTimeParts.clock}`}>
                        <span className="conversation-era">{messageTimeParts.eraDay}</span>
                        <span className="conversation-clock">{messageTimeParts.clock}</span>
                      </div>
                    </div>
                    <div className="message-list-meta">
                      <span className="message-sender">{message.sender}</span>
                      <span className="message-recipients">→ {message.recipients.join(', ')}</span>
                    </div>
                    <div className="message-list-footer">
                      <span className="read-chip" title={readDetails || 'No recipients'}>
                        {readCount}/{message.recipients.length} read
                      </span>
                    </div>
                  </button>
                );
              })
            )
          )}
        </div>
      </div>

      <div className="app-surface message-column detail-column" ref={conversationColumnRef}>
        {!activeConversation ? (
          <div className="empty-detail-state">
            <p className="eyebrow">Details</p>
            <h3>No message selected</h3>
            <p>Select a conversation or message from the list to see its details.</p>
          </div>
        ) : (
          <div className={`thread-view ${threadAnimating ? 'thread-enter' : ''}`}>
            <div className="thread-header">
              <div>
                <p className="eyebrow">Subject</p>
                <h2>{normalizeSubject(activeConversation.displaySubject)}</h2>
                <p className="thread-participants">{activeConversation.participants.join(', ')}</p>
              </div>
              <div className="thread-controls">
                <button
                  className="ghost-btn icon"
                  onClick={() => setTimelineOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                  title={timelineOrder === 'asc' ? 'Newest on bottom' : 'Newest on top'}
                  type="button"
                >
                  {timelineOrder === 'asc' ? <CircleChevronDown size={18} /> : <CircleChevronUp size={18} />}
                </button>
              </div>
            </div>

            <div className="thread-timeline">
              {timelineMessages.map(message => {
                const isHighlighted = activeMatchSet ? activeMatchSet.has(message.id) : true;
                const readCount = Object.values(message.read_status || {}).filter(Boolean).length;
                const totalRecipients = message.recipients.length;
                const readDetails = message.recipients
                  .map(recipient => `${recipient}: ${message.read_status?.[recipient] ? 'Read' : 'Unread'}`)
                  .join('\n');
                const isOriginSender = conversationOriginSender && message.sender === conversationOriginSender;
                const senderAccent = senderColorMap.get(message.sender);
                const bubbleStyles: BubbleStyle | undefined = senderAccent
                  ? {
                      '--bubble-accent': senderAccent.accent,
                      '--bubble-accent-rgb': senderAccent.accentRgb
                    }
                  : undefined;
                const cardClassNames = [
                  'timeline-card',
                  message.id === selectedMessageId ? 'selected' : '',
                  isHighlighted ? 'match' : '',
                  isOriginSender ? 'origin-sender' : 'secondary-sender'
                ].filter(Boolean).join(' ');
                return (
                  <div
                    key={message.id}
                    className={cardClassNames}
                    style={bubbleStyles}
                    onClick={() => handleTimelineMessageEdit(message)}
                  >
                    <div className="timeline-card-header">
                      <div>
                        <span className="timeline-sender">{message.sender}</span>
                        <span className="timeline-time">{formatGameTime(message.sent_at)}</span>
                      </div>
                      <div className="timeline-actions">
                        {editorState?.id === message.id && (
                          <span className="editing-pill">Editing</span>
                        )}
                        <span className="read-chip" title={readDetails || 'No recipients'}>
                          <CheckCheck size={14} aria-hidden="true" />
                          {readCount}/{totalRecipients}
                        </span>
                        <button
                          className="ghost-btn icon danger"
                          title="Delete message"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteMessage(message.id);
                          }}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="timeline-recipients">Subject: {message.subject}</div>
                    <div className="timeline-recipients">To: {message.recipients.join(', ')}</div>
                    <p className="timeline-body">{message.body}</p>
                  </div>
                );
              })}
            </div>

            {editorState && (
              <div
                key={editorState.id}
                className={`message-editor-card ${editorIsClosing ? 'closing' : (editorIsOpening ? 'opening' : '')}`}
                ref={editorCardRef}
              >
                <div className="section-heading">
                  <span>Editing message #{editorState.id}</span>
                  <div className="heading-icon-buttons">
                    <button
                      type="button"
                      className="ghost-btn icon accent"
                      title={editorSaving ? 'Saving…' : 'Save changes'}
                      onClick={handleEditorSave}
                      disabled={editorSaving}
                    >
                      <Save size={16} />
                    </button>
                    <button
                      type="button"
                      className="ghost-btn icon"
                      title="Close editor"
                      onClick={handleEditorClose}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="editor-meta-grid">
                  <label className="detail-field compact">
                    <span>Sender</span>
                    <input
                      type="text"
                      value={editorState.sender}
                      onChange={(e) => handleEditorFieldChange('sender', e.target.value)}
                    />
                  </label>
                  <label className="detail-field compact">
                    <span>Subject</span>
                    <input
                      type="text"
                      value={editorState.subject}
                      onChange={(e) => handleEditorFieldChange('subject', e.target.value)}
                    />
                  </label>
                  <div className="detail-field time-field">
                    <span className="field-label">Game time</span>
                    <TimeInputGroup
                      time={editorState.sentAt}
                      onChange={handleEditorTimeChange}
                      idPrefix="editor-time"
                    />
                  </div>
                </div>

                <div className="editor-section recipients-section">
                  <div className="section-heading compact">
                    <span>Recipients</span>
                    <div className="heading-icon-buttons">
                      <button
                        type="button"
                        className="ghost-btn small"
                        onClick={handleEditorSelectAllRecipients}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="ghost-btn small"
                        onClick={handleEditorClearRecipients}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="recipients-grid compact">
                    {sortedCharacters.length === 0 ? (
                      <p className="empty-message">No players available.</p>
                    ) : (
                      sortedCharacters.map(character => {
                        const isRecipient = editorState.recipients.has(character.username);
                        const isRead = Boolean(editorState.readStatus[character.username]);
                        return (
                          <div key={character.username} className={`recipient-pill ${isRecipient ? 'active' : ''}`}>
                            <label>
                              <input
                                type="checkbox"
                                checked={isRecipient}
                                onChange={() => handleEditorRecipientToggle(character.username)}
                              />
                              <span>{character.username}</span>
                            </label>
                            {isRecipient && (
                              <button
                                type="button"
                                className={`read-toggle ${isRead ? 'read' : 'unread'}`}
                                onClick={() => handleEditorReadToggle(character.username)}
                              >
                                {isRead ? 'Read' : 'Unread'}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <label className="detail-field compact body-field">
                  <span>Body</span>
                  <textarea
                    rows={4}
                    value={editorState.body}
                    onChange={(e) => handleEditorFieldChange('body', e.target.value)}
                  />
                </label>

              </div>
            )}

          </div>
        )}
      </div>

      <div className="app-surface message-column composer-column">
        <form className="message-composer-card" onSubmit={handleComposerSubmit}>
          <div className="section-heading">Compose new message</div>

          {composerErrors.length > 0 && (
            <div className="error-box inline">
              {composerErrors.map(error => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}

          <div className="composer-grid">
            <label className="detail-field">
              <span>Sender</span>
              <input
                type="text"
                value={composerState.sender}
                onChange={(e) => setComposerState({ ...composerState, sender: e.target.value })}
                placeholder="Username"
              />
            </label>
            <label className="detail-field">
              <span>Subject</span>
              <input
                type="text"
                value={composerState.subject}
                onChange={(e) => setComposerState({ ...composerState, subject: e.target.value })}
                placeholder="Subject"
              />
            </label>
          </div>

          <div className="recipients-grid">
            {sortedCharacters.map(character => {
              const isChecked = composerState.recipients.has(character.username);
              return (
                <label key={character.username} className={`recipient-pill ${isChecked ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleComposerRecipientToggle(character.username)}
                  />
                  <span>{character.username}</span>
                </label>
              );
            })}
          </div>

          <label className="detail-field">
            <span>Body</span>
            <textarea
              rows={4}
              value={composerState.body}
              onChange={(e) => setComposerState({ ...composerState, body: e.target.value })}
              placeholder="Message content"
            />
          </label>

          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={composerState.useCustomTime}
              onChange={(e) => setComposerState({ ...composerState, useCustomTime: e.target.checked })}
            />
            <span>Use custom game time</span>
          </label>

          {composerState.useCustomTime && (
            <TimeInputGroup
              time={composerState.customTime}
              onChange={handleComposerTimeChange}
              idPrefix="composer-time"
            />
          )}

          <div className="form-actions align-right">
            <button type="submit" className="accent-btn" disabled={composerSaving}>
              {composerSaving ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MessageHub;
