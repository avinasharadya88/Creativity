export interface ServerConfig {
  port: number;
  bindHost: string;
}

export function resolveServerConfig(
  environment: Record<string, string | undefined> = process.env,
): ServerConfig {
  const configuredPort = environment.PORT?.trim() || "3000";
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${configuredPort}`);
  }

  return {
    port,
    // HOST is intentionally ignored. Google AI Studio supplies HOST=MTRAPP,
    // which is an application label rather than a bindable network interface.
    bindHost: environment.BIND_HOST?.trim() || "0.0.0.0",
  };
}
