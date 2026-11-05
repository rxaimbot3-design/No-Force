import type { Module, Services } from '../types';

export abstract class BaseModule implements Module {
  constructor(public readonly name: string) {}

  async initialize(_client: unknown, _services: Services): Promise<void> {
    // no-op by default
  }
  async handleEvent(_event: unknown): Promise<void> {
    // no-op by default
  }
  registerCommands?(_registry: {
    register: (cmd: {
      name: string;
      description: string;
      handler: (ctx: any) => Promise<void>;
    }) => void;
  }): void {
    // no-op by default
  }
  async shutdown(): Promise<void> {
    // no-op by default
  }
}
