## Agent skills

### Issue tracker

Task Manager is the issue tracker for this repository. Use its `task` CLI for
issue, spec, implementation-ticket, triage, and Wayfinder work; read
`docs/agents/issue-tracker.md` first. Task Manager natively owns the canonical
Matt triage roles, so no separate label mapping is maintained.

### Domain docs

This is a single-context repository. Read `CONTEXT.md` and relevant ADRs under
`docs/adr/` before domain exploration; see `docs/agents/domain.md`.

<!-- project_map:agents -->
## Project Map CLI

PM := project-map; project_map.md.read := forbidden

navigation.start := PM
manageable(relevant files) => PM regions <paths...>
otherwise => narrow with PM tree [paths...], then PM regions <paths...>
Read regionized files only within reported ranges.
activity(file) := count(last 50 commits touching file)
reported token counts => estimate context cost and scope work
JSON.regions := inferred(document structure)
JSON.global := counts only; JSON.details := PM regions <path.json>
Markdown.frontmatter := PM md; Markdown.headings := PM md [paths...]

Write code with regions. Check PM regions --needs-attention [paths...] and address its findings when safe; requested work > maintenance.

.projectmapignore := .gitignore semantics for Project Map discovery

Every functional PM command automatically validates the persistent snapshot, rescans changed inputs, and synchronizes managed artifacts before rendering.
separate(refresh | synchronization | generator) := forbidden
<!-- project_map:agents:end -->
