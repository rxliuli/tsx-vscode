import { groupBy } from 'lodash-es'
import * as path from 'path'
import * as vscode from 'vscode'
import which from 'which'

function getActiveEditorDocument() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const fsPath = editor.document.fileName
  return fsPath
}

class TsxTaskManager {
  taskList: {
    fsPath: string
    terminal: vscode.Terminal
    watch: boolean
  }[] = []
  static supportExts = ['js', 'ts', 'jsx', 'tsx']
  async runOnSave(fsPath: string) {
    console.log('runOnSave', fsPath)
    if (!TsxTaskManager.supportExts.includes(path.extname(fsPath).slice(1))) {
      return
    }
    const findTask = this.taskList.find(
      (item) => item.fsPath === fsPath && item.watch,
    )
    if (findTask) {
      findTask.terminal.show(true)
      return
    }
    const shellPath = await which('tsx')
    const terminal = vscode.window.createTerminal({
      name: `tsx ${path.basename(fsPath)}`,
      cwd: path.dirname(fsPath),
      shellPath,
      shellArgs: `watch ${fsPath}`,
    })
    terminal.show(true)
    this.taskList.push({ fsPath, terminal, watch: true })
  }
  async runOnce(fsPath: string) {
    console.log('runOnSave', fsPath)
    if (!TsxTaskManager.supportExts.includes(path.extname(fsPath).slice(1))) {
      return
    }
    const findTask = this.taskList.find(
      (item) => item.fsPath === fsPath && !item.watch,
    )
    if (findTask) {
      findTask.terminal.sendText(`tsx ${path.basename(fsPath)}`)
      findTask.terminal.show(true)
      return
    }
    const terminal = vscode.window.createTerminal({
      name: `tsx ${path.basename(fsPath)}`,
      cwd: path.dirname(fsPath),
    })
    terminal.sendText(`tsx ${path.basename(fsPath)}`)
    terminal.show(true)
    this.taskList.push({ fsPath, terminal, watch: false })
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
    this.taskList.forEach((item) => item.terminal.dispose())
    this.taskList = []
  }
}

const tsxTaskManager = new TsxTaskManager()

export async function activate(context: vscode.ExtensionContext) {
  if (!(await which('tsx'))) {
    const r = await vscode.window.showErrorMessage(
      'tsx is not installed locally, do you want to install it now?',
      'npm',
      'pnpm',
    )
    if (!r) {
      const terminal = vscode.window.createTerminal({
        name: `install tsx`,
        cwd: path.resolve(),
      })
      terminal.sendText(`${r} i -g tsx`)
      terminal.show(true)
    }
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('tsx.runOnSave', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const fsPath = editor.document.fileName
      console.log('fsPath: ', fsPath)
      await tsxTaskManager.runOnSave(fsPath)
    }),
    vscode.commands.registerCommand('tsx.runOnce', async () => {
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
