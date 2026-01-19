import { Router, Request, Response } from 'express';
import AppRepository from '../repositories/AppRepository';
import CharacterRepository from '../repositories/CharacterRepository';
import { messageRepository } from '../repositories/MessageRepository';
import gameTimeService from '../services/gameTimeService';
import { emitSocketEvent } from '../services/socketService';
import { LLMChatAppData, LLMChatMessage, App, LogbookAppData, TelemetryAppData, TerminalAppData, NumericalParameter, SocketEvent, LLMChatPreset, GameTime, TextualParameter, TerminalCustomCommand, TerminalCustomCommandArgument } from '../types';
import * as https from 'https';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
type LlmAppRequest = Request<{ appId: string }>;

function normalizePresets(appData: LLMChatAppData): LLMChatPreset[] {
  if (appData.presets && Array.isArray(appData.presets) && appData.presets.length > 0) {
    return appData.presets.filter(Boolean) as LLMChatPreset[];
  }

  if (appData.endpoint || appData.apiToken || appData.model) {
    return [{
      id: 'legacy-default',
      label: appData.modelName || 'Default Agent',
      endpoint: appData.endpoint || '',
      modelName: appData.modelName || '',
      model: appData.model || '',
      apiToken: appData.apiToken || '',
      systemInstructions: appData.systemInstructions || ''
    }];
  }

  return [];
}

function getActivePreset(appData: LLMChatAppData): LLMChatPreset | null {
  const presets = normalizePresets(appData);
  if (presets.length === 0) {
    return null;
  }

  if (appData.activePresetId) {
    const match = presets.find(preset => preset.id === appData.activePresetId);
    if (match) {
      return match;
    }
  }

  return presets[0];
}

function formatGameTime(gameTime: GameTime): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Era ${gameTime.era}, Day ${gameTime.day} ${pad(gameTime.hour)}:${pad(gameTime.minute)}:${pad(gameTime.second)}`;
}

const formatNumber = (value: number): string => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 'n/a';
  }
  return Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(2);
};

interface LegacyTerminalCommandParameter {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

interface LegacyTerminalCommand {
  id?: string;
  name?: string;
  description?: string;
  parameters?: LegacyTerminalCommandParameter[];
  requiresManualReview?: boolean;
  responseTemplate?: string;
}

const argumentTypeFromLegacy = (paramType?: string): TerminalCustomCommandArgument['type'] => {
  if (paramType === 'number') {
    return 'number';
  }
  if (paramType === 'boolean') {
    return 'choice';
  }
  return 'string';
};

const convertLegacyTerminalCommand = (legacy: LegacyTerminalCommand): TerminalCustomCommand => {
  const syntaxParts = [legacy.name || 'command'];
  (legacy.parameters || []).forEach((param) => {
    syntaxParts.push(param.required ? `<${param.name}>` : `[${param.name}]`);
  });

  return {
    id: legacy.id || uuidv4(),
    name: legacy.name || 'command',
    syntax: syntaxParts.join(' ').trim(),
    description: legacy.description || 'Legacy command',
    arguments: (legacy.parameters || []).map((param) => ({
      name: param.name,
      type: argumentTypeFromLegacy(param.type),
      required: Boolean(param.required),
      description: param.description,
      choices: param.type === 'boolean' ? ['true', 'false'] : []
    })),
    responseMode: legacy.requiresManualReview ? 'gm' : 'auto',
    autoResponseTemplate: legacy.responseTemplate || ''
  };
};

const collectTerminalCommands = (terminalData?: TerminalAppData | Record<string, any>): TerminalCustomCommand[] => {
  if (!terminalData) {
    return [];
  }

  const commands = Array.isArray((terminalData as TerminalAppData).customCommands)
    ? (terminalData as TerminalAppData).customCommands
    : [];

  const visible = commands.filter((command) => !command.hidden);

  if (commands.length > 0) {
    return visible;
  }

  if (Array.isArray((terminalData as any).commands)) {
    return (terminalData as any).commands.map((legacy: LegacyTerminalCommand) => convertLegacyTerminalCommand(legacy));
  }

  return [];
};

interface TelemetryStatus {
  label: 'NOMINAL' | 'WARNING LOW' | 'WARNING HIGH' | 'ALERT LOW' | 'ALERT HIGH';
}

function describeTelemetryStatus(param: NumericalParameter): { status: TelemetryStatus; warningLow: number; warningHigh: number; alertLow: number; alertHigh: number } {
  const warningLow = typeof param.warningLower === 'number' ? param.warningLower : param.lowerLimit;
  const warningHigh = typeof param.warningUpper === 'number' ? param.warningUpper : param.upperLimit;
  const alertLow = typeof param.criticalLower === 'number' ? param.criticalLower : warningLow;
  const alertHigh = typeof param.criticalUpper === 'number' ? param.criticalUpper : warningHigh;
  const value = param.value;

  if (value <= alertLow) {
    return { status: { label: 'ALERT LOW' }, warningLow, warningHigh, alertLow, alertHigh };
  }
  if (value >= alertHigh) {
    return { status: { label: 'ALERT HIGH' }, warningLow, warningHigh, alertLow, alertHigh };
  }
  if (value <= warningLow) {
    return { status: { label: 'WARNING LOW' }, warningLow, warningHigh, alertLow, alertHigh };
  }
  if (value >= warningHigh) {
    return { status: { label: 'WARNING HIGH' }, warningLow, warningHigh, alertLow, alertHigh };
  }
  return { status: { label: 'NOMINAL' }, warningLow, warningHigh, alertLow, alertHigh };
}

/**
 * Gather comprehensive context about the user for the AI
 */
async function gatherUserContext(username: string, contextOptions?: any): Promise<string> {
  const contextParts: string[] = [];

  // Default context options (explicitly opt-in to avoid unintended ship-AI behavior)
  const options = {
    includeGameTime: contextOptions?.includeGameTime ?? false,
    includeUserProfile: contextOptions?.includeUserProfile ?? false,
    includeMessages: contextOptions?.includeMessages ?? false,
    includeLogbooks: contextOptions?.includeLogbooks ?? false,
    includeTelemetry: contextOptions?.includeTelemetry ?? false,
    includeTerminalCommands: contextOptions?.includeTerminalCommands ?? false
  };

  // 0. Get current game time
  if (options.includeGameTime) {
    const currentTime = gameTimeService.getCurrentGameTime();
    contextParts.push(`CURRENT GAME TIME:`);
    contextParts.push(`- Era: ${currentTime.era}, Day: ${currentTime.day}`);
    contextParts.push(`- Time: ${String(currentTime.hour).padStart(2, '0')}:${String(currentTime.minute).padStart(2, '0')}:${String(currentTime.second).padStart(2, '0')}`);
    contextParts.push(``);
  }

  // 1. Get user details
  if (options.includeUserProfile) {
  const character = await CharacterRepository.findByUsername(username);
  if (character) {
    contextParts.push(`USER PROFILE:`);
    contextParts.push(`- Username: ${character.username}`);
    contextParts.push(`- Name: ${character.first_name} ${character.last_name}`);
    contextParts.push(`- Title: ${character.title}`);
    if (character.background) {
      contextParts.push(`- Background: ${character.background}`);
    }
    if (character.personality) {
      contextParts.push(`- Personality: ${character.personality}`);
    }
    if (character.fear) {
      contextParts.push(`- Fear: ${character.fear}`);
    }
    if (character.secret) {
      contextParts.push(`- Secret: ${character.secret}`);
    }
    if (character.motivation) {
      contextParts.push(`- Motivation: ${character.motivation}`);
    }
    if (character.agenda) {
      contextParts.push(`- Agenda: ${character.agenda}`);
    }
    contextParts.push(``);
  }
  }

  // 2. Get all apps the user has permission for
  const allApps = AppRepository.findAll();
  const userApps = allApps.filter(app => 
    app.allowed_users.includes(username) || app.allowed_users.includes('*')
  );

  // 3. Get messages sent and received
  if (options.includeMessages) {
  const sentMessages = await messageRepository.findSentByUser(username);
  const receivedMessages = await messageRepository.findInbox(username);
  
  if (sentMessages.length > 0 || receivedMessages.length > 0) {
    contextParts.push(`MESSAGES:`);
    
    if (receivedMessages.length > 0) {
      contextParts.push(`\nReceived Messages (${receivedMessages.length} total, showing last 5):`);
      // Include last 5 messages (reduced from 10)
      receivedMessages.slice(0, 5).forEach(msg => {
        const readStatus = msg.read_status[username] ? 'read' : 'unread';
        contextParts.push(`  - From: ${msg.sender} | Subject: "${msg.subject}" | Status: ${readStatus}`);
        // Truncate long message bodies to 150 chars
        contextParts.push(`    Body: ${msg.body.substring(0, 150)}${msg.body.length > 150 ? '...' : ''}`);
      });
    }
    
    if (sentMessages.length > 0) {
      contextParts.push(`\nSent Messages (${sentMessages.length} total, showing last 3):`);
      // Include last 3 sent messages (reduced from 5)
      sentMessages.slice(0, 3).forEach(msg => {
        contextParts.push(`  - To: ${msg.recipients.join(', ')} | Subject: "${msg.subject}"`);
        // Truncate long message bodies to 150 chars
        contextParts.push(`    Body: ${msg.body.substring(0, 150)}${msg.body.length > 150 ? '...' : ''}`);
      });
    }
    contextParts.push(``);
  }
  }

  // 4. Get logbook entries from accessible log apps
  if (options.includeLogbooks) {
  const logApps = userApps.filter(app => app.category === 'Logbook');
  if (logApps.length > 0) {
    contextParts.push(`LOGBOOK ENTRIES:`);
    logApps.forEach(app => {
      const logData = app.data as LogbookAppData;
      if (logData && logData.entries && logData.entries.length > 0) {
        contextParts.push(`\nFrom Log: ${app.name} (${logData.entries.length} total, showing last 5):`);
        // Include last 5 entries (reduced from 10)
        logData.entries.slice(0, 5).forEach(entry => {
          // Truncate long log entries to 150 chars
          const text = entry.text.length > 150 ? entry.text.substring(0, 150) + '...' : entry.text;
          contextParts.push(`  - [${entry.severity.toUpperCase()}] ${entry.author}: ${text}`);
        });
      }
    });
    contextParts.push(``);
  }
  }

  // 5. Get telemetry values from accessible telemetry apps
  if (options.includeTelemetry) {
  const telemetryApps = userApps.filter(app => app.category === 'Telemetry');
  if (telemetryApps.length > 0) {
    contextParts.push(`TELEMETRY DATA:`);
    telemetryApps.forEach(app => {
      const telemetryData = app.data as TelemetryAppData;
      if (telemetryData && telemetryData.monitoringGroups) {
        contextParts.push(`\nFrom System: ${app.name}`);
        telemetryData.monitoringGroups.forEach(group => {
          contextParts.push(`  ${group.name}:`);
          group.parameters.forEach(param => {
            if ('value' in param && typeof param.value === 'number') {
              const numParam = param as NumericalParameter;
              const { status, warningLow, warningHigh, alertLow, alertHigh } = describeTelemetryStatus(numParam);
              const valueStr = formatNumber(numParam.value);
              const unitSuffix = numParam.unit ? numParam.unit : '';
              contextParts.push(`    - ${param.name}: ${valueStr}${unitSuffix} | Status: ${status.label}`);
            } else {
              const textParam = param as TextualParameter;
              const expected = textParam.expectedValue?.trim();
              const matchesExpectation = expected ? textParam.value === expected : true;
              const statusLabel = matchesExpectation ? 'NOMINAL' : 'ALERT TEXT MISMATCH';
              const expectationText = expected ? `Expected: "${expected}"` : 'No expected value';
              contextParts.push(`    - ${param.name}: ${textParam.value}${textParam.unit} | Status: ${statusLabel} | ${expectationText}`);
            }
          });
        });
      }
    });
    contextParts.push(``);
  }
  }

  // 6. Get available terminal commands from accessible terminal apps
  if (options.includeTerminalCommands) {
  const terminalApps = userApps.filter(app => app.category === 'Terminal');
  if (terminalApps.length > 0) {
    contextParts.push(`AVAILABLE TERMINAL COMMANDS:`);
    terminalApps.forEach(app => {
      const terminalData = app.data as TerminalAppData;
      const customCommands = collectTerminalCommands(terminalData);
      if (customCommands.length === 0) {
        return;
      }

      contextParts.push(`\nTerminal: ${app.name}`);
      customCommands.forEach((cmd: TerminalCustomCommand) => {
        contextParts.push(`  - ${cmd.name}: ${cmd.description}`);
        if (cmd.syntax) {
          contextParts.push(`    Syntax: ${cmd.syntax}`);
        }
        if (cmd.arguments.length > 0) {
          contextParts.push(`    Arguments:`);
          cmd.arguments.forEach((param: TerminalCustomCommandArgument) => {
            const req = param.required ? 'required' : 'optional';
            const choiceSuffix = param.type === 'choice' && param.choices?.length ? ` Choices: ${param.choices.join(', ')}` : '';
            const descriptionSuffix = param.description ? `: ${param.description}` : '';
            contextParts.push(`      - ${param.name} (${param.type}, ${req})${descriptionSuffix}${choiceSuffix}`);
          });
        }
        if (cmd.responseMode === 'gm') {
          contextParts.push(`    Response Mode: GM review required`);
        }
      });
    });
    contextParts.push(``);
  }
  }

  return contextParts.join('\n');
}

// Send a message to the LLM and get a response
router.post('/:appId/chat', async (req: LlmAppRequest, res: Response) => {
  try {
    const { appId } = req.params;
    const { message, conversationHistory, username } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get app configuration
    const app = await AppRepository.findById(appId);
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appData = app.data as LLMChatAppData;
    const activePreset = appData ? getActivePreset(appData) : null;
    if (!appData || !activePreset || !activePreset.endpoint || !activePreset.apiToken || !activePreset.model) {
      return res.status(400).json({ error: 'App is not properly configured' });
    }

    // Use client-provided conversation history for session-only memory
    const sessionConversationHistory: LLMChatMessage[] = Array.isArray(conversationHistory)
      ? conversationHistory.filter((msg: any) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
      : [];

    // Gather user context (pass context options from preset)
    const userContext = await gatherUserContext(username, activePreset.contextOptions);
    const contextSnapshotTime = gameTimeService.getCurrentGameTime();
    const formattedContextTime = formatGameTime(contextSnapshotTime);

    // Build messages array for API call
    const messages: Array<{ role: string; content: string }> = [];

    // Add static system instructions first so they always anchor the conversation
    if (activePreset.systemInstructions && activePreset.systemInstructions.trim().length > 0) {
      messages.push({
        role: 'system',
        content: activePreset.systemInstructions.trim()
      });
    }

    // Provide the freshly collected context snapshot immediately after system behavior
    if (userContext && userContext.trim().length > 0) {
      const contextHeader = `CURRENT USER CONTEXT — refreshed at ${formattedContextTime}`;
      const contextFooter = `\n\nINSTRUCTION: The data above reflects the latest context snapshot. ` +
        `If it conflicts with earlier dialogue, treat this snapshot as authoritative.`;
      messages.push({
        role: 'system',
        content: `${contextHeader}\n\n${userContext}${contextFooter}`
      });
    }

    // Add user-specific conversation history (not from client, from server storage)
    sessionConversationHistory.forEach((msg: LLMChatMessage) => {
      if (msg.role !== 'system') {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    });

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call the LLM API (OpenAI-compatible format)
    try {
      // Ensure endpoint ends with /chat/completions
      let endpoint = activePreset.endpoint.trim();
      if (!endpoint.endsWith('/chat/completions')) {
        // Add /chat/completions if not present
        endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
      }
      
      const url = new URL(endpoint);
      const postData = JSON.stringify({
        model: activePreset.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000  // Increased from 1000 to allow for larger responses with context
      });

      console.log('LLM API Request:');
      console.log('  Endpoint:', endpoint);
      console.log('  Model:', activePreset.model);
      console.log('  Messages count:', messages.length);
      console.log('  Request body:', postData);

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activePreset.apiToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 30000
      };

      const response = await new Promise<any>((resolve, reject) => {
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';
          console.log('LLM API Response status:', res.statusCode);
          console.log('LLM API Response headers:', JSON.stringify(res.headers, null, 2));
          
          res.on('data', (chunk) => { 
            data += chunk; 
          });
          res.on('end', () => {
            console.log('LLM API Response body:', data.substring(0, 500)); // Log first 500 chars
            
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              console.error('Failed to parse JSON response:', e);
              console.error('Raw response:', data);
              reject(new Error('Invalid JSON response'));
            }
          });
        });
        req.on('error', (err) => {
          console.error('LLM API Request error:', err);
          reject(err);
        });
        req.on('timeout', () => {
          console.error('LLM API Request timeout');
          reject(new Error('Request timeout'));
        });
        req.write(postData);
        req.end();
      });

      console.log('LLM API parsed response:', JSON.stringify(response, null, 2));

      // Check for token limit issues
      const finishReason = response?.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        console.error('LLM API hit token limit. Prompt tokens:', response?.usage?.prompt_tokens, 'Max tokens:', 4000);
        throw new Error('Response was cut off due to token limit. Try reducing context size or increasing max_tokens.');
      }

      // Extract assistant reply
      const assistantMessage = response?.choices?.[0]?.message?.content;
      
      if (!assistantMessage) {
        console.error('No assistant message found in response. Response structure:', JSON.stringify(response, null, 2));
        
        // Provide more specific error based on finish_reason
        if (finishReason === 'content_filter') {
          throw new Error('Response blocked by content filter');
        } else if (finishReason === 'stop') {
          throw new Error('Model returned empty response');
        } else {
          throw new Error('No response from model');
        }
      }

      console.log('LLM API success, message length:', assistantMessage.length);

      // Get current game time for timestamp
      const currentTime = gameTimeService.getCurrentGameTime();
      const timestamp = JSON.stringify(currentTime);

      // Build interaction entry for live GM visibility (not persisted)
      const historyEntry = {
        id: uuidv4(),
        username: username,
        userMessage: message,
        aiResponse: assistantMessage,
        timestamp: timestamp
      };

      // Emit socket event for real-time updates in GM client
      emitSocketEvent(SocketEvent.LLM_CHAT_INTERACTION, {
        appId: appId,
        historyEntry: historyEntry
      });

      res.json({
        success: true,
        message: assistantMessage
      });

    } catch (apiError: any) {
      console.error('LLM API error:', apiError.message);
      
      // Return error in the format requested by user
      res.json({
        success: false,
        error: `ERROR: ${(activePreset && activePreset.modelName) || appData.modelName || 'AI Agent'} does not have a valid reply`
      });
    }

  } catch (error) {
    console.error('Error in LLM chat route:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

export default router;
