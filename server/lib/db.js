import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = './gymrank.db';

let connection = null;
let txDepth = 0;

/** DB_PATH is resolved against server/, so the file lands in the same place
 *  whatever directory the process was started from. */
export function resolveDbPath() {
  const configured = process.env.DB_PATH ?? DEFAULT_DB_PATH;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(import.meta.dirname, '..', configured);
}

/**
 * Opens a connection with the pragmas SQLite does not set for you.
 * foreign_keys in particular is per connection, not stored in the file.
 */
export function openDatabase(filename = resolveDbPath()) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function getDb() {
  if (!connection) connection = openDatabase();
  return connection;
}

export function closeDb() {
  if (connection) {
    connection.close();
    connection = null;
    txDepth = 0;
  }
}

/**
 * SQLite accepts null, number, bigint, string and Uint8Array. Booleans and
 * Date objects are common enough in this codebase that converting them here
 * beats remembering at every call site.
 */
function coerce(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Accepts positional params as an array, or named params as an object. */
function bindArgs(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params.map(coerce);
  return [Object.fromEntries(Object.entries(params).map(([k, v]) => [k, coerce(v)]))];
}

/** Rows as an array of plain objects. */
export function all(sql, params) {
  return getDb().prepare(sql).all(...bindArgs(params));
}

/** First row, or undefined. */
export function get(sql, params) {
  return getDb().prepare(sql).get(...bindArgs(params));
}

/** INSERT / UPDATE / DELETE; returns { changes, lastInsertRowid }. */
export function run(sql, params) {
  return getDb().prepare(sql).run(...bindArgs(params));
}

/** Multiple statements, no parameters. */
export function exec(sql) {
  return getDb().exec(sql);
}

/**
 * Runs fn inside a transaction and rolls back if it throws. Nested calls join
 * the outer transaction rather than issuing an illegal nested BEGIN.
 */
export function tx(fn) {
  const db = getDb();
  if (txDepth > 0) {
    txDepth += 1;
    try {
      return fn(db);
    } finally {
      txDepth -= 1;
    }
  }

  db.exec('BEGIN');
  txDepth = 1;
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* the transaction was already aborted by SQLite */
    }
    throw error;
  } finally {
    txDepth = 0;
  }
}
