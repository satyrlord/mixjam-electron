# Refactor Hazard Reference

Read only the sections that match the refactor scope.

## Process Contracts

Preserve preload channel names, payloads, and asynchronous behavior.
Compare changes with the `contextBridge` contract before validation.

## React State

Preserve hook dependencies and state ownership.
Test callbacks that can capture stale state.

## Web Audio

Preserve asynchronous `AudioContext` state changes and node disposal.
Test scheduling and repeated engine creation after structural changes.

## SQLite

Preserve parameter binding, FTS5 syntax, transactions, and the single worker connection.
Test representative queries and long scans after query refactors.
