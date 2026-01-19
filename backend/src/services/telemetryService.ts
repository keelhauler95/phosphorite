import AppRepository from '../repositories/AppRepository';
import { App, NumericalParameter, TextualParameter, MonitoringGroup, TelemetryAppData, AppCategory } from '../types';
import { emitSocketEvent } from './socketService';
import { SocketEvent } from '../types';
import gameTimeService from './gameTimeService';

const RESPONSE_MIN_SETTLE_SECONDS = 1; // instantaneous response
const RESPONSE_MAX_SETTLE_SECONDS = 24 * 60 * 60; // ~24 hours
const RESPONSE_EXPONENT = 7.2; // ensures midpoint ≈10 minutes
const RESPONSE_EPSILON = 0.0001;
const TARGET_ERROR_RATIO = 0.01; // 1% of original error

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const sliderToSettleSeconds = (rawResponsiveness: number): number => {
  const r = clamp01(rawResponsiveness);
  if (r <= RESPONSE_EPSILON) return Infinity;
  if (r >= 1 - RESPONSE_EPSILON) return RESPONSE_MIN_SETTLE_SECONDS;
  const pow = Math.pow(1 - r, RESPONSE_EXPONENT);
  return RESPONSE_MIN_SETTLE_SECONDS + (RESPONSE_MAX_SETTLE_SECONDS - RESPONSE_MIN_SETTLE_SECONDS) * pow;
};

const computeStepFactor = (rawResponsiveness: number): number => {
  const r = clamp01(rawResponsiveness);
  if (r <= RESPONSE_EPSILON) return 0;
  if (r >= 1 - RESPONSE_EPSILON) return 1;
  const settleSeconds = sliderToSettleSeconds(r);
  if (!isFinite(settleSeconds) || settleSeconds <= 0) return 0;
  return 1 - Math.pow(TARGET_ERROR_RATIO, 1 / settleSeconds);
};

class TelemetryService {
  private appRepository = AppRepository;
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;

  /**
   * Start the telemetry simulation
   * Updates will happen both on game time ticks AND continuously when game time is running
   */
  start() {
    if (this.isRunning) {
      console.log('Telemetry simulation already running');
      return;
    }

    this.isRunning = true;
    console.log('Telemetry simulation started');

    // Run updates every second to check if game time is running
    this.updateInterval = setInterval(() => {
      const gameTimeState = gameTimeService.getState();
      
      // Only update if game time is not paused
      if (!gameTimeState.is_paused) {
        this.updateAllTelemetryApps();
      }
    }, 1000);
  }

  /**
   * Stop the telemetry simulation
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('Telemetry simulation stopped');
  }

  /**
   * Called by game time service on each game time update (manual changes)
   */
  public onGameTimeTick() {
    if (this.isRunning) {
      this.updateAllTelemetryApps();
    }
  }

  /**
   * Update all telemetry apps with the simulation formula
   */
  private updateAllTelemetryApps() {
    try {
      // Get all telemetry apps
      const allApps = this.appRepository.findAll();
      const telemetryApps = allApps.filter((app: App) => app.category === AppCategory.TELEMETRY);

      for (const app of telemetryApps) {
        this.updateTelemetryApp(app);
      }
    } catch (error) {
      console.error('Error updating telemetry apps:', error);
    }
  }

  /**
   * Update a single telemetry app's numerical parameters
   */
  private updateTelemetryApp(app: App) {
    if (!app.data) return;

    const telemetryData = app.data as TelemetryAppData;
    let hasChanges = false;

    // Iterate through all monitoring groups
    for (const group of telemetryData.monitoringGroups) {
      for (let i = 0; i < group.parameters.length; i++) {
        const param = group.parameters[i];

        // Only update numerical parameters
        if (this.isNumericalParameter(param)) {
          const newValue = this.simulateNumericalParameter(param);
          
          // Only update if the value actually changed
          if (newValue !== param.value) {
            param.value = newValue;
            hasChanges = true;
          }
        }
      }
    }

    // Save and broadcast changes if any parameters were updated
    if (hasChanges) {
      this.appRepository.update(app.id, { data: telemetryData });
      
      // Broadcast the update to all connected clients
      const updatedApp = this.appRepository.findById(app.id);
      if (updatedApp) {
        emitSocketEvent(SocketEvent.APP_UPDATED, updatedApp);
      }
    }
  }

  /**
   * Type guard to check if a parameter is numerical
   */
  private isNumericalParameter(param: NumericalParameter | TextualParameter): param is NumericalParameter {
    return 'targetValue' in param;
  }

  /**
   * Apply the simulation formula to a numerical parameter
   * Formula: new_value = current_value + responsiveness * (target - current_value) + random_noise
   * Where random_noise is a random number between -noise and +noise
   * Note: lowerLimit and upperLimit are visual thresholds for warnings, not hard constraints
   */
  private simulateNumericalParameter(param: NumericalParameter): number {
    const { value, targetValue } = param;

    // Ensure responsiveness and noise exist and are numbers (fallbacks)
    const responsiveness = typeof (param as any).responsiveness === 'number' ? (param as any).responsiveness : 0.1;
    const noise = typeof (param as any).noise === 'number' ? (param as any).noise : 0;

    const clampedResponsiveness = clamp01(responsiveness);
    const stepFactor = computeStepFactor(clampedResponsiveness);

    let newValue = value;
    if (stepFactor >= 1) {
      newValue = targetValue;
    } else if (stepFactor > 0) {
      newValue += (targetValue - value) * stepFactor;
    }

    // Scale stochastic noise so it doesn't completely overwhelm the deterministic movement.
    // When responsiveness is high (r close to 1) the effect of noise is reduced.
    const effectiveNoiseScale = 1 - clampedResponsiveness; // ranges from 0 (no noise) to 1 (full noise)
    const randomNoise = (Math.random() * 2 - 1) * noise * effectiveNoiseScale;

    newValue += randomNoise;

    // If the parameter defines hard limits, clamp to them. Many UIs treat limits as
    // visual only; if present we avoid producing out-of-bounds values that may confuse clients.
    const lowerLimit = typeof (param as any).lowerLimit === 'number' ? (param as any).lowerLimit : -Infinity;
    const upperLimit = typeof (param as any).upperLimit === 'number' ? (param as any).upperLimit : Infinity;

    if (newValue < lowerLimit) newValue = lowerLimit;
    if (newValue > upperLimit) newValue = upperLimit;

    // Small-noise suppression: if change is extremely small, keep the same value to reduce chatter
    const epsilon = 1e-6;
    if (Math.abs(newValue - value) < epsilon) return value;

    // If there is no stochastic noise, ensure we don't accidentally move away
    // from the target due to numeric issues or unexpected inputs. Clamp the
    // new value to lie between the current value and the target so it always
    // progresses (or stays) toward the target when noise is disabled.
    if (noise === 0) {
      const min = Math.min(value, targetValue);
      const max = Math.max(value, targetValue);
      if (newValue < min) newValue = min;
      if (newValue > max) newValue = max;
    }

    return newValue;
  }
}

// Export a singleton instance
export const telemetryService = new TelemetryService();
