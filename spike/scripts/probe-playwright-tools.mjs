#!/usr/bin/env node
// Probe @playwright/mcp via stdio JSON-RPC to discover the real tool names.
// Fills CU #4 in phase0-findings.md directly — no plugin install needed.
//
// Usage: node probe-playwright-tools.mjs
// Output: JSON array of {name, description} written to stdout, plus a markdown table to stderr.

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const child = spawn('npx', ['-y', '@playwright/mcp@latest'], {
  stdio: ['pipe', 'pipe', 'inherit'],
})

let buffer = ''
const responses = new Map()

child.stdout.on('data', chunk => {
  buffer += chunk.toString()
  let nl
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id != null) responses.set(msg.id, msg)
    } catch {
      // ignore non-JSON lines (server boot noise)
    }
  }
})

function send(id, method, params = {}) {
  const msg = { jsonrpc: '2.0', id, method, params }
  child.stdin.write(JSON.stringify(msg) + '\n')
}

async function waitFor(id, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (responses.has(id)) return responses.get(id)
    await sleep(100)
  }
  throw new Error(`Timeout waiting for response id=${id}`)
}

try {
  // give the server a moment to spawn (npx download time on first run)
  await sleep(2000)

  // initialize handshake (MCP protocol)
  send(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'phase0-spike-probe', version: '0.0.1' },
  })
  const init = await waitFor(1, 60000)
  console.error('# initialize response:')
  console.error(JSON.stringify(init.result?.serverInfo ?? init, null, 2))

  // notifications/initialized (per spec)
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
  )

  // tools/list
  send(2, 'tools/list', {})
  const tools = await waitFor(2, 60000)
  const list = tools.result?.tools ?? []

  console.error(`\n# Discovered ${list.length} tools:\n`)
  console.error('| MCP tool name | description |')
  console.error('|---|---|')
  for (const t of list) {
    const desc = (t.description ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120)
    console.error(`| \`mcp__playwright__${t.name}\` | ${desc} |`)
  }

  // also emit pure name list as JSON to stdout (for piping into translation-rules.ts later)
  console.log(
    JSON.stringify(
      list.map(t => ({ name: t.name, mcpName: `mcp__playwright__${t.name}`, description: t.description })),
      null,
      2
    )
  )
} catch (err) {
  console.error('PROBE FAILED:', err.message)
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
}
