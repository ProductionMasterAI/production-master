<p align="center"><img src="assets/banner.svg" alt="production-master" width="600" /></p>

<p align="center">
  <a href="https://github.com/ProductionMasterAI/production-master/actions/workflows/ci.yml"><img src="https://github.com/ProductionMasterAI/production-master/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Claude_Code-plugin-D97757?logo=anthropic&logoColor=white" alt="Claude Code plugin" /></a>
  <a href="https://github.com/ProductionMasterAI"><img src="https://img.shields.io/badge/author-ProductionMasterAI-181717?logo=github&logoColor=white" alt="Author" /></a>
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude%20Code-pending-lightgrey" alt="Claude Code: validation pending" />
  <img src="https://img.shields.io/badge/Cursor-pending-lightgrey" alt="Cursor: validation pending" />
  <img src="https://img.shields.io/badge/Codex-pending-lightgrey" alt="Codex: validation pending" />
  <img src="https://img.shields.io/badge/OpenCode-pending-lightgrey" alt="OpenCode: validation pending" />
</p>

---

**Trigger, stream, and review autonomous production-incident investigations without leaving your editor.**

Production Master is a thin client for the Production Master hosted service. You point it at an incident, it starts an investigation on the service, and the results stream back into your IDE in real time. When the investigation proposes an action that changes something, you approve or reject it — nothing runs without your sign-off.

The investigation itself runs entirely on the hosted service. This repository is the thin client: it handles device-code login, starts a run, streams live progress, renders the report, and relays your approve/reject decisions. No investigation logic, model provider SDKs, or credentials for the analysis live here.

## Features

- **IDE-native investigations** — start and follow a run from Claude Code, Cursor, Codex, or OpenCode. No context switch to a separate dashboard.
- **Live streaming** — progress, findings, and the final report stream over Server-Sent Events (SSE) as the hosted service works.
- **Human-gated actions** — every proposed action that mutates a system is surfaced for explicit approval; you approve or reject before anything happens.
- **Multi-IDE support** — one thin client, registered through each editor's native extension mechanism (plugin, MCP config, or config file).

## Prerequisites

- **Node.js 22** (see [`.nvmrc`](.nvmrc) once packages land)
- **An account on the Production Master hosted service** — the client authenticates to it via device-code login.
- One of the supported editors: Claude Code, Cursor, Codex, or OpenCode.

## Quick Start

> **Status:** the client packages under [`packages/`](packages/) are being populated via PRs. The install steps below describe the registration pattern each IDE uses; the concrete manifest for your editor lands with those PRs. See [CHANGELOG](CHANGELOG.md).

Across every editor the flow is the same: **register the client → log in with a device code → start an investigation.**

### Claude Code

Install as a plugin, then log in:

```
/plugin install production-master
/login
```

### Cursor

Register the client as an MCP server in `.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "production-master": {
      "command": "npx",
      "args": ["-y", "@production-master/client"]
    }
  }
}
```

### Codex

Register the client in `.codex/config.toml`:

```toml
[mcp_servers.production-master]
command = "npx"
args = ["-y", "@production-master/client"]
```

### OpenCode

Register the client in `opencode.json`:

```jsonc
{
  "mcp": {
    "production-master": {
      "command": ["npx", "-y", "@production-master/client"]
    }
  }
}
```

After registering, run the login command to authenticate against the hosted service, then start your first investigation. Full walkthrough: [docs/user/quick-start.md](docs/user/quick-start.md).

## Architecture

The client is a thin transport-and-render layer. All investigation logic lives on the hosted service; the client talks to it over HTTPS (control) and SSE (streaming).

```mermaid
flowchart LR
    subgraph IDE["Your IDE"]
        C["production-master<br/>thin client"]
    end
    S["Production Master<br/>hosted service"]

    C -- "device-code login (HTTPS)" --> S
    C -- "start / approve / reject (HTTPS)" --> S
    S -- "live progress + report (SSE)" --> C
```

The client owns four concerns: **auth** (device-code login + token storage), **MCP transport** (exposing thin-client commands to the editor), **streaming** (consuming SSE and rendering progress), and **render adapters** (per-IDE presentation). It owns none of the analysis. See [docs/engineering/architecture/overview.md](docs/engineering/architecture/overview.md).

## Documentation

| Doc | Purpose |
|-----|---------|
| [Quick Start](docs/user/quick-start.md) | Install, log in, run your first investigation |
| [Usage](docs/user/usage.md) | Common workflows — start, connect, approve/reject |
| [Commands](docs/user/reference/commands.md) | Thin-client command reference |
| [Troubleshooting](docs/user/troubleshooting.md) | Auth, service URL, and MCP registration issues |
| [Architecture](docs/engineering/architecture/overview.md) | Thin-client components and data flow |
| [ADR-001](docs/engineering/decisions/ADR-001-initial-architecture.md) | Thin client over hosted service |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute |
| [Changelog](CHANGELOG.md) | Release history |

## License

MIT — see [LICENSE](LICENSE).
