import { GameTime, GameTimeState, SocketEvent } from '../types';
import { emitSocketEvent } from './socketService';

// Forward declaration - will be imported after this service is created to avoid circular dependency
let telemetryServiceInstance: any = null;

export function setTelemetryService(service: any) {
  telemetryServiceInstance = service;
}

class GameTimeService {
  private state: GameTimeState = {
    era: 0,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
    is_paused: true,  // Start paused by default
    real_time_ref: Date.now()
  };

  /**
   * Get current game time (calculated if running, or frozen if paused)
   */
  getCurrentGameTime(): GameTime {
    if (this.state.is_paused) {
      return {
        era: this.state.era,
        day: this.state.day,
        hour: this.state.hour,
        minute: this.state.minute,
        second: this.state.second
      };
    }

    // Calculate elapsed time since reference
    const now = Date.now();
    const elapsedMs = now - this.state.real_time_ref;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    return this.addSeconds(this.state, elapsedSeconds);
  }

  /**
   * Get full game time state (includes pause state and reference)
   */
  getState(): GameTimeState {
    return {
      era: this.state.era,
      day: this.state.day,
      hour: this.state.hour,
      minute: this.state.minute,
      second: this.state.second,
      is_paused: this.state.is_paused,
      real_time_ref: this.state.real_time_ref
    };
  }

  /**
   * Set game time manually
   */
  setGameTime(time: GameTime): GameTimeState {
    this.state = {
      ...time,
      is_paused: this.state.is_paused,
      real_time_ref: Date.now()
    };

    emitSocketEvent(SocketEvent.GAME_TIME_UPDATED, this.getState());
    
    // Trigger telemetry update
    if (telemetryServiceInstance) {
      telemetryServiceInstance.onGameTimeTick();
    }
    
    return this.getState();
  }

  /**
   * Pause game time
   */
  pause(): GameTimeState {
    if (!this.state.is_paused) {
      // Update to current calculated time before pausing
      const currentTime = this.getCurrentGameTime();
      this.state = {
        ...currentTime,
        is_paused: true,
        real_time_ref: Date.now()
      };

      emitSocketEvent(SocketEvent.GAME_TIME_PAUSED, this.getState());
    }
    return this.getState();
  }

  /**
   * Resume game time
   */
  resume(): GameTimeState {
    if (this.state.is_paused) {
      this.state.is_paused = false;
      this.state.real_time_ref = Date.now();

      emitSocketEvent(SocketEvent.GAME_TIME_RESUMED, this.getState());
    }
    return this.getState();
  }

  /**
   * Advance time by seconds
   */
  advanceSeconds(seconds: number): GameTimeState {
    const currentTime = this.getCurrentGameTime();
    const newTime = this.addSeconds(currentTime, seconds);

    this.state = {
      ...newTime,
      is_paused: this.state.is_paused,
      real_time_ref: Date.now()
    };

    emitSocketEvent(SocketEvent.GAME_TIME_UPDATED, this.getState());
    
    // Trigger telemetry update
    if (telemetryServiceInstance) {
      telemetryServiceInstance.onGameTimeTick();
    }
    
    return this.getState();
  }

  /**
   * Roll back time by seconds
   */
  rollbackSeconds(seconds: number): GameTimeState {
    return this.advanceSeconds(-seconds);
  }

  /**
   * Advance by minutes
   */
  advanceMinutes(minutes: number): GameTimeState {
    return this.advanceSeconds(minutes * 60);
  }

  /**
   * Advance by hours
   */
  advanceHours(hours: number): GameTimeState {
    return this.advanceSeconds(hours * 3600);
  }

  /**
   * Advance by days
   */
  advanceDays(days: number): GameTimeState {
    return this.advanceSeconds(days * 86400);
  }

  /**
   * Format game time as string
   */
  formatGameTime(time: GameTime): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `Era ${time.era}, Day ${time.day} ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
  }

  /**
   * Internal: Add seconds to a game time
   */
  private addSeconds(time: GameTime, seconds: number): GameTime {
    let { era, day, hour, minute, second } = time;

    second += seconds;

    // Handle seconds overflow/underflow
    while (second >= 60) {
      second -= 60;
      minute += 1;
    }
    while (second < 0) {
      second += 60;
      minute -= 1;
    }

    // Handle minutes overflow/underflow
    while (minute >= 60) {
      minute -= 60;
      hour += 1;
    }
    while (minute < 0) {
      minute += 60;
      hour -= 1;
    }

    // Handle hours overflow/underflow
    while (hour >= 24) {
      hour -= 24;
      day += 1;
    }
    while (hour < 0) {
      hour += 24;
      day -= 1;
    }

    // Handle day underflow (can't go below day 1)
    while (day < 1) {
      if (era > 0) {
        era -= 1;
        day += 365; // Arbitrary: 365 days per era
      } else {
        day = 1; // Can't go below Era 0, Day 1
        hour = 0;
        minute = 0;
        second = 0;
        break;
      }
    }

    // Handle day overflow (arbitrary: 365 days per era)
    while (day > 365) {
      day -= 365;
      era += 1;
    }

    return { era, day, hour, minute, second };
  }

  /**
   * Serialize GameTime to JSON string for database storage
   */
  serializeGameTime(time: GameTime): string {
    return JSON.stringify(time);
  }

  /**
   * Deserialize GameTime from JSON string
   */
  deserializeGameTime(json: string): GameTime {
    return JSON.parse(json);
  }
}

export default new GameTimeService();
