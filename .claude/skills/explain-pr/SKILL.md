---
name: explain-pr
description: Explain a roadmap PR in plain language - the big picture, what it builds, what to learn and watch out for, which files matter, and what the user must do. Use when the user asks what a PR is about, what to learn from it, or what to care about in a phase.
argument-hint: <PR number>
---

# Explain a PR for learning

The reader is learning MCP and DevOps through this project, one phase at a time. They need orientation and learning priorities, not a reviewer's summary.

## Gather

1. `gh pr view $ARGUMENTS --json title,body,headRefName,files,statusCheckRollup`
2. Read the docs the PR adds or changes, especially the phase plan (`docs/superpowers/plans/`), any ADRs (`docs/adr/`), any write-ups (`docs/writeups/`) and `docs/threat-model.md`. They explain the "why".
3. Skim the main source files only as far as you need to explain them.

## Write it in this format

### 1. The big picture
Explain the concept behind the PR in 2–4 plain sentences, assuming no prior knowledge. Say where it fits in the DevOps MCP Hub (credential brokering, policy, approvals, audit) and which phase or gate it belongs to.

### 2. What this PR does
- State the one question or goal of the phase.
- Give numbered steps for what was built, each with a one-line reason.
- Say plainly what it does **not** build yet.

### 3. The things worth knowing (3–5)
Pick the concepts, gotchas and decisions most worth learning. For each one, say what it is and **why it matters for the hub**. Include traps that tutorials won't warn about. For anything security-related, give the risk in one line.

### 4. The files that matter
Use a table with `File | What it is`. Mark the one to read first. Put config, lockfiles and other housekeeping in one line, labelled as housekeeping.

### 5. What you need to do
List the reading, manual checks (screenshots, Inspector, browser), open gate items and the merge decision. Mention any CI or Node version problems.

## Style
- Define jargon the first time it appears: spike, ADR, SDK, stdio, JSON-RPC, and so on.
- Keep it short, with plain sentences and no padding.
- End by offering to walk through one part in more depth.
