# Execution Regression Test Suite

A validation harness for the Axiom execution pipeline. This project exists to confirm that core execution capabilities work correctly after infrastructure changes, refactors, or deployments.

---

## What This Tests

| Capability | What's Validated |
|---|---|
| Conversational turns | Multi-turn state preservation across exchanges |
| File edits | FILE_EDIT → LOCAL_APPLY_SUCCESS → BUILD_VERIFY flow |
| Image generation | IMAGE_GEN token triggers and returns a rendered asset |
| BUILD_RUN | Shell commands execute and return output inline |
| GitHub push | Commit, push, and remote sync complete without error |
| Refresh persistence | Workspace state survives a full browser refresh |
| Receipt behavior | Execution results are correctly communicated back to the user |
| BUILD_VERIFY states | CLEAN, errors found, check_failed, and max_attempts_reached all behave as documented |

---

## How to Run

Open this project in the Axiom workspace and work through each capability in order. Each test is conversational — you trigger it by asking Atlas to perform the action and observing whether the result matches the expected behavior documented above.

No test runner required. This is a human-in-the-loop validation suite.

---

## Pass Criteria

A capability passes when the actual behavior matches the documented expected outcome with no unexpected errors, silent failures, or ambiguous states.

---

## Stack

React + Vite — minimal scaffold, no external dependencies beyond what Vite requires.