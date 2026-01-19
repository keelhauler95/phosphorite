import { Router, Request, Response } from 'express';
import AppRepository from '../repositories/AppRepository';
import { AppCategory, SocketEvent, TerminalAppData } from '../types';
import { emitSocketEvent } from '../services/socketService';
import terminalService from '../services/terminalService';

const router = Router();
type TerminalAppRequest = Request<{ appId: string }>;
type TerminalExecutionRequest = Request<{ appId: string; executionId: string }>;

// Execute a terminal command
router.post('/:appId/execute', (req: TerminalAppRequest, res: Response) => {
  try {
    const appId = req.params.appId;
    const { username, input } = req.body;

    if (!username || !input) {
      return res.status(400).json({ error: 'Missing required fields: username, input' });
    }

    // Get the terminal app
    const app = AppRepository.findById(appId);
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (app.category !== AppCategory.TERMINAL) {
      return res.status(400).json({ error: 'App is not a Terminal app' });
    }

    const terminalData: TerminalAppData = terminalService.normalize(app.data);

    const commandResult = terminalService.execute({
      username,
      input: input.trim(),
      data: terminalData
    });

    const updatedApp = AppRepository.update(appId, { data: commandResult.updatedData });

    if (updatedApp) {
      emitSocketEvent(SocketEvent.APP_UPDATED, updatedApp);

      if (commandResult.execution) {
        if (commandResult.status === 'pending') {
          emitSocketEvent(SocketEvent.TERMINAL_COMMAND_QUEUED, {
            appId,
            execution: commandResult.execution
          });
        } else if (commandResult.status === 'auto-responded') {
          emitSocketEvent(SocketEvent.TERMINAL_COMMAND_EXECUTED, {
            appId,
            execution: commandResult.execution
          });
        }
      }
    }

    return res.json({
      status: commandResult.status,
      executionId: commandResult.execution?.id,
      response: commandResult.response,
      currentPath: commandResult.currentPath
    });

  } catch (error) {
    console.error('Error executing terminal command:', error);
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

router.post('/:appId/test', (req: TerminalAppRequest, res: Response) => {
  try {
    const appId = req.params.appId;
    const { username, input } = req.body;

    if (!username || !input) {
      return res.status(400).json({ error: 'Missing required fields: username, input' });
    }

    const app = AppRepository.findById(appId);

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (app.category !== AppCategory.TERMINAL) {
      return res.status(400).json({ error: 'App is not a Terminal app' });
    }

    const terminalData: TerminalAppData = terminalService.normalize(app.data);
    const clonedData: TerminalAppData = JSON.parse(JSON.stringify(terminalData));

    const commandResult = terminalService.execute({
      username,
      input: input.trim(),
      data: clonedData
    });

    if (commandResult.execution) {
      commandResult.execution.isTest = true;
      const historyIndex = commandResult.updatedData.executionHistory.findIndex(
        (entry) => entry.id === commandResult.execution?.id
      );
      if (historyIndex >= 0) {
        commandResult.updatedData.executionHistory[historyIndex] = {
          ...commandResult.updatedData.executionHistory[historyIndex],
          isTest: true
        };
        commandResult.execution = commandResult.updatedData.executionHistory[historyIndex];
      }
    }

    const updatedApp = AppRepository.update(appId, { data: commandResult.updatedData });

    if (updatedApp) {
      emitSocketEvent(SocketEvent.APP_UPDATED, updatedApp);

      if (commandResult.execution) {
        const eventPayload = {
          appId,
          execution: commandResult.execution
        };

        if (commandResult.status === 'pending') {
          emitSocketEvent(SocketEvent.TERMINAL_COMMAND_QUEUED, eventPayload);
        } else if (commandResult.status === 'auto-responded') {
          emitSocketEvent(SocketEvent.TERMINAL_COMMAND_EXECUTED, eventPayload);
        }
      }
    }

    return res.json({
      status: commandResult.status,
      response: commandResult.response,
      currentPath: commandResult.currentPath,
      executionId: commandResult.execution?.id,
      execution: commandResult.execution
    });
  } catch (error) {
    console.error('Error testing terminal command:', error);
    res.status(500).json({ error: 'Failed to test command' });
  }
});

// Get execution status (for polling pending commands)
router.get('/:appId/execution/:executionId', (req: TerminalExecutionRequest, res: Response) => {
  try {
    const appId = req.params.appId;
    const executionId = req.params.executionId;

    const app = AppRepository.findById(appId);
    
    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (app.category !== AppCategory.TERMINAL) {
      return res.status(400).json({ error: 'App is not a Terminal app' });
    }

    const terminalData: TerminalAppData = app.data || { commands: [], executionHistory: [] };
    const execution = terminalData.executionHistory.find(ex => ex.id === executionId);

    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    res.json(execution);
  } catch (error) {
    console.error('Error fetching execution status:', error);
    res.status(500).json({ error: 'Failed to fetch execution status' });
  }
});

export default router;
