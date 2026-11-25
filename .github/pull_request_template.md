## Summary

<!-- One or two sentences: what this PR delivers and why. -->

Closes #<issue-number>
**Phase:** <n> · **Milestone:** Gate <A/B/C/D> · **Plan:** `docs/superpowers/plans/<file>.md`

## What changed

- <package/app>: <change>
- <package/app>: <change>

## Step by step: what the code does (`<main file>`)

<!-- Walk the PR's main runtime flow in the order the code runs. Each step: the function or call,
     the real values (endpoint, header, claim, timeout, cache margin) and why, in a few words.
     End with where the real work happens and what does or doesn't travel there.
     Docs-only PR: walk the process the docs describe. Several flows: walk the main one. -->

1. <step>: <function/call, real values>. <why>
   - <field>: <meaning>
2. <step>
3. <where the real work happens, and what is / is not sent>

## How to test

<!-- Steps a reviewer can copy and run to check this PR themselves. -->

1. `git checkout <branch> && pnpm install`
2. `pnpm test`
3. <manual step, e.g. a command to run and the output to expect>

## How it was verified

- [ ] `pnpm typecheck`: passes
- [ ] `pnpm test`: <N> tests pass
- [ ] `pnpm lint` / `pnpm format:check`: clean
- [ ] Manual check: <e.g. Inspector `--protocol-era modern` lists and calls X>

## Gate / done-when

<!-- Copy the "Done when" lines from the issue and tick what this PR proves. -->

- [ ] <criterion>

## Decisions and deviations from the plan

<!-- Anything that differs from the plan or blueprint, and why. Link ADRs. -->

- <decision> — <why>

## Security and threat-model impact

<!-- Which threat-model rows this touches; new secrets, tokens or untrusted input? Write "None" if none. -->

- <row / "None">

## Follow-ups

<!-- Deferred items; open issues for anything that must not be forgotten. -->

- <item>

## Screenshots / output

<!-- Inspector screenshots, CLI output, UI changes. -->
