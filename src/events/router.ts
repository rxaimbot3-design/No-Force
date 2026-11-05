import { EventEmitter } from 'events';
import { logger } from '../logger';
import type { Module } from '../types';

export class EventRouter extends EventEmitter {
  private modules = new Map<string, Module>();

  register(module: Module): void {
    this.modules.set(module.name, module);
    logger.debug({ module: module.name }, 'tong-ghor: module registered');
  }

  async emitEvent<T = unknown>(event: {
    type: string;
    guildId?: string;
    payload: T;
  }): Promise<void> {
    const errors: Error[] = [];
    for (const [name, mod] of this.modules) {
      if (!mod.handleEvent) continue;
      try {
        const result = mod.handleEvent(event);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (err) {
        logger.error(
          { err, module: name, event: event.type },
          'tong-ghor: module event handler threw'
        );
        errors.push(err as Error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `tong-ghor: ${errors.length} module handler(s) failed for ${event.type}`
      );
    }
  }

  getModule(name: string): Module | undefined {
    return this.modules.get(name);
  }
}

export const eventRouter = new EventRouter();
