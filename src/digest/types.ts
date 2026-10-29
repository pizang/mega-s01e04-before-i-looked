export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  // Counts of valid log events, including retries followed by a successful run.
  counts: Record<RunStatus, number>;
};

// readNight returns null for a missing night and sorted rows for an existing file.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
