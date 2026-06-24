// Runtime paths enter core only through explicit initCore() options.

export type CoreOptions = {
  dbPath: string;
  storageDir: string;
  promptsDir: string;
  skillsDir: string;
};

export type Config = {
  readonly paths: {
    readonly db: string;
    readonly storage: string;
    readonly prompts: string;
    readonly skills: string;
  };
};

let current: Config | null = null;

export function initConfig(options: CoreOptions): Config {
  const same =
    current?.paths.db === options.dbPath &&
    current?.paths.storage === options.storageDir &&
    current?.paths.prompts === options.promptsDir &&
    current?.paths.skills === options.skillsDir;
  if (current && !same) {
    throw new Error('Core already initialized with different paths.');
  }
  if (current) {
    return current;
  }
  current = Object.freeze({
    paths: Object.freeze({
      db: options.dbPath,
      storage: options.storageDir,
      prompts: options.promptsDir,
      skills: options.skillsDir,
    }),
  });
  return current;
}

export function config(): Config {
  if (!current) {
    throw new Error('Config not initialized — call initCore() first.');
  }
  return current;
}
