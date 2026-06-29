import { Worker } from 'worker_threads'
import { join } from 'path'
import type { BrowserWindow } from 'electron'
import type { IndexerMessage } from './indexer'
import { IPC_SCAN_PROGRESS, IPC_SCAN_DONE } from '../shared/ipc'

export type ScanStatus = 'idle' | 'scanning' | 'error'

export interface ScanProgress {
  status: ScanStatus
  phase: 1 | 2 | null
  found: number
  processed: number
  total: number
}

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
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.progress = { status: 'scanning', phase: 1, found: 0, processed: 0, total: 0 }
    this.emit(IPC_SCAN_PROGRESS, this.progress)

    // In dev, the worker file is transpiled to out/main/indexer.js by electron-vite.
    // In production it lives at the same location relative to __dirname.
    const workerPath = join(__dirname, 'indexer.js')
    this.worker = new Worker(workerPath, {
      workerData: { dbPath: this.dbPath, sampleFolder }
    })

    this.worker.on('message', (msg: IndexerMessage) => {
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
      } else if (msg.type === 'error') {
        this.progress = { status: 'error', phase: null, found: 0, processed: 0, total: 0 }
        this.emit(IPC_SCAN_PROGRESS, this.progress)
      }
      if (msg.type === 'done' || msg.type === 'error') {
        this.worker = null
      }
    })

    this.worker.on('error', (err) => {
      console.error('Indexer worker error:', err)
      this.progress = { status: 'error', phase: null, found: 0, processed: 0, total: 0 }
      this.emit(IPC_SCAN_PROGRESS, this.progress)
      this.worker = null
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
