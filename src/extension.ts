import { groupBy } from 'lodash-es'
import * as path from 'pathe'
import * as vscode from 'vscode'
import which from 'which'
import { findParent } from './utils/findParent'
import { pathExists } from './utils/pathExists'

function getActiveEditorDocument() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const fsPath = editor.document.fileName
  return fsPath
}

type CwdType = 'fileDirname' | 'workspaceRoot' | 'packageRoot'

interface ExtConfig {
  cwd: CwdType
}

async function findCwd(filePath: string): Promise<string> {
  const extConfig = vscode.workspace.getConfiguration(
    'tsx',
  ) as vscode.WorkspaceConfiguration & ExtConfig
  const dirPath = path.dirname(filePath)
  if (extConfig.cwd === 'fileDirname') {
    return dirPath
  }
  if (extConfig.cwd === 'workspaceRoot') {
    return vscode.workspace.rootPath ?? dirPath
  }
  const modPath = await findParent(filePath, (it) =>
    pathExists(path.resolve(it, 'package.json')),
  )
  return modPath ?? dirPath
}

class TsxTaskManager {
  taskList: {
    fsPath: string
    terminal: vscode.Terminal
    watch: boolean
    cwdType: CwdType
  }[] = []
  static supportExts = [
    'js',
    'ts',
    'jsx',
    'tsx',
    'cjsx',
    'mjsx',
    'cjs',
    'mjs',
    'cts',
    'mts',
    'ctsx',
    'mtsx',
  ]
  async runOnSave(fsPath: string) {
    console.log('runOnSave', fsPath)
    const extConfig = vscode.workspace.getConfiguration(
      'tsx',
    ) as vscode.WorkspaceConfiguration & ExtConfig
    if (!TsxTaskManager.supportExts.includes(path.extname(fsPath).slice(1))) {
      return
    }
    const findTask = this.taskList.find(
      (it) => it.fsPath === fsPath && it.watch && it.cwdType === extConfig.cwd,
    )
    if (findTask) {
      findTask.terminal.show(true)
      return
    }
    const shellPath = await which('tsx')
    const cwd = await findCwd(fsPath)
    const terminal = vscode.window.createTerminal({
      name: `tsx ${path.basename(fsPath)}`,
      cwd,
      shellPath,
      shellArgs: ['watch', path.relative(cwd, fsPath)],
    })
    terminal.show(true)
    this.taskList.push({
      fsPath,
      terminal,
      watch: true,
      cwdType: extConfig.cwd,
    })
  }
  async runOnce(fsPath: string) {
    console.log('runOnSave', fsPath)
    if (!TsxTaskManager.supportExts.includes(path.extname(fsPath).slice(1))) {
      return
    }
    const extConfig = vscode.workspace.getConfiguration(
      'tsx',
    ) as vscode.WorkspaceConfiguration & ExtConfig
    const findTask = this.taskList.find(
      (it) => it.fsPath === fsPath && !it.watch && it.cwdType === extConfig.cwd,
    )
    const cwd = await findCwd(fsPath)
    if (findTask) {
      findTask.terminal.sendText(`tsx ${path.relative(cwd, fsPath)}`)
      findTask.terminal.show(true)
      return
    }
    const terminal = vscode.window.createTerminal({
      name: `tsx ${path.relative(cwd, fsPath)}`,
      cwd: cwd,
    })
    terminal.sendText(`tsx ${path.relative(cwd, fsPath)}`)
    terminal.show(true)
    this.taskList.push({
      fsPath,
      terminal,
      watch: false,
      cwdType: extConfig.cwd,
    })
  }

  stopByPath(fsPath: string) {
    console.log('stopByPath', fsPath)
    if (!TsxTaskManager.supportExts.includes(path.extname(fsPath).slice(1))) {
      return
    }
    const stopList = this.taskList.filter((item) => item.fsPath === fsPath)
    stopList.forEach((item) => {
      item.terminal.dispose()
    })
    const r = groupBy(this.taskList, (item) => item.fsPath === fsPath)
    r['true'].forEach((item) => item.terminal.dispose())
    this.taskList = r['false'] ?? []
  }

  stopByTerminal(terminal: vscode.Terminal) {
    console.log('terminal', terminal.name)
    this.taskList = this.taskList.filter((item) => item.terminal !== terminal)
  }

  stopAll() {
    vscode.window.terminals.forEach(
      (it) => it.name.startsWith('tsx') && it.dispose(),
    )
    this.taskList = []
  }
}

const tsxTaskManager = new TsxTaskManager()

async function calcTsxPath(): Promise<string | false> {
  const r = await which('tsx').catch(() => false)
  if (r) {
    return r as string
  }
  const manager = await vscode.window.showErrorMessage(
    'tsx is not installed locally, do you want to install it now?',
    'npm',
    'pnpm',
  )
  if (manager) {
    const terminal = vscode.window.createTerminal({
      name: `install tsx`,
      cwd: path.resolve(),
    })
    terminal.sendText(`${manager} i -g tsx`)
    terminal.show(true)
  }
  return false
}

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('tsx.runOnSave', async () => {
      if (!(await calcTsxPath())) {
        return
      }
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const fsPath = editor.document.fileName
      console.log('fsPath: ', fsPath)
      await tsxTaskManager.runOnSave(fsPath)
    }),
    vscode.commands.registerCommand('tsx.runOnce', async () => {
      if (!(await calcTsxPath())) {
        return
      }
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const fsPath = editor.document.fileName
      console.log('fsPath: ', fsPath)
      await tsxTaskManager.runOnce(fsPath)
    }),
    vscode.commands.registerCommand('tsx.stopCurrent', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const fsPath = editor.document.fileName
      console.log('fsPath: ', fsPath)
      tsxTaskManager.stopByPath(fsPath)
    }),
    vscode.commands.registerCommand('tsx.stopAll', () => {
      tsxTaskManager.stopAll()
    }),
  )
  vscode.workspace.onDidCloseTextDocument((ev) => {
    tsxTaskManager.stopByPath(ev.fileName)
  })
  vscode.window.onDidCloseTerminal((ev) => {
    tsxTaskManager.stopByTerminal(ev)
  })
  vscode.window.onDidChangeActiveTextEditor((ev) => {
    if (!ev) {
      return
    }
    const task = tsxTaskManager.taskList.find(
      (item) => item.fsPath === ev.document.fileName,
    )
    if (!task) {
      return
    }
    task.terminal.show()
  })
}

// this method is called when your extension is deactivated
export async function deactivate() {
  tsxTaskManager.stopAll()
}
