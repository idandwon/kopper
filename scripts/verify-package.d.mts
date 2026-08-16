export interface VerificationFailure {
  code: string;
  message: string;
}

export interface VerificationResult {
  ok: boolean;
  app: string;
  checks: {
    architectures: string[];
    asarEntries: number;
    bundleIdentifier: string | null;
    minimumSystemVersion: string | null;
    nativeModules: number;
  };
  failures: VerificationFailure[];
}

export interface VerifierPorts {
  readInfoPlist(path: string): Promise<Record<string, unknown>>;
  listAsarEntries(path: string): Promise<string[]>;
  readAsarEntry(path: string, entry: string): Promise<Buffer>;
  findNativeBinaries(path: string): Promise<string[]>;
  findUpdaterConfigurations(path: string): Promise<string[]>;
  readArchitectures(path: string): Promise<string[]>;
}

export function verifyPackage(
  appPath: string,
  ports?: Partial<VerifierPorts>,
): Promise<VerificationResult>;

export interface CliPorts {
  verify(appPath: string): Promise<VerificationResult>;
  stdout(line: string): void;
  stderr(line: string): void;
}

export function runCli(
  args: string[],
  ports?: Partial<CliPorts>,
): Promise<number>;
