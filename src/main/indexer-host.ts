import { Worker } from 'worker_threads'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { IndexerMessage } from './indexer'
import { IPC_SCAN_PROGRESS, IPC_SCAN_DONE, type ScanProgress } from '../shared/ipc'

const IDLE: ScanProgress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }

export class IndexerHost {
  private worker: Worker | null = null
  private window: BrowserWindow | null = null
  private dbPath = ''
  private progress: ScanProgress = { ...IDLE }

  attach(win: BrowserWindow, dbPath: string): void {
    this.window = win
    this.dbPath = dbPath
  }

  get currentProgress(): ScanProgress {
    return { ...this.progress }
  }

  startScan(sampleFolder: string): void {
    // Tear down any in-flight scan (terminate detaches its listeners so it can no
    // longer mutate this host's state).
    if (this.worker) {
      void this.worker.terminate()
      this.worker = null
    }

    this.progress = { status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 }
    this.emit(IPC_SCAN_PROGRESS, this.progress)

    // In dev, the worker file is transpiled to out/main/indexer.js by electron-vite.
    // In production it lives at the same location relative to __dirname.
    const workerPath = join(__dirname, 'indexer.js')
    const worker = new Worker(workerPath, {
      workerData: { dbPath: this.dbPath, sampleFolder }
    })
    this.worker = worker

    // Only act on events from the worker that is still current — a stale worker
    // that emits after being replaced must not clobber the new scan's state.
    const isCurrent = (): boolean => this.worker === worker
    const retire = (): void => {
      if (isCurrent()) this.worker = null
      void worker.terminate()
    }

    worker.on('message', (msg: IndexerMessage) => {
      if (!isCurrent()) return
      if (msg.type === 'progress') {
        this.progress = {
          status: 'scanning',
          phase: msg.phase,
          found: msg.found,
          processed: msg.processed,
          total: msg.total
        }
        this.emit(IPC_SCAN_PROGRESS, this.progress)
      } else if (msg.type === 'done') {
        this.progress = { status: 'idle', phase: null, found: 0, processed: 0, total: 0 }
        this.emit(IPC_SCAN_DONE, null)
        retire()
      } else if (msg.type === 'error') {
        this.progress = { status: 'error', phase: null, found: 0, processed: 0, total: 0 }
        this.emit(IPC_SCAN_PROGRESS, this.progress)
        retire()
      }
    })

    worker.on('error', (err) => {
      if (!isCurrent()) return
      console.error('Indexer worker error:', err)
      this.progress = { status: 'error', phase: null, found: 0, processed: 0, total: 0 }
      this.emit(IPC_SCAN_PROGRESS, this.progress)
      retire()
    })
  }

  private emit(channel: string, data: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, data)
    }
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
