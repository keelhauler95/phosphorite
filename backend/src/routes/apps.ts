import { Router, Request, Response } from 'express';
import AppRepository from '../repositories/AppRepository';
import { SocketEvent, AppCategory, TelemetryAppData, MonitoringGroup, NumericalParameter, TextualParameter, MapAppData } from '../types';
import { emitSocketEvent } from '../services/socketService';
import { saveDatabase } from '../db/database';
import { normalizeMapAppData } from '../utils/mapAppData';

const router = Router();
type AppIdRequest = Request<{ id: string }>;

const isNumericalParam = (param: NumericalParameter | TextualParameter): param is NumericalParameter => {
  return (param as NumericalParameter).targetValue !== undefined;
};

const preserveTelemetryParameterValues = (
  previous?: TelemetryAppData | null,
  incoming?: TelemetryAppData | null
): TelemetryAppData | undefined => {
  if (!previous || !incoming) return incoming || undefined;
  const previousGroups = new Map(previous.monitoringGroups.map((group) => [group.name, group]));
  const mergedGroups = incoming.monitoringGroups.map((group) => {
    const existingGroup = previousGroups.get(group.name);
    if (!existingGroup) return group;
    const previousParams = new Map(existingGroup.parameters.map((param) => [param.name, param]));
    return {
      ...group,
      parameters: group.parameters.map((param) => {
        if (!isNumericalParam(param)) return param;
        const existing = previousParams.get(param.name);
        if (existing && isNumericalParam(existing) && typeof existing.value === 'number') {
          return { ...param, value: existing.value };
        }
        return param;
      })
    } as MonitoringGroup;
  });
  return { ...incoming, monitoringGroups: mergedGroups };
};

// Get all apps
router.get('/', (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const apps = category
      ? AppRepository.findByCategory(category)
      : AppRepository.findAll();

    res.json(apps);
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({ error: 'Failed to fetch apps' });
  }
});

// Update app order
router.put('/reorder', (req: Request, res: Response) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array of app IDs' });
    }

    const apps = AppRepository.reorder(order);
    saveDatabase();

    apps.forEach(app => emitSocketEvent(SocketEvent.APP_UPDATED, app));
    res.json({ success: true, apps });
  } catch (error) {
    console.error('Error reordering apps:', error);
    res.status(500).json({ error: 'Failed to reorder apps' });
  }
});

// Get app by ID
router.get('/:id', (req: AppIdRequest, res: Response) => {
  try {
    const id = req.params.id;
    const app = AppRepository.findById(id);

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    res.json(app);
  } catch (error) {
    console.error('Error fetching app:', error);
    res.status(500).json({ error: 'Failed to fetch app' });
  }
});

// Create new app
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, category, allowed_users, data } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Missing required fields: name, category' });
    }

    // Validate category
    if (!Object.values(AppCategory).includes(category as AppCategory)) {
      return res.status(400).json({ error: 'Invalid app category' });
    }

    const processedData = category === AppCategory.MAP
      ? normalizeMapAppData((data as MapAppData) || { markers: [], masks: [] })
      : data;

    const app = AppRepository.create({
      name,
      category: category as AppCategory,
      allowed_users: allowed_users || [],
      data: processedData || null
    });

    // Save database to persist changes
    saveDatabase();

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.APP_CREATED, app);

    res.status(201).json(app);
  } catch (error) {
    console.error('Error creating app:', error);
    res.status(500).json({ error: 'Failed to create app' });
  }
});

// Update app
router.patch('/:id', (req: AppIdRequest, res: Response) => {
  try {
    const id = req.params.id;
    const updates = req.body;

    // Validate category if provided
    if (updates.category && !Object.values(AppCategory).includes(updates.category as AppCategory)) {
      return res.status(400).json({ error: 'Invalid app category' });
    }

    const oldApp = AppRepository.findById(id);
    const nextUpdates = { ...updates };
    const targetCategory = (nextUpdates.category as AppCategory) || oldApp?.category;

    if (oldApp?.category === AppCategory.TELEMETRY && nextUpdates.data) {
      nextUpdates.data = preserveTelemetryParameterValues(oldApp.data as TelemetryAppData | null, nextUpdates.data as TelemetryAppData);
    }

    if (targetCategory === AppCategory.MAP && nextUpdates.data) {
      nextUpdates.data = normalizeMapAppData(nextUpdates.data as MapAppData) || nextUpdates.data;
    }

    const app = AppRepository.update(id, nextUpdates);

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Save database to persist changes
    saveDatabase();

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.APP_UPDATED, app);

    // Check if this is a terminal app update with execution history changes
    if (app.category === AppCategory.TERMINAL && oldApp && updates.data?.executionHistory) {
      const oldHistory = oldApp.data?.executionHistory || [];
      const newHistory = updates.data.executionHistory;

      console.log('[APPS] Checking for terminal command responses...');
      console.log('[APPS] Old history length:', oldHistory.length);
      console.log('[APPS] New history length:', newHistory.length);

      // Find newly responded executions (status changed from pending to approved/rejected)
      newHistory.forEach((execution: any) => {
        const oldExecution = oldHistory.find((e: any) => e.id === execution.id);
        
        console.log('[APPS] Checking execution:', execution.id);
        console.log('[APPS] Old status:', oldExecution?.status, 'New status:', execution.status);
        
        if (oldExecution?.status === 'pending' && (execution.status === 'approved' || execution.status === 'rejected')) {
          // GM has responded to a pending command
          console.log('[APPS] ✅ Emitting TERMINAL_COMMAND_RESPONDED for execution:', execution.id);
          emitSocketEvent(SocketEvent.TERMINAL_COMMAND_RESPONDED, {
            appId: id,
            execution
          });
        }
      });
    }

    res.json(app);
  } catch (error) {
    console.error('Error updating app:', error);
    res.status(500).json({ error: 'Failed to update app' });
  }
});

// Delete app
router.delete('/:id', (req: AppIdRequest, res: Response) => {
  try {
    const id = req.params.id;
    const deleted = AppRepository.delete(id);

    if (!deleted) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Save database to persist changes
    saveDatabase();

    // Emit socket event for real-time update
    emitSocketEvent(SocketEvent.APP_DELETED, { id });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting app:', error);
    res.status(500).json({ error: 'Failed to delete app' });
  }
});

export default router;
