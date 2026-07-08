# Handoff: Kill the static "I've created X…" greeting on project create

**Date:** 2026-07-08
**Lane:** Backend (Axiom-Atlas repo, Cloud Run)
**Repo file:** `src/routes/projects.ts`

## Problem

When a user creates a project from the home surface with an explicit
build prompt (e.g. "Build a premium single-page app called Sovereign
Focus…"), the backend still returns a hard-coded greeting:

> I've created {project.name}.
>
> We don't need to define everything right now — that's what this space is for.
>
> Tell me where your head is today. Are we exploring an idea, solving a problem, designing something new, or refining something that already exists?

This overwrites/ignores the user's actual intent and reads as if Atlas
didn't hear them. It creates friction on every project create.

## Location

`artifacts/api-server/src/routes/projects.ts` — the branch that assigns:

```ts
message = `I've created ${project.name}.\n\nWe don't need to define everything right now — that's what this ...`;
```

(The frontend consumes this as the first assistant turn in the new
project's workspace conversation.)

## Required change

The create-project request already carries the user's opening prompt
(the message they typed on home before hitting Build / Ask Atlas).
Branch on presence of that prompt:

1. **When an opening prompt is present** (build intent, spec, or any
   non-empty user message accompanying the create):
   - Do **not** emit the static "where's your head at" greeting.
   - Either (a) skip inserting an assistant opener entirely and let the
     normal Atlas response to that user message be the first turn, or
     (b) insert a short acknowledgement grounded in the user's prompt
     (one line, no reset questions). Preferred: (a).

2. **When no opening prompt is present** (blank create from the
   briefcase / project list):
   - Keep a **short neutral opener** — one line, no interrogation.
     Example: `"{project.name} is ready. What are we building?"`
   - Remove the four-option "exploring / solving / designing / refining"
     question.

## Acceptance

- Create project from home with a build prompt → workspace opens, the
  first assistant turn is Atlas responding to the actual prompt (or no
  static opener at all). The "where's your head at" text never appears.
- Create empty project from briefcase → workspace opens with a single
  short neutral line, no multi-option question.
- Existing projects unaffected (this only changes the create-time
  seeded message).

## Frontend

No frontend changes required — the workspace chat already renders
whatever the backend seeds. Once this ships, the friction is gone.
