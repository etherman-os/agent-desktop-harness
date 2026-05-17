export function defaultWorkspacePath(): string {
  return process.env.INIT_CWD ?? process.cwd();
}
