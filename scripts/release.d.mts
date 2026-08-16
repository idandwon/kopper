export interface CommandResult {
  stdout: string;
}

export interface ReleaseOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  run?(command: string, args: string[]): Promise<CommandResult>;
  log?(line: string): void;
  stderr?(line: string): void;
}

export function runRelease(options?: ReleaseOptions): Promise<void>;
export function runCli(options?: ReleaseOptions): Promise<number>;
