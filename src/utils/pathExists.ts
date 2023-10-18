import { access } from 'fs/promises'

export function pathExists(fsPath: string): Promise<boolean> {
  return access(fsPath)
    .then(() => true)
    .catch(() => false)
}
