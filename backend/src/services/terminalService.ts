import { v4 as uuidv4 } from 'uuid';
import Handlebars, { HelperOptions } from 'handlebars';
import gameTimeService from './gameTimeService';
import {
  TerminalAppData,
  TerminalCommandExecution,
  TerminalCustomCommand,
  TerminalCustomCommandArgument,
  TerminalDirectoryNode,
  TerminalExecutionContext,
  TerminalFileNode,
  TerminalFileSystem,
  TerminalNode,
  TerminalRunMode,
  TerminalSessionState
} from '../types';

export interface ExecuteCommandResult {
  status: 'auto-responded' | 'pending' | 'error';
  response: string;
  currentPath: string;
  execution?: TerminalCommandExecution;
  updatedData: TerminalAppData;
}

interface BuiltInCommandOption {
  flag: string;
  description: string;
}

interface BuiltInCommand {
  name: string;
  syntax: string;
  description: string;
  shortDescription: string;
  secretAliases?: string[];
  options?: BuiltInCommandOption[];
}

const BUILT_IN_COMMANDS: BuiltInCommand[] = [
  {
    name: 'list',
    syntax: 'list [-hidden|-a|--all] [-long|-l|--long] [path]',
    description: 'List entries in the current directory or a provided path. Options reveal hidden content and switch to a detailed view.',
    shortDescription: 'List files and folders.',
    secretAliases: ['ls'],
    options: [
      { flag: '-hidden | -a | --all', description: 'Include files and folders marked as hidden.' },
      { flag: '-long | -l | --long', description: 'Show permissions, timestamps, and visibility for each entry.' }
    ]
  },
  {
    name: 'goto',
    syntax: 'goto <path>',
    description: 'Change the current working directory, similar to cd in a traditional terminal.',
    shortDescription: 'Change directories.',
    secretAliases: ['cd']
  },
  {
    name: 'open',
    syntax: 'open [-numbers|-n|--number-lines] <file>',
    description: 'Display the contents of a readable file. Add -numbers to annotate each line for easier reference.',
    shortDescription: 'Show file contents.',
    secretAliases: ['cat'],
    options: [{ flag: '-numbers | -n | --number-lines', description: 'Prepend each line with its line number.' }]
  },
  {
    name: 'run',
    syntax: 'run [-quiet|-q|--quiet] <file>',
    description: 'Execute a scriptable file. Quiet mode suppresses its output; some scripts still require GM approval.',
    shortDescription: 'Execute a script.',
    secretAliases: ['bash'],
    options: [{ flag: '-quiet | -q | --quiet', description: 'Suppress script output and only report completion.' }]
  },
  {
    name: 'copy',
    syntax: 'copy <source> <destination>',
    description: 'Duplicate a file into another directory or path. Destination accepts absolute or relative paths.',
    shortDescription: 'Duplicate a file.',
    secretAliases: ['cp']
  },
  {
    name: 'delete',
    syntax: 'delete [-force|-f|--force] <path>',
    description: 'Delete a file or directory. Confirmation is required unless the force flag is provided.',
    shortDescription: 'Remove files or folders.',
    secretAliases: ['rm'],
    options: [{ flag: '-force | -f | --force', description: 'Skip the confirmation step.' }]
  },
  {
    name: 'help',
    syntax: 'help [-all|-a|--all]',
    description: 'List every available command. Include the -all flag to reveal hidden entries as well.',
    shortDescription: 'Show command list.',
    options: [{ flag: '-all | -a | --all', description: 'Show commands that are marked as hidden.' }]
  },
  {
    name: 'man',
    syntax: 'man <command>',
    description: 'Display the manual entry for a command, including syntax, options, and aliases.',
    shortDescription: 'Show command details.'
  },
  {
    name: 'exit',
    syntax: 'exit',
    description: 'Exit the terminal session and return to the previous app.',
    shortDescription: 'Leave the terminal.'
  }
];

const COMMAND_ALIAS_LOOKUP = BUILT_IN_COMMANDS.reduce<Record<string, string>>((acc, command) => {
  command.secretAliases?.forEach((alias) => {
    acc[alias.toLowerCase()] = command.name;
  });
  return acc;
}, {});

interface ExecuteParams {
  username: string;
  input: string;
  data: TerminalAppData;
}

interface SyntaxTokenLiteral {
  type: 'literal';
  value: string;
}

interface SyntaxTokenArgument {
  type: 'argument';
  name: string;
  required: boolean;
}

type SyntaxToken = SyntaxTokenLiteral | SyntaxTokenArgument;

const DEFAULT_DIRECTORY_NAME = '/';

interface TemplateFileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  hidden: boolean;
}

const TEMPLATE_NEWLINE_MARKER = '__HB_NEWLINE__';
const TEMPLATE_INDENT_MARKER = '__HB_INDENT__';

const templateEngine = Handlebars.create();

const getHelperRootContext = (helperThis: unknown, options: HelperOptions): Record<string, any> => {
  if (options?.data?.root && typeof options.data.root === 'object') {
    return options.data.root as Record<string, any>;
  }
  if (helperThis && typeof helperThis === 'object') {
    return helperThis as Record<string, any>;
  }
  return {};
};

const resolveHelperString = (value: any, context: Record<string, any>): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  if (!value.includes('{{')) {
    return value;
  }

  try {
    const compiled = templateEngine.compile(value, { noEscape: true });
    return compiled(context);
  } catch {
    return value;
  }
};

templateEngine.registerHelper('eq', (a: any, b: any) => a === b);
templateEngine.registerHelper('ne', (a: any, b: any) => a !== b);
templateEngine.registerHelper('gt', (a: any, b: any) => a > b);
templateEngine.registerHelper('gte', (a: any, b: any) => a >= b);
templateEngine.registerHelper('lt', (a: any, b: any) => a < b);
templateEngine.registerHelper('lte', (a: any, b: any) => a <= b);
templateEngine.registerHelper('not', (value: any) => !value);
templateEngine.registerHelper('and', (...args: any[]) => args.slice(0, -1).every(Boolean));
templateEngine.registerHelper('or', (...args: any[]) => args.slice(0, -1).some(Boolean));
templateEngine.registerHelper('json', (value: any) => JSON.stringify(value, null, 2));

templateEngine.registerHelper('hasArg', (rawName: any, options: HelperOptions) => {
  if (rawName === undefined || rawName === null) {
    return false;
  }

  const argName = String(rawName);
  const root = options?.data?.root ?? {};
  const bag = root.args ?? root.parameters ?? root;
  return Object.prototype.hasOwnProperty.call(bag, argName);
});

templateEngine.registerHelper('range', (...helperArgs: any[]) => {
  if (helperArgs.length === 0) {
    return [];
  }

  const argsWithoutOptions = helperArgs.slice(0, -1);
  if (argsWithoutOptions.length < 2) {
    return [];
  }

  const [startRaw, endRaw, stepRaw] = argsWithoutOptions;
  const start = Number(startRaw);
  const end = Number(endRaw);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [];
  }

  let step = stepRaw === undefined || stepRaw === null || stepRaw === '' ? undefined : Number(stepRaw);
  if (!Number.isFinite(step || NaN) || (step as number) === 0) {
    step = undefined;
  }

  const ascending = start <= end;
  const resolvedStep = step !== undefined ? Math.abs(step) : 1;
  const finalStep = ascending ? resolvedStep : -resolvedStep;

  const values: number[] = [];
  if (ascending) {
    for (let current = start; current <= end; current += finalStep) {
      values.push(current);
    }
  } else {
    for (let current = start; current >= end; current += finalStep) {
      values.push(current);
    }
  }

  return values;
});

templateEngine.registerHelper('newline', (...helperArgs: any[]) => {
  const options = helperArgs[helperArgs.length - 1] as HelperOptions;
  const candidate = helperArgs.length > 1 ? helperArgs[0] : undefined;
  const count = Number(candidate);
  if (!Number.isFinite(count) || candidate === options || count <= 1) {
    return TEMPLATE_NEWLINE_MARKER;
  }
  const repetitions = Math.max(1, Math.floor(count));
  return TEMPLATE_NEWLINE_MARKER.repeat(repetitions);
});

templateEngine.registerHelper('indent', (...helperArgs: any[]) => {
  const options = helperArgs[helperArgs.length - 1] as HelperOptions;
  const candidate = helperArgs.length > 1 ? helperArgs[0] : undefined;
  const count = Number(candidate);
  if (!Number.isFinite(count) || candidate === options) {
    return TEMPLATE_INDENT_MARKER.repeat(2);
  }
  if (count <= 0) {
    return '';
  }
  const repetitions = Math.min(200, Math.floor(count));
  return TEMPLATE_INDENT_MARKER.repeat(repetitions);
});

templateEngine.registerHelper('file', function (this: unknown, ...args: any[]) {
  const options = args[args.length - 1] as HelperOptions;
  const context = getHelperRootContext(this, options);
  const targetPath = resolveHelperString(args[0], context);
  if (!targetPath) {
    return '';
  }
  const reader = options?.data?.__fileReader;
  return typeof reader === 'function' ? reader(targetPath) : '';
});

templateEngine.registerHelper('files', function (this: unknown, ...args: any[]) {
  const options = args[args.length - 1] as HelperOptions;
  const context = getHelperRootContext(this, options);
  const targetPath = resolveHelperString(args[0], context);
  const lister = options?.data?.__listFiles;
  return typeof lister === 'function' ? lister(targetPath) : [];
});

class TerminalService {
  normalize(raw?: any): TerminalAppData {
    const filesystem = this.ensureFilesystem(raw?.filesystem);
    const sessions = this.ensureSessions(raw?.sessions, filesystem);
    const customCommands = this.ensureCustomCommands(raw);
    const executionHistory = Array.isArray(raw?.executionHistory) ? raw.executionHistory : [];

    return {
      filesystem,
      sessions,
      customCommands,
      executionHistory
    };
  }

  execute({ username, input, data }: ExecuteParams): ExecuteCommandResult {
    const trimmedInput = (input || '').trim();
    const session = this.ensureSession(username, data);

    if (!trimmedInput) {
      return {
        status: 'error',
        response: 'No command provided. Type "help" to see available commands.',
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    if (session.pendingConfirmation) {
      return this.handleConfirmation({ username, data, session, input: trimmedInput });
    }

    const [rawCommand, ...args] = trimmedInput.split(/\s+/);
    const resolvedCommand = this.resolveBuiltInCommandName(rawCommand.toLowerCase());
    const command = resolvedCommand || rawCommand.toLowerCase();

    switch (command) {
      case 'list':
        return this.handleList({ username, data, session, input: trimmedInput, args });
      case 'goto':
        return this.handleGoto({ username, data, session, input: trimmedInput, args });
      case 'open':
        return this.handleOpen({ username, data, session, input: trimmedInput, args });
      case 'run':
        return this.handleRun({ username, data, session, input: trimmedInput, args });
      case 'copy':
        return this.handleCopy({ username, data, session, input: trimmedInput, args });
      case 'delete':
        return this.handleDelete({ username, data, session, input: trimmedInput, args });
      case 'help':
        return this.handleHelp({ username, data, session, input: trimmedInput, args });
      case 'man':
        return this.handleMan({ username, data, session, input: trimmedInput, args });
      case 'exit':
        return this.simpleResponse({
          username,
          input: trimmedInput,
          data,
          session,
          response: '[TERMINAL_EXIT]'
        });
      default:
        return this.handleCustomCommand({ username, data, session, input: trimmedInput });
    }
  }

  private ensureFilesystem(fs?: TerminalFileSystem | null): TerminalFileSystem {
    if (fs && fs.rootId && fs.nodes && fs.nodes[fs.rootId]) {
      Object.values(fs.nodes).forEach((node) => {
        node.hidden = Boolean(node.hidden);
        if (node.type === 'directory') {
          node.childrenIds = Array.isArray(node.childrenIds) ? node.childrenIds : [];
        }
      });
      return fs;
    }

    const rootId = uuidv4();
    const now = new Date().toISOString();
    const root: TerminalDirectoryNode = {
      id: rootId,
      type: 'directory',
      name: DEFAULT_DIRECTORY_NAME,
      parentId: null,
      hidden: false,
      permissions: { read: true, write: true },
      childrenIds: [],
      createdAt: now,
      updatedAt: now
    };

    return {
      rootId,
      nodes: {
        [rootId]: root
      }
    };
  }

  private ensureSessions(
    rawSessions: Record<string, TerminalSessionState> | undefined,
    filesystem: TerminalFileSystem
  ): Record<string, TerminalSessionState> {
    const sessions: Record<string, TerminalSessionState> = {};
    if (!rawSessions || typeof rawSessions !== 'object') {
      return sessions;
    }

    Object.entries(rawSessions).forEach(([username, session]) => {
      sessions[username] = {
        currentPath: this.correctPath(filesystem, session.currentPath) || '/',
        pendingConfirmation: session.pendingConfirmation
      };
    });

    return sessions;
  }

  private ensureCustomCommands(raw?: any): TerminalCustomCommand[] {
    const commandsCandidate = raw?.customCommands;
    if (Array.isArray(commandsCandidate) && commandsCandidate.length > 0) {
      return commandsCandidate.map((command: TerminalCustomCommand) => ({
        ...command,
        id: command.id || uuidv4(),
        responseMode: command.responseMode || 'auto',
        hidden: Boolean(command.hidden),
        manual: command.manual || ''
      }));
    }

    if (Array.isArray(raw?.commands) && raw.commands.length > 0) {
      return raw.commands.map((legacy: any) => this.convertLegacyCommand(legacy));
    }

    return [];
  }

  private convertLegacyCommand(legacy: any): TerminalCustomCommand {
    const syntaxParts = [legacy.name || 'command'];
    (legacy.parameters || []).forEach((param: any) => {
      syntaxParts.push(param.required ? `<${param.name}>` : `[${param.name}]`);
    });

    const argumentType = (paramType: string): 'string' | 'number' | 'choice' => {
      if (paramType === 'number') {
        return 'number';
      }
      if (paramType === 'boolean') {
        return 'choice';
      }
      return 'string';
    };

    return {
      id: legacy.id || uuidv4(),
      name: legacy.name || 'command',
      syntax: syntaxParts.join(' ').trim(),
      description: legacy.description || 'Legacy command',
      arguments: (legacy.parameters || []).map((param: any) => ({
        name: param.name,
        type: argumentType(param.type),
        required: Boolean(param.required),
        description: param.description,
        choices: param.type === 'boolean' ? ['true', 'false'] : undefined
      })),
      responseMode: legacy.requiresManualReview ? 'gm' : 'auto',
      autoResponseTemplate: legacy.responseTemplate,
      manual: legacy.manual || legacy.description || '',
      hidden: false
    };
  }

  private ensureSession(username: string, data: TerminalAppData): TerminalSessionState {
    if (!data.sessions[username]) {
      data.sessions[username] = {
        currentPath: '/'
      };
    }
    return data.sessions[username];
  }

  private handleConfirmation({
    username,
    data,
    session,
    input
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
  }): ExecuteCommandResult {
    const confirmation = session.pendingConfirmation;
    if (!confirmation) {
      session.pendingConfirmation = undefined;
      return {
        status: 'error',
        response: 'Nothing to confirm.',
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    const answer = input.toLowerCase();
    if (answer !== 'yes' && answer !== 'no') {
      return {
        status: 'auto-responded',
        response: 'Please respond with "yes" or "no" to continue.',
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    if (answer === 'no') {
      session.pendingConfirmation = undefined;
      return {
        status: 'auto-responded',
        response: 'Action cancelled.',
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    // answer === 'yes'
    if (confirmation.action === 'delete') {
      return this.confirmDelete({ username, data, session, targetPath: confirmation.targetPath });
    }

    session.pendingConfirmation = undefined;
    return {
      status: 'auto-responded',
      response: 'Action completed.',
      currentPath: session.currentPath,
      updatedData: data
    };
  }

  private handleList({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags, positional } = this.splitFlags(args);
    const targetArg = positional[0];
    const includeHidden = this.hasFlag(flags, '-hidden', '--hidden', '-a', '--all');
    const longFormat = this.hasFlag(flags, '-long', '--long', '-l');
    const path = targetArg
      ? this.resolvePath(data.filesystem, session.currentPath, targetArg)
      : session.currentPath;

    const node = this.getNodeByPath(data.filesystem, path);

    if (!node || node.type !== 'directory') {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `Path not found: ${path}`
      });
    }

    if (!node.permissions.read) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to read ${path}`
      });
    }

    const response = this.formatDirectoryListing(data.filesystem, node, path, {
      includeHidden,
      longFormat
    });
    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response,
      parsedCommand: 'list',
      context: { type: 'system', command: 'list' }
    });
  }

  private handleGoto({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags, positional } = this.splitFlags(args);
    const targetArg = positional[0];
    if (!targetArg) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: goto <path>'
      });
    }

    const path = this.resolvePath(data.filesystem, session.currentPath, targetArg);
    const node = this.getNodeByPath(data.filesystem, path);

    if (!node || node.type !== 'directory') {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `Directory not found: ${path}`
      });
    }

    if (!node.permissions.read) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to enter ${path}`
      });
    }

    session.currentPath = path;

    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: `Moved to ${path}`,
      parsedCommand: 'goto',
      context: { type: 'system', command: 'goto' }
    });
  }

  private handleOpen({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags, positional } = this.splitFlags(args);
    const targetArg = positional[0];
    if (!targetArg) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: open <file>'
      });
    }

    const path = this.resolvePath(data.filesystem, session.currentPath, targetArg);
    const node = this.getNodeByPath(data.filesystem, path);

    if (!node || node.type !== 'file') {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `File not found: ${path}`
      });
    }

    if (!node.permissions.read) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to open ${path}`
      });
    }

    const showLineNumbers = this.hasFlag(flags, '-numbers', '--numbers', '-n', '--number-lines');
    const content = node.openContent?.trim() ? node.openContent : '(file is empty)';
    const formatted = showLineNumbers ? this.formatWithLineNumbers(content) : content;
    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: formatted,
      parsedCommand: 'open',
      context: { type: 'file-open', path }
    });
  }

  private handleRun({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags, positional } = this.splitFlags(args);
    const targetArg = positional[0];
    if (!targetArg) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: run <file>'
      });
    }

    const path = this.resolvePath(data.filesystem, session.currentPath, targetArg);
    const node = this.getNodeByPath(data.filesystem, path);

    if (!node || node.type !== 'file') {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `File not found: ${path}`
      });
    }

    if (!node.permissions.execute) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to run ${path}`
      });
    }

    const quietMode = this.hasFlag(flags, '-quiet', '--quiet', '-q');

    if (node.runMode === 'gm') {
      return this.enqueuePendingExecution({
        username,
        data,
        session,
        input,
        parsedCommand: 'run',
        context: { type: 'file-run', path },
        responseMessage: 'Command is executing...'
      });
    }

    const response = node.runContent?.trim() ? node.runContent : 'Execution completed.';
    const finalResponse = quietMode ? 'Execution completed quietly.' : response;
    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: finalResponse,
      parsedCommand: 'run',
      context: { type: 'file-run', path }
    });
  }

  private handleCopy({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const [sourceArg, destinationArg] = args;
    if (!sourceArg || !destinationArg) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: copy <source> <destination>'
      });
    }

    const sourcePath = this.resolvePath(data.filesystem, session.currentPath, sourceArg);
    const sourceNode = this.getNodeByPath(data.filesystem, sourcePath);

    if (!sourceNode || sourceNode.type !== 'file') {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `Source file not found: ${sourcePath}`
      });
    }

    if (!sourceNode.permissions.read) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to copy ${sourcePath}`
      });
    }

    const destinationInfo = this.prepareDestination(
      data.filesystem,
      session.currentPath,
      destinationArg,
      sourceNode.name
    );

    if (!destinationInfo) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Destination path is invalid.'
      });
    }

    const { directory, name } = destinationInfo;

    if (!directory.permissions.write) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `You do not have permission to write into ${this.getPathForNode(data.filesystem, directory.id)}`
      });
    }

    if (directory.childrenIds.some((childId) => data.filesystem.nodes[childId]?.name === name)) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `A file named ${name} already exists in ${this.getPathForNode(data.filesystem, directory.id)}`
      });
    }

    const now = new Date().toISOString();
    const newFile: TerminalFileNode = {
      ...sourceNode,
      id: uuidv4(),
      name,
      parentId: directory.id,
      createdAt: now,
      updatedAt: now
    };

    data.filesystem.nodes[newFile.id] = newFile;
    directory.childrenIds.push(newFile.id);
    directory.updatedAt = now;

    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: `Copied ${sourcePath} to ${this.getPathForNode(data.filesystem, newFile.id)}`,
      parsedCommand: 'copy',
      context: { type: 'system', command: 'copy' }
    });
  }

  private handleDelete({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags, positional } = this.splitFlags(args);
    const targetArg = positional[0];
    if (!targetArg) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: delete <path>'
      });
    }

    const forceDelete = this.hasFlag(flags, '-force', '--force', '-f');
    const targetPath = this.resolvePath(data.filesystem, session.currentPath, targetArg);
    const node = this.getNodeByPath(data.filesystem, targetPath);

    if (!node) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `Path not found: ${targetPath}`
      });
    }

    if (node.parentId) {
      const parent = data.filesystem.nodes[node.parentId];
      if (parent && parent.type === 'directory' && !parent.permissions.write) {
        return this.errorResponse({
          username,
          input,
          data,
          session,
          message: `You do not have permission to modify ${this.getPathForNode(data.filesystem, parent.id)}`
        });
      }
    }

    if (forceDelete) {
      return this.confirmDelete({ username, data, session, targetPath });
    }

    session.pendingConfirmation = {
      action: 'delete',
      targetPath
    };

    return {
      status: 'auto-responded',
      response: `Delete ${targetPath}? Type yes or no to confirm.`,
      currentPath: session.currentPath,
      updatedData: data
    };
  }

  private handleHelp({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const { flags } = this.splitFlags(args);
    const includeHidden = this.hasFlag(flags, '-all', '--all', '-a', '-hidden', '--hidden');

    const builtInSummaries = BUILT_IN_COMMANDS.map((cmd) => ({
      name: cmd.name,
      summary: cmd.shortDescription
    }));

    const customSummaries = data.customCommands
      .filter((cmd) => includeHidden || !cmd.hidden)
      .map((cmd) => ({
        name: cmd.name,
        summary: cmd.description?.trim() || 'Custom command'
      }));

    const combined = [...builtInSummaries, ...customSummaries].sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = ['Available commands:\n'];
    combined.forEach((entry) => {
      lines.push(`${entry.name} — ${entry.summary}`);
    });

    if (!includeHidden && data.customCommands.some((cmd) => cmd.hidden)) {
      lines.push('\nHidden commands are omitted. Run "help -all" to include them.');
    }

    lines.push('\nUse "man <command>" for syntax, options, and aliases.');

    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: lines.join('\n'),
      parsedCommand: 'help',
      context: { type: 'system', command: 'help' }
    });
  }

  private handleMan({
    username,
    data,
    session,
    input,
    args
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    args: string[];
  }): ExecuteCommandResult {
    const target = args[0];
    if (!target) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: 'Usage: man <command>'
      });
    }

    const canonical = this.resolveBuiltInCommandName(target.toLowerCase());
    const builtIn = canonical ? BUILT_IN_COMMANDS.find((cmd) => cmd.name === canonical) : undefined;
    if (builtIn) {
      const lines: string[] = [];
      lines.push(`COMMAND: ${builtIn.name}`);
      lines.push(`SYNTAX: ${builtIn.syntax}`);
      lines.push('');
      lines.push(builtIn.description);

      if (builtIn.secretAliases?.length) {
        lines.push('\nALIASES:');
        lines.push(`- ${builtIn.secretAliases.join(', ')}`);
      }

      if (builtIn.options?.length) {
        lines.push('\nOPTIONS:');
        builtIn.options.forEach((option) => {
          lines.push(`- ${option.flag}: ${option.description}`);
        });
      }

      lines.push('\nUse "help" for a condensed list of commands.');

      const response = lines.join('\n');
      return this.logAndRespond({
        username,
        data,
        session,
        input,
        response,
        parsedCommand: 'man',
        context: { type: 'system', command: 'man' }
      });
    }

    const custom = data.customCommands.find((cmd) => cmd.name.toLowerCase() === target.toLowerCase());
    if (!custom) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `No manual entry for ${target}`
      });
    }

    const lines: string[] = [];
    lines.push(`COMMAND: ${custom.name}`);
    lines.push(`SYNTAX: ${custom.syntax}`);
    lines.push('');

    if (custom.arguments.length > 0) {
      lines.push('ARGUMENTS:');
      custom.arguments.forEach((arg) => {
        lines.push(`- ${arg.name} ${arg.required ? '[required]' : '[optional]'}`);
        if (arg.description) {
          lines.push(`  ${arg.description}`);
        }
      });
      lines.push('');
    }

    const manualBody = custom.manual?.trim() || custom.description || 'No description provided.';
    lines.push(manualBody);

    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response: lines.join('\n'),
      parsedCommand: 'man',
      context: { type: 'system', command: 'man' }
    });
  }

  private handleCustomCommand({
    username,
    data,
    session,
    input
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
  }): ExecuteCommandResult {
    const tokens = input.split(/\s+/);
    const matches = data.customCommands.filter((command) => this.matchesSyntax(tokens, command));

    if (matches.length === 0) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: `Unknown command: ${tokens[0]}. Type "help" for a list of commands.`
      });
    }

    const targetCommand = matches[0];
    const parseResult = this.parseArguments(tokens, targetCommand);

    if (!parseResult.ok) {
      return this.errorResponse({
        username,
        input,
        data,
        session,
        message: parseResult.error
      });
    }

    if (targetCommand.responseMode === 'gm') {
      return this.enqueuePendingExecution({
        username,
        data,
        session,
        input,
        parsedCommand: targetCommand.name,
        context: { type: 'custom-command', commandId: targetCommand.id, syntax: targetCommand.syntax },
        parsedParameters: parseResult.params,
        responseMessage: 'Command is executing...'
      });
    }

    const responseTemplate = targetCommand.autoResponseTemplate || 'Command completed successfully.';
    const response = this.applyTemplate(responseTemplate, parseResult.params, {
      filesystem: data.filesystem,
      currentPath: session.currentPath
    });

    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response,
      parsedCommand: targetCommand.name,
      context: { type: 'custom-command', commandId: targetCommand.id, syntax: targetCommand.syntax },
      parsedParameters: parseResult.params,
      commandId: targetCommand.id
    });
  }

  private logAndRespond({
    username,
    data,
    session,
    input,
    response,
    parsedCommand,
    context,
    parsedParameters,
    commandId
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    response: string;
    parsedCommand: string;
    context: TerminalExecutionContext;
    parsedParameters?: Record<string, any>;
    commandId?: string;
  }): ExecuteCommandResult {
    const execution = this.createExecution({
      username,
      input,
      parsedCommand,
      parsedParameters: parsedParameters || {},
      status: 'auto-responded',
      response,
      context,
      commandId
    });

    data.executionHistory.push(execution);

    return {
      status: 'auto-responded',
      response,
      currentPath: session.currentPath,
      execution,
      updatedData: data
    };
  }

  private enqueuePendingExecution({
    username,
    data,
    session,
    input,
    parsedCommand,
    context,
    parsedParameters,
    responseMessage
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    input: string;
    parsedCommand: string;
    context: TerminalExecutionContext;
    parsedParameters?: Record<string, any>;
    responseMessage: string;
  }): ExecuteCommandResult {
    const execution = this.createExecution({
      username,
      input,
      parsedCommand,
      parsedParameters: parsedParameters || {},
      status: 'pending',
      response: '',
      context
    });

    data.executionHistory.push(execution);

    return {
      status: 'pending',
      response: responseMessage,
      currentPath: session.currentPath,
      execution,
      updatedData: data
    };
  }

  private simpleResponse({
    username,
    input,
    data,
    session,
    response
  }: {
    username: string;
    input: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    response: string;
  }): ExecuteCommandResult {
    return this.logAndRespond({
      username,
      data,
      session,
      input,
      response,
      parsedCommand: 'exit',
      context: { type: 'system', command: 'exit' }
    });
  }

  private errorResponse({
    username,
    input,
    data,
    session,
    message
  }: {
    username: string;
    input: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    message: string;
  }): ExecuteCommandResult {
    const execution = this.createExecution({
      username,
      input,
      parsedCommand: 'error',
      parsedParameters: {},
      status: 'auto-responded',
      response: message,
      context: { type: 'system', command: 'error' }
    });

    data.executionHistory.push(execution);

    return {
      status: 'error',
      response: message,
      currentPath: session.currentPath,
      execution,
      updatedData: data
    };
  }

  private confirmDelete({
    username,
    data,
    session,
    targetPath
  }: {
    username: string;
    data: TerminalAppData;
    session: TerminalSessionState;
    targetPath: string;
  }): ExecuteCommandResult {
    const node = this.getNodeByPath(data.filesystem, targetPath);
    if (!node) {
      session.pendingConfirmation = undefined;
      return {
        status: 'error',
        response: `Path not found: ${targetPath}`,
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    if (!node.parentId) {
      session.pendingConfirmation = undefined;
      return {
        status: 'error',
        response: 'Root directory cannot be deleted.',
        currentPath: session.currentPath,
        updatedData: data
      };
    }

    this.removeNode(data.filesystem, node.id);
    session.pendingConfirmation = undefined;

    return this.logAndRespond({
      username,
      data,
      session,
      input: `delete ${targetPath}`,
      response: `Deleted ${targetPath}`,
      parsedCommand: 'delete',
      context: { type: 'system', command: 'delete' }
    });
  }

  private removeNode(filesystem: TerminalFileSystem, nodeId: string) {
    const node = filesystem.nodes[nodeId];
    if (!node) return;

    if (node.type === 'directory') {
      [...node.childrenIds].forEach((childId) => this.removeNode(filesystem, childId));
    }

    if (node.parentId) {
      const parent = filesystem.nodes[node.parentId];
      if (parent && parent.type === 'directory') {
        parent.childrenIds = parent.childrenIds.filter((id) => id !== nodeId);
      }
    }

    delete filesystem.nodes[nodeId];
  }

  private prepareDestination(
    filesystem: TerminalFileSystem,
    currentPath: string,
    destinationArg: string,
    fallbackName: string
  ) {
    const isDirectoryTarget = destinationArg.endsWith('/');
    const resolved = this.resolvePath(filesystem, currentPath, destinationArg);

    if (isDirectoryTarget) {
      const directory = this.getNodeByPath(filesystem, resolved);
      if (!directory || directory.type !== 'directory') {
        return null;
      }
      return { directory, name: fallbackName };
    }

    const existing = this.getNodeByPath(filesystem, resolved);
    if (existing && existing.type === 'directory') {
      return { directory: existing, name: fallbackName };
    }

    const { directoryPath, name } = this.splitPath(resolved);
    const directory = this.getNodeByPath(filesystem, directoryPath);
    if (!directory || directory.type !== 'directory') {
      return null;
    }

    return { directory, name };
  }

  private resolveBuiltInCommandName(token: string): string | null {
    const lower = token.toLowerCase();
    if (BUILT_IN_COMMANDS.some((command) => command.name === lower)) {
      return lower;
    }
    return COMMAND_ALIAS_LOOKUP[lower] || null;
  }

  private splitFlags(args: string[]): { flags: string[]; positional: string[] } {
    const flags: string[] = [];
    const positional: string[] = [];
    args.forEach((arg) => {
      if (arg.startsWith('-')) {
        flags.push(arg.toLowerCase());
      } else {
        positional.push(arg);
      }
    });
    return { flags, positional };
  }

  private hasFlag(flags: string[], ...candidates: string[]): boolean {
    return candidates.some((candidate) => flags.includes(candidate.toLowerCase()));
  }

  private formatWithLineNumbers(content: string): string {
    return content
      .split(/\r?\n/)
      .map((line, index) => `${String(index + 1).padStart(3, ' ')} | ${line}`)
      .join('\n');
  }

  private splitPath(path: string): { directoryPath: string; name: string } {
    const trimmed = path === '/' ? '/' : path.replace(/\/+$/, '');
    if (trimmed === '/') {
      return { directoryPath: '/', name: '' };
    }

    const parts = trimmed.split('/').filter(Boolean);
    const name = parts.pop() || '';
    const directoryPath = parts.length === 0 ? '/' : `/${parts.join('/')}`;
    return { directoryPath, name };
  }

  private formatDirectoryListing(
    filesystem: TerminalFileSystem,
    directory: TerminalDirectoryNode,
    path: string,
    options: { includeHidden?: boolean; longFormat?: boolean } = {}
  ): string {
    const includeHidden = Boolean(options.includeHidden);
    const longFormat = Boolean(options.longFormat);
    const lines: string[] = [`Directory: ${path}`];

    const entries = directory.childrenIds
      .map((id) => filesystem.nodes[id])
      .filter((node): node is TerminalNode => Boolean(node))
      .filter((node) => includeHidden || !node.hidden);

    if (entries.length === 0) {
      lines.push(includeHidden ? '(empty)' : 'No files match your filters. Use -hidden to reveal secret entries.');
      return lines.join('\n');
    }

    entries
      .sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      })
      .forEach((node) => {
        const perms = node.type === 'directory'
          ? `${node.permissions.read ? 'r' : '-'}${node.permissions.write ? 'w' : '-'}`
          : `${node.permissions.read ? 'r' : '-'}${node.permissions.write ? 'w' : '-'}${node.permissions.execute ? 'x' : '-'}`;
        const label = node.type === 'directory' ? `${node.name}/` : node.name;
        const hiddenLabel = node.hidden ? ' (hidden)' : '';

        if (longFormat) {
          const typeChar = node.type === 'directory' ? 'd' : '-';
          const timestamp = node.updatedAt ? new Date(node.updatedAt).toISOString() : '';
          lines.push(`${typeChar}${perms}  ${timestamp}  ${label}${hiddenLabel}`);
        } else {
          lines.push(`${node.type === 'directory' ? 'DIR' : 'FIL'} [${perms}] ${label}${hiddenLabel}`);
        }
      });

    return lines.join('\n');
  }

  private resolvePath(
    filesystem: TerminalFileSystem,
    currentPath: string,
    target: string
  ): string {
    const targetPath = target.startsWith('/') ? target : `${currentPath.replace(/\/$/, '')}/${target}`;
    return this.correctPath(filesystem, targetPath) || '/';
  }

  private correctPath(filesystem: TerminalFileSystem, path?: string | null): string | null {
    if (!path) return '/';
    if (path === '/') return '/';

    const parts = path.split('/');
    const stack: string[] = [];

    parts.forEach((part) => {
      if (!part || part === '.') {
        return;
      }
      if (part === '..') {
        stack.pop();
        return;
      }
      stack.push(part);
    });

    const normalized = `/${stack.join('/')}`;
    const node = this.getNodeByPath(filesystem, normalized);
    if (!node) {
      return normalized;
    }

    if (node.type === 'directory') {
      return normalized;
    }

    return normalized;
  }

  private getNodeByPath(filesystem: TerminalFileSystem, path: string): TerminalNode | undefined {
    if (!path || path === '/') {
      return filesystem.nodes[filesystem.rootId];
    }

    const parts = path.split('/').filter(Boolean);
    let current: TerminalNode | undefined = filesystem.nodes[filesystem.rootId];

    for (const part of parts) {
      if (!current || current.type !== 'directory') {
        return undefined;
      }

      const directoryNode = current as TerminalDirectoryNode;
      const nextId = directoryNode.childrenIds.find((childId) => filesystem.nodes[childId]?.name === part);
      if (!nextId) {
        return undefined;
      }

      current = filesystem.nodes[nextId];
    }

    return current;
  }

  private getPathForNode(filesystem: TerminalFileSystem, nodeId: string): string {
    const node = filesystem.nodes[nodeId];
    if (!node) return '/';
    const parts: string[] = [];
    let current: TerminalNode | undefined = node;

    while (current && current.parentId) {
      parts.unshift(current.name);
      current = filesystem.nodes[current.parentId];
    }

    return parts.length ? `/${parts.join('/')}` : '/';
  }

  private matchesSyntax(tokens: string[], command: TerminalCustomCommand): boolean {
    return this.tokenMatchesCommandTrigger(tokens[0], command);
  }

  private parseArguments(
    tokens: string[],
    command: TerminalCustomCommand
  ): { ok: true; params: Record<string, any> } | { ok: false; error: string } {
    const flagParse = this.parseFlagArguments(tokens, command);
    if (flagParse.mode === 'success') {
      return { ok: true, params: flagParse.params };
    }
    if (flagParse.mode === 'error') {
      return { ok: false, error: flagParse.error };
    }

    const syntaxTokens = this.tokenizeSyntax(command.syntax);
    const hasArgumentTokens = syntaxTokens.some((token) => token.type === 'argument');
    const firstLiteral = syntaxTokens.find((token) => token.type === 'literal');
    const startsWithLiteral = firstLiteral
      ? tokens[0]?.toLowerCase() === firstLiteral.value.toLowerCase()
      : false;

    if (hasArgumentTokens && startsWithLiteral) {
      return this.parseUsingSyntaxTokens(tokens, syntaxTokens, command);
    }

    return this.parseSequentialArguments(tokens, command);
  }

  private tokenizeSyntax(syntax: string): SyntaxToken[] {
    return syntax
      .split(/\s+/)
      .filter(Boolean)
      .map((chunk) => {
        if (chunk.startsWith('<') && chunk.endsWith('>')) {
          return { type: 'argument', name: chunk.slice(1, -1), required: true } as SyntaxTokenArgument;
        }
        if (chunk.startsWith('[') && chunk.endsWith(']')) {
          return { type: 'argument', name: chunk.slice(1, -1), required: false } as SyntaxTokenArgument;
        }
        return { type: 'literal', value: chunk } as SyntaxTokenLiteral;
      });
  }

  private parseUsingSyntaxTokens(
    tokens: string[],
    syntaxTokens: SyntaxToken[],
    command: TerminalCustomCommand
  ): { ok: true; params: Record<string, any> } | { ok: false; error: string } {
    const params: Record<string, any> = {};
    let cursor = 0;

    for (const token of syntaxTokens) {
      if (token.type === 'literal') {
        const current = tokens[cursor];
        if (!current || current.toLowerCase() !== token.value.toLowerCase()) {
          return { ok: false, error: `Expected command to start with "${token.value}".` };
        }
        cursor += 1;
        continue;
      }

      const argValue = tokens[cursor];
      if (!argValue) {
        const definition = command.arguments.find((arg) => arg.name === token.name);
        if (token.required) {
          if (definition?.defaultValue) {
            params[token.name] = definition.defaultValue;
            continue;
          }
          return { ok: false, error: `Missing value for ${token.name}.` };
        }
        if (definition?.defaultValue) {
          params[token.name] = definition.defaultValue;
        }
        continue;
      }

      const parsed = this.castArgument(argValue, token.name, command.arguments);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }

      params[token.name] = parsed.value;
      cursor += 1;
    }

    if (cursor < tokens.length) {
      return { ok: false, error: 'Too many arguments provided.' };
    }

    return { ok: true, params };
  }

  private parseSequentialArguments(
    tokens: string[],
    command: TerminalCustomCommand
  ): { ok: true; params: Record<string, any> } | { ok: false; error: string } {
    const params: Record<string, any> = {};
    if (!this.tokenMatchesCommandTrigger(tokens[0], command)) {
      return { ok: false, error: `Expected command to start with "${command.name}".` };
    }

    const values = tokens.slice(1);
    let cursor = 0;
    const definitions = command.arguments || [];

    for (const definition of definitions) {
      const nextValue = values[cursor];
      if (nextValue === undefined || nextValue === null) {
        if (definition.required) {
          if (definition.defaultValue) {
            params[definition.name] = definition.defaultValue;
          } else {
            return { ok: false, error: `Missing value for ${definition.name}.` };
          }
        } else if (definition.defaultValue) {
          params[definition.name] = definition.defaultValue;
        }
        continue;
      }

      const parsed = this.castArgument(nextValue, definition.name, definitions);
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }

      params[definition.name] = parsed.value;
      cursor += 1;
    }

    if (cursor < values.length) {
      return { ok: false, error: 'Too many arguments provided.' };
    }

    return { ok: true, params };
  }

  private parseFlagArguments(
    tokens: string[],
    command: TerminalCustomCommand
  ):
    | { mode: 'not-applicable' }
    | { mode: 'success'; params: Record<string, any> }
    | { mode: 'error'; error: string } {
    const [trigger, ...rest] = tokens;
    if (!rest.length) {
      return { mode: 'not-applicable' };
    }

    if (!this.tokenMatchesCommandTrigger(trigger, command)) {
      return { mode: 'not-applicable' };
    }

    if (!rest.some((token) => token.startsWith('-'))) {
      return { mode: 'not-applicable' };
    }

    const params: Record<string, any> = {};
    const definitions = command.arguments || [];
    if (definitions.length === 0) {
      return { mode: 'error', error: `${command.name} does not accept any arguments.` };
    }
    let index = 0;

    while (index < rest.length) {
      const token = rest[index];
      if (!token.startsWith('-')) {
        return {
          mode: 'error',
          error: `Unexpected value "${token}". Prefix argument names with -${definitions[0]?.name || 'argument'}.`
        };
      }

      const normalizedName = token.slice(1);
      if (!normalizedName) {
        return { mode: 'error', error: 'Argument flag cannot be empty (use -name value).' };
      }

      const definition = definitions.find((arg) => arg.name.toLowerCase() === normalizedName.toLowerCase());
      if (!definition) {
        return { mode: 'error', error: `Unknown argument "${normalizedName}".` };
      }

      index += 1;
      if (index >= rest.length) {
        return { mode: 'error', error: `Missing value for ${definition.name}.` };
      }

      const valueToken = rest[index];
      if (valueToken.startsWith('-')) {
        return { mode: 'error', error: `Missing value for ${definition.name}.` };
      }

      const parsed = this.castArgument(valueToken, definition.name, definitions);
      if (!parsed.ok) {
        return { mode: 'error', error: parsed.error };
      }

      params[definition.name] = parsed.value;
      index += 1;
    }

    for (const definition of definitions) {
      if (params[definition.name] !== undefined) {
        continue;
      }

      if (definition.defaultValue) {
        params[definition.name] = definition.defaultValue;
        continue;
      }

      if (definition.required) {
        return { mode: 'error', error: `Missing value for ${definition.name}.` };
      }
    }

    return { mode: 'success', params };
  }

  private getFirstLiteralValue(command: TerminalCustomCommand): string | null {
    const syntaxTokens = this.tokenizeSyntax(command.syntax);
    const literal = syntaxTokens.find((token) => token.type === 'literal');
    return literal ? literal.value : null;
  }

  private tokenMatchesCommandTrigger(token: string | undefined, command: TerminalCustomCommand): boolean {
    if (!token) {
      return false;
    }

    const literal = this.getFirstLiteralValue(command);
    if (literal && token.toLowerCase() === literal.toLowerCase()) {
      return true;
    }

    return token.toLowerCase() === (command.name || '').toLowerCase();
  }

  private castArgument(
    raw: string,
    name: string,
    definitions: TerminalCustomCommandArgument[]
  ): { ok: true; value: any } | { ok: false; error: string } {
    const definition = definitions.find((arg) => arg.name === name);
    if (!definition) {
      return { ok: true, value: raw };
    }

    if (definition.type === 'number') {
      const value = Number(raw);
      if (Number.isNaN(value)) {
        return { ok: false, error: `${name} must be a number.` };
      }
      return { ok: true, value };
    }

    if (definition.type === 'choice') {
      const allowed = definition.choices || [];
      if (allowed.length > 0 && !allowed.some((choice) => choice.toLowerCase() === raw.toLowerCase())) {
        return { ok: false, error: `${name} must be one of: ${allowed.join(', ')}` };
      }
      return { ok: true, value: raw };
    }

    return { ok: true, value: raw };
  }

  private applyTemplate(
    template: string,
    params: Record<string, any>,
    templateState: { filesystem: TerminalFileSystem; currentPath: string }
  ): string {
    try {
      const context = {
        ...params,
        args: params,
        parameters: params,
        cwd: templateState.currentPath
      };

      const compiled = templateEngine.compile(template, { noEscape: true });
      const data = {
        __fileReader: (path: string) => this.readFileForTemplate(templateState.filesystem, templateState.currentPath, path),
        __listFiles: (path?: string) => this.listFilesForTemplate(templateState.filesystem, templateState.currentPath, path)
      };

      const raw = compiled(context, { data });
      return this.finalizeTemplateOutput(raw);
    } catch (error) {
      return `Template error: ${(error as Error).message}`;
    }
  }

  private finalizeTemplateOutput(raw: string): string {
    const newlineMarkerRegex = new RegExp(TEMPLATE_NEWLINE_MARKER, 'g');
    const indentMarkerRegex = new RegExp(TEMPLATE_INDENT_MARKER, 'g');

    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const flattened = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' ')
      .trim();

    const withExplicitBreaks = flattened
      .replace(newlineMarkerRegex, '\n')
      .replace(/ +\n/g, '\n')
      .replace(/\n +/g, '\n');

    const withIndentation = withExplicitBreaks.replace(indentMarkerRegex, ' ');

    return withIndentation.trim();
  }

  private createExecution({
    username,
    input,
    parsedCommand,
    parsedParameters,
    status,
    response,
    context,
    commandId
  }: {
    username: string;
    input: string;
    parsedCommand: string;
    parsedParameters: Record<string, any>;
    status: TerminalCommandExecution['status'];
    response: string;
    context: TerminalExecutionContext;
    commandId?: string;
  }): TerminalCommandExecution {
    return {
      id: uuidv4(),
      commandId,
      username,
      input,
      parsedCommand,
      parsedParameters,
      timestamp: JSON.stringify(gameTimeService.getCurrentGameTime()),
      status,
      response,
      context
    };
  }

  private readFileForTemplate(
    filesystem: TerminalFileSystem,
    currentPath: string,
    requestedPath?: string
  ): string {
    const targetPath = requestedPath ? this.resolvePath(filesystem, currentPath, requestedPath) : currentPath;
    const node = this.getNodeByPath(filesystem, targetPath);
    if (!node) {
      return '';
    }
    if (node.type === 'file') {
      return node.openContent || '';
    }
    if (node.type === 'directory') {
      const listing = node.childrenIds
        .map((childId) => filesystem.nodes[childId])
        .filter((child): child is TerminalNode => Boolean(child))
        .map((child) => `${child.name}${child.type === 'directory' ? '/' : ''}`)
        .join('\n');
      return listing || '';
    }
    return '';
  }

  private listFilesForTemplate(
    filesystem: TerminalFileSystem,
    currentPath: string,
    requestedPath?: string
  ): TemplateFileInfo[] {
    const targetPath = requestedPath ? this.resolvePath(filesystem, currentPath, requestedPath) : currentPath;
    const node = this.getNodeByPath(filesystem, targetPath);
    if (!node) {
      return [];
    }

    if (node.type === 'directory') {
      return node.childrenIds
        .map((childId) => filesystem.nodes[childId])
        .filter((child): child is TerminalNode => Boolean(child))
        .map((child) => this.buildTemplateFileInfo(filesystem, child));
    }

    return [this.buildTemplateFileInfo(filesystem, node)];
  }

  private buildTemplateFileInfo(filesystem: TerminalFileSystem, node: TerminalNode): TemplateFileInfo {
    return {
      name: node.name,
      path: this.getPathForNode(filesystem, node.id),
      type: node.type,
      hidden: Boolean(node.hidden)
    };
  }
}

export default new TerminalService();
