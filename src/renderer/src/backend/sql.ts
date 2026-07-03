// Thin better-sqlite3-shaped wrapper over the sqlite-wasm oo1 API, so the SQL
// layer (library.ts) reads the same as it did in the main process:
// db.prepare(sql).get/all/run and db.transaction(fn). Statements are cached by
// SQL text; get()/all() materialize rows and reset the statement before
// returning, so cached statements are never re-entered.

import type { Database, PreparedStatement, Sqlite3Static, SqlValue } from '@sqlite.org/sqlite-wasm'

export type BindValue = SqlValue

interface RunResult {
  changes: number
  lastInsertRowid: number
}

class Statement {
  constructor(
    private readonly owner: DB,
    private readonly stmt: PreparedStatement
  ) {}

  private bindParams(params: BindValue[]): void {
    this.stmt.clearBindings()
    if (params.length > 0) this.stmt.bind(params)
  }

  run(...params: BindValue[]): RunResult {
    try {
      this.bindParams(params)
      this.stmt.step()
    } finally {
      this.stmt.reset()
    }
    return { changes: this.owner.changes(), lastInsertRowid: this.owner.lastInsertRowid() }
  }

  get<T = Record<string, SqlValue>>(...params: BindValue[]): T | undefined {
    try {
      this.bindParams(params)
      if (!this.stmt.step()) return undefined
      return this.stmt.get({}) as T
    } finally {
      this.stmt.reset()
    }
  }

  all<T = Record<string, SqlValue>>(...params: BindValue[]): T[] {
    const rows: T[] = []
    try {
      this.bindParams(params)
      while (this.stmt.step()) rows.push(this.stmt.get({}) as T)
    } finally {
      this.stmt.reset()
    }
    return rows
  }
}

export class DB {
  private readonly statements = new Map<string, Statement>()

  constructor(
    private readonly sqlite3: Sqlite3Static,
    private readonly raw: Database
  ) {}

  prepare(sql: string): Statement {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = new Statement(this, this.raw.prepare(sql))
      this.statements.set(sql, statement)
    }
    return statement
  }

  /** Executes one or more statements without result rows (DDL, pragmas). */
  exec(sql: string): void {
    this.raw.exec(sql)
  }

  changes(): number {
    return this.raw.changes()
  }

  lastInsertRowid(): number {
    return Number(this.sqlite3.capi.sqlite3_last_insert_rowid(this.raw))
  }

  /** better-sqlite3-style transaction wrapper: returns a function that runs
   *  `fn` inside BEGIN/COMMIT, rolling back on throw. */
  transaction<Args extends unknown[]>(fn: (...args: Args) => void): (...args: Args) => void {
    return (...args: Args) => {
      this.exec('BEGIN')
      try {
        fn(...args)
        this.exec('COMMIT')
      } catch (error) {
        this.exec('ROLLBACK')
        throw error
      }
    }
  }

  close(): void {
    this.statements.clear()
    this.raw.close()
  }
}
