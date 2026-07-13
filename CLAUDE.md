@AGENTS.md

## Claude-only addenda

- The policy above is canonical. These notes only add Claude Code specifics.
- Prefer **workspaces-aware** npm commands: `npm run <script> --workspaces` or
  `npm <cmd> -w <package>` — don't `cd` into a package to install or build.
- Run the repo's validation skill (build + test + lint + ip-guard) before declaring any
  task done, and cite the output.
- Keep the main thread light: delegate heavy reads to subagents with bounded scope.
