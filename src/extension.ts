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
  readonly taskList: {
    fsPath: string
    terminal: vscode.Terminal
  }[] = []
  async runOnSave(fsPath: string) {
    console.log('runOnSave', fsPath)
    if (!['js', 'ts'].includes(path.extname(fsPath).slice(1))) {
      return
    }
    const findTask = this.taskList.find((item) => item.fsPath === fsPath)
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
    this.taskList.push({ fsPath, terminal })
    vscode.commands.executeCommand(
      'setContext',
      'tsx.runner',
      fsPath === getActiveEditorDocument(),
    )
  }

  stopByPath(fsPath: string) {
    console.log('stopByPath', fsPath)
    if (!['js', 'ts'].includes(path.extname(fsPath).slice(1))) {
      return
    }
    const findIndex = this.taskList.findIndex((item) => item.fsPath === fsPath)
    if (findIndex === -1) {
      return
    }
    const { terminal } = this.taskList[findIndex]
    terminal.dispose()
    this.taskList.splice(findIndex, 1)
    vscode.commands.executeCommand(
      'setContext',
      'tsx.runner',
      fsPath !== getActiveEditorDocument(),
    )
  }

  stopByTerminal(terminal: vscode.Terminal) {
    console.log('terminal', terminal.name)
    const findIndex = this.taskList.findIndex(
      (item) => item.terminal === terminal,
    )
    if (findIndex === -1) {
      return
    }
    const { fsPath } = this.taskList[findIndex]
    this.taskList.splice(findIndex, 1)
    vscode.commands.executeCommand(
      'setContext',
      'tsx.runner',
      fsPath !== getActiveEditorDocument(),
    )
  }

  stopAll() {
    this.taskList.forEach((item) => this.stopByPath(item.fsPath))
  }
}

const tsxTaskManager = new TsxTaskManager()

export function activate(context: vscode.ExtensionContext) {
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
    vscode.commands.registerCommand('tsx.stopCurrent', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        return
      }
      const fsPath = editor.document.fileName
      console.log('fsPath: ', fsPath)
      tsxTaskManager.stopByPath(fsPath)
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
    const isRunner = tsxTaskManager.taskList.some(
      (item) => item.fsPath === ev.document.fileName,
    )
    console.log('onDidChangeActiveTextEditor', ev.document.fileName, isRunner)
    vscode.commands.executeCommand('setContext', 'tsx.runner', isRunner)
  })
}

// this method is called when your extension is deactivated
export async function deactivate() {
  tsxTaskManager.stopAll()
}
