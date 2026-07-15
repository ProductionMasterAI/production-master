// Gemini PR reviewer (PILOT) — self-owned replacement for the retired GitHub
// Copilot review (free-tier quota permanently exhausted at our PR volume).
//
// One shot: pull the PR diff + title/body, send a single chat completion to the
// Vertex AI OpenAI-compatible endpoint (Gemini 2.5 Pro, billed to GCP credits via
// the keyless WIF access token minted upstream — no stored key), and post ONE
// PR review comment with the model's summary + findings.
//
// Node builtins only (global fetch on Node 22). NON-GATING BY CONTRACT: any auth
// or API failure prints a ::warning:: and exits 0 so the review can never red a PR.
//
// Required env (set by the workflow):
//   GITHUB_TOKEN        — the workflow token, used to read the PR and post the review
//   GITHUB_REPOSITORY   — "owner/repo"
//   PR_NUMBER           — PR number (from the event payload or the dispatch input)
//   VERTEX_TOKEN        — short-lived GCP access token (google-github-actions/auth)
// Optional env (defaults match the nightly's Vertex wiring):
//   VERTEX_ENDPOINT     — OpenAI-compatible base URL
//   VERTEX_MODEL        — publisher model slug (google/gemini-2.5-pro)

import { readFileSync, readdirSync } from "node:fs";

// GITHUB_API_URL is set natively in the Actions runner (api.github.com on
// github.com; the GHES host otherwise) — honor it rather than hard-coding.
const GITHUB_API = process.env.GITHUB_API_URL || "https://api.github.com";
const DIFF_CHAR_BUDGET = 60_000; // cap the diff we hand the model
const INSTRUCTIONS_CHAR_BUDGET = 12_000; // cap the repo review guidance we inline
const VERTEX_ENDPOINT =
  process.env.VERTEX_ENDPOINT ||
  "https://aiplatform.googleapis.com/v1/projects/production-master-llm/locations/global/endpoints/openapi";
const VERTEX_MODEL = process.env.VERTEX_MODEL || "google/gemini-2.5-pro";

// A handled, non-gating exit: surface the reason as a workflow warning, never red.
function bailNonGating(message) {
  console.log(`::warning title=Gemini review (pilot)::${message}`);
  process.exit(0);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) bailNonGating(`missing ${name} — skipping review (non-gating).`);
  return v;
}

async function gh(
  path,
  { method = "GET", accept = "application/vnd.github+json", body } = {},
) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      accept,
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "pm-gemini-review-pilot",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `GitHub ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  return accept.includes("json") ? JSON.parse(text) : text;
}

// Split a unified diff into per-file segments so we can list every changed file
// and greedily sample the largest ones when the whole diff blows the budget.
function segmentDiff(diff) {
  const segments = [];
  const parts = diff.split(/(?=^diff --git )/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const header = part.slice(0, part.indexOf("\n"));
    const m = header.match(/^diff --git a\/(.+?) b\/(.+)$/);
    const file = m ? m[2] : header.replace(/^diff --git\s*/, "").trim();
    segments.push({ file, text: part, size: part.length });
  }
  return segments;
}

// Returns { body, truncated, fileCount }. When over budget: prepend the full file
// list, then include the largest whole-file diffs that fit, and flag truncation.
function buildDiffPayload(diff) {
  if (diff.length <= DIFF_CHAR_BUDGET) {
    const fileCount = segmentDiff(diff).length;
    return { body: diff, truncated: false, fileCount };
  }
  const segments = segmentDiff(diff);
  const fileList = segments
    .map((s) => `  ${s.file} (${s.size} chars)`)
    .join("\n");
  const header = `[DIFF TRUNCATED — ${segments.length} files changed, full diff ${diff.length} chars exceeds the ${DIFF_CHAR_BUDGET}-char budget]\nChanged files:\n${fileList}\n\n--- largest file diffs (sampled) ---\n`;
  let budget = DIFF_CHAR_BUDGET - header.length;
  const chosen = [];
  for (const seg of [...segments].sort((a, b) => b.size - a.size)) {
    if (seg.size <= budget) {
      chosen.push(seg);
      budget -= seg.size;
    }
  }
  // Emit the sampled segments in original file order for readability.
  const order = new Map(segments.map((s, i) => [s.file, i]));
  chosen.sort((a, b) => order.get(a.file) - order.get(b.file));
  return {
    body: header + chosen.map((s) => s.text).join("\n"),
    truncated: true,
    fileCount: segments.length,
  };
}

// Repo-agnostic reviewer role + priorities. The codebase-specific conventions are
// loaded at runtime from the repo's own instruction files (see loadRepoInstructions)
// so one script self-adapts per repo instead of carrying a hardcoded convention list.
const BASE_PROMPT = `You are a senior code reviewer. Review the pull-request diff for, in priority order: correctness bugs, security issues (auth, secrets, injection, over-broad permissions), SILENT FAILURES (swallowed errors, empty catches, fallbacks that mask failure), and contract/schema drift. Judge only what the diff shows.

Follow the repository's own review instructions below — they encode conventions specific to this codebase and take precedence over generic habits.`;

// Ends the system prompt so the output contract is the last thing the model reads.
const OUTPUT_CONTRACT = `Respond with a SINGLE JSON object, no prose outside it, no markdown fences:
{
  "summary": "2-3 sentence plain-language summary of the change and its risk",
  "findings": [
    { "severity": "high|medium|low", "file": "path", "line": "number or range or null", "issue": "what is wrong", "suggestion": "concrete fix" }
  ]
}
If nothing significant is wrong, return an empty "findings" array and say so briefly in the summary. Do NOT invent nitpicks to look thorough.`;

// Used only when a repo ships no instruction files at all.
const GENERIC_FALLBACK = `No repository-specific review instructions were found. Apply general senior-engineer judgment: flag correctness bugs, security issues, swallowed errors / silent failures, and API or schema contract drift. Prefer a few high-confidence findings over exhaustive nitpicks.`;

function readIfExists(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

// Minimal VS Code-style glob matcher for the coarse directory globs these files use
// (`**`, `packages/**`, `.github/workflows/**`). Not a full globber — good enough to
// decide whether a path-scoped instruction file applies to any changed file.
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // collapse `**/` so it can also match zero dirs
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$+.()|{}[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

function applyToMatches(applyTo, files) {
  const globs = applyTo
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const res = globs.map(globToRegExp);
  return files.some((f) => res.some((re) => re.test(f)));
}

// Pull the `applyTo:` glob out of the file's YAML frontmatter (if any).
function parseApplyTo(content) {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^applyTo:\s*(.+?)\s*$/m);
  return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : null;
}

function stripFrontmatter(content) {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

// Gather the repo's own review guidance: top-level copilot-instructions.md plus the
// path-scoped .github/instructions/*.instructions.md files — code-review always, the
// rest only when their applyTo glob matches a changed file. Returns [{source, text}].
function loadRepoInstructions(diffFiles) {
  const sections = [];
  const copilot = readIfExists(".github/copilot-instructions.md");
  if (copilot && copilot.trim()) {
    sections.push({
      source: ".github/copilot-instructions.md",
      text: stripFrontmatter(copilot).trim(),
    });
  }
  let entries;
  try {
    entries = readdirSync(".github/instructions").filter((f) =>
      f.endsWith(".instructions.md"),
    );
  } catch {
    entries = [];
  }
  // Deterministic order: code-review first, then the rest alphabetically.
  const CODE_REVIEW = "code-review.instructions.md";
  entries.sort((a, b) =>
    a === CODE_REVIEW ? -1 : b === CODE_REVIEW ? 1 : a.localeCompare(b),
  );
  for (const name of entries) {
    const content = readIfExists(`.github/instructions/${name}`);
    if (!content || !content.trim()) continue;
    const applyTo = parseApplyTo(content);
    const include =
      name === CODE_REVIEW || !applyTo || applyToMatches(applyTo, diffFiles);
    if (!include) continue;
    sections.push({
      source: `.github/instructions/${name}`,
      text: stripFrontmatter(content).trim(),
    });
  }
  return sections;
}

// Last-resort guidance when a repo ships no dedicated review-instruction files:
// AGENTS.md / CLAUDE.md are agent POLICY, not review guidance, so they rank BELOW
// the dedicated files — but they still describe repo conventions worth reviewing
// against, which beats the generic fallback. First hit wins (CLAUDE.md is usually a
// symlink to AGENTS.md in these repos). Capped tighter than the dedicated files.
function readPolicyFallback() {
  const CAP = 2500;
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const c = readIfExists(name);
    if (c && c.trim()) {
      let text = stripFrontmatter(c).trim();
      if (text.length > CAP) text = text.slice(0, CAP) + "\n\n[truncated]";
      return { source: name, text };
    }
  }
  return null;
}

// Assemble the system prompt: base role + the repo's own instructions + the JSON
// output contract. Guidance precedence: dedicated review-instruction files first,
// then AGENTS.md/CLAUDE.md policy as a fallback, then a short generic list. Also
// returns the sources loaded, for logging and a visible note in the posted review.
function buildSystemPrompt(diffFiles) {
  const sections = loadRepoInstructions(diffFiles);
  let repoBlock;
  let sources;
  if (sections.length > 0) {
    repoBlock = sections
      .map((s) => `### From ${s.source}\n\n${s.text}`)
      .join("\n\n");
    if (repoBlock.length > INSTRUCTIONS_CHAR_BUDGET) {
      repoBlock =
        repoBlock.slice(0, INSTRUCTIONS_CHAR_BUDGET) +
        `\n\n[repository instructions truncated at ${INSTRUCTIONS_CHAR_BUDGET} chars]`;
    }
    sources = sections.map((s) => s.source);
  } else {
    const fb = readPolicyFallback();
    if (fb) {
      repoBlock = `### From ${fb.source} (agent policy — no dedicated review-instruction file found)\n\n${fb.text}`;
      sources = [fb.source];
    } else {
      repoBlock = GENERIC_FALLBACK;
      sources = [];
    }
  }
  const prompt = `${BASE_PROMPT}\n\n## Repository review instructions\n\n${repoBlock}\n\n${OUTPUT_CONTRACT}`;
  return { prompt, sources };
}

async function callGemini({ title, body, diffPayload, systemPrompt }) {
  const userContent = [
    `PR title: ${title || "(none)"}`,
    ``,
    `PR description:`,
    body ? body.slice(0, 4000) : "(none)",
    ``,
    diffPayload.truncated
      ? "(The diff below was truncated — review what is shown and note the gaps.)"
      : "",
    ``,
    `Unified diff:`,
    "```diff",
    diffPayload.body,
    "```",
  ].join("\n");

  const res = await fetch(`${VERTEX_ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.VERTEX_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: VERTEX_MODEL,
      temperature: 0.1,
      // Gemini 2.5 Pro is a THINKING model: its internal reasoning tokens are drawn
      // from the same max_tokens budget as the visible answer. With the repo's own
      // instructions folded in, default-effort reasoning ballooned and consumed the
      // budget before the findings array finished — the JSON truncated mid-array and
      // the salvage dropped every finding (a summary that listed issues rendered as
      // "No significant issues flagged"). `reasoning_effort: low` caps thinking (~1k
      // tokens, measured) so the budget goes to the review; 16k then fits a thorough
      // multi-finding review with headroom.
      max_tokens: 16384,
      reasoning_effort: "low",
      // Force bare JSON. Without this the model tends to prepend a prose preamble
      // ("An excellent change... I have one finding...") before the object; the
      // first-brace/last-brace salvage handled it only sometimes, so a real review
      // intermittently rendered as "No significant issues flagged". json_object mode
      // guarantees the response IS the object, with no preamble to strip.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Vertex ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content)
    throw new Error(
      `Vertex returned no message content: ${text.slice(0, 300)}`,
    );
  return content;
}

// The model is asked for a bare JSON object, but be lenient: strip code fences and
// grab the outermost {...} so a stray wrapper doesn't lose us the whole review.
function parseReview(raw) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  try {
    const obj = JSON.parse(s);
    return {
      summary:
        typeof obj.summary === "string"
          ? obj.summary
          : "(model returned no summary)",
      findings: Array.isArray(obj.findings) ? obj.findings : [],
    };
  } catch {
    // Un-parseable (e.g. the model truncated mid-JSON). Salvage the summary string
    // if it's there so we render something readable rather than a raw JSON dump.
    const m = s.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const summary = m
      ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") +
        " _(model output was truncated; findings omitted.)_"
      : raw.slice(0, 1500);
    return { summary, findings: [], unparsed: true };
  }
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const SEV_EMOJI = { high: "🔴", medium: "🟠", low: "🟡" };

function renderMarkdown({
  review,
  model,
  truncated,
  fileCount,
  instructionSources = [],
}) {
  const lines = [`## Gemini review (pilot)`, ``];
  lines.push(
    `_Model: \`${model}\`. Automated, non-gating pilot — a second opinion, not a merge gate._`,
  );
  if (instructionSources.length) {
    lines.push("");
    lines.push(
      `_Applied repo review instructions: ${instructionSources.map((s) => `\`${s}\``).join(", ")}._`,
    );
  }
  if (truncated) {
    lines.push("");
    lines.push(
      `> ⚠️ The diff was **truncated** (${fileCount} files changed, over the ${DIFF_CHAR_BUDGET.toLocaleString()}-char budget). Findings cover a sampled subset of the changes.`,
    );
  }
  lines.push("", "### Summary", "", review.summary || "(none)");

  const findings = [...(review.findings || [])].sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3),
  );
  lines.push("", "### Findings", "");
  if (findings.length === 0) {
    lines.push("No significant issues flagged.");
  } else {
    for (const f of findings) {
      const sev = String(f.severity || "low").toLowerCase();
      const loc = [
        f.file,
        f.line != null && f.line !== "" ? `L${f.line}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `- ${SEV_EMOJI[sev] || "⚪"} **${sev}**${loc ? ` \`${loc}\`` : ""} — ${f.issue || "(no detail)"}`,
      );
      if (f.suggestion) lines.push(`  - _Suggestion:_ ${f.suggestion}`);
    }
  }
  lines.push(
    "",
    "<sub>🤖 Gemini via Vertex AI (keyless WIF, GCP credits). Pilot in production-master-service.</sub>",
  );
  return lines.join("\n");
}

async function main() {
  requireEnv("GITHUB_TOKEN");
  requireEnv("VERTEX_TOKEN");
  const repo = requireEnv("GITHUB_REPOSITORY");
  const prNumber = requireEnv("PR_NUMBER");

  const pr = await gh(`/repos/${repo}/pulls/${prNumber}`);
  if (pr.draft) bailNonGating(`PR #${prNumber} is a draft — skipping.`);

  const diff = await gh(`/repos/${repo}/pulls/${prNumber}`, {
    accept: "application/vnd.github.diff",
  });
  if (!diff.trim())
    bailNonGating(`PR #${prNumber} has an empty diff — nothing to review.`);

  const diffPayload = buildDiffPayload(diff);

  // Build the system prompt from the repo's own instruction files, scoped to the
  // files this PR actually changes.
  const diffFiles = segmentDiff(diff).map((s) => s.file);
  const { prompt: systemPrompt, sources: instructionSources } =
    buildSystemPrompt(diffFiles);
  console.log(
    instructionSources.length
      ? `Loaded repo review instructions: ${instructionSources.join(", ")}`
      : "No repo instruction files found — using the generic fallback prompt.",
  );

  let raw;
  try {
    raw = await callGemini({
      title: pr.title,
      body: pr.body,
      diffPayload,
      systemPrompt,
    });
  } catch (err) {
    // The whole point of the non-gating contract: a Vertex/WIF failure warns, never reds.
    bailNonGating(`Vertex review call failed: ${err.message}`);
  }

  const review = parseReview(raw);
  const markdown = renderMarkdown({
    review,
    model: VERTEX_MODEL,
    truncated: diffPayload.truncated,
    fileCount: diffPayload.fileCount,
    instructionSources,
  });

  try {
    await gh(`/repos/${repo}/pulls/${prNumber}/reviews`, {
      method: "POST",
      body: { event: "COMMENT", body: markdown },
    });
  } catch (err) {
    bailNonGating(`posting the review failed: ${err.message}`);
  }

  console.log(
    `Gemini review posted to ${repo}#${prNumber} (${review.findings.length} finding(s)` +
      `${diffPayload.truncated ? ", diff truncated" : ""}).`,
  );
}

main().catch((err) => bailNonGating(`unexpected error: ${err?.stack || err}`));
