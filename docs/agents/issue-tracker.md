# Issue Tracker: Task Manager

Task Manager is the issue tracker for this repository.

`task` CLI operations are the only task mutation path. Direct
`.task-manager/task-manager.db` access is outside the contract.

External pull requests are not a request surface.

## Matt triage roles

Task Manager natively owns the canonical Matt triage roles. Apply them with:

```text
task matt set ENTITY_ID MATT_ROLE --author ASSIGNEE
```

```text
MATT_ROLE := unlabeled | needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix
```

`wontfix` additionally requires `--resolution SOURCE`.

Do not create or consult a separate triage-label mapping: Task Manager's native
roles are the authoritative vocabulary.

## Workflow boundary

Use Task Manager for issue, spec, implementation-ticket, triage, and Wayfinder
work. Query before creating a task to avoid duplicates, and use only returned task
IDs for follow-up operations.

Before substantive implementation, track the work, assign the executing agent, and
move the work item to `In Progress`.
