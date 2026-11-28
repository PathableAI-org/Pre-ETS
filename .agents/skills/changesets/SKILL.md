---
name: changesets
description: Write a Changesets file for a change to a workspace published to npm, choosing patch, minor, or major under the 0.x convention and writing the changelog summary for package consumers. Use when a change alters what a published package ships, when asked to add or review a changeset, or when choosing a version bump.
---

# Changesets

A changeset is a Markdown file in `.changeset/` that names each published package a change releases, the bump each
gets, and the summary that becomes that package's changelog entry. `pnpm changeset` creates one interactively; writing
the file directly is equivalent:

```md
---
"@scope/package": minor
---

Summary for the changelog.
```

## 1. Decide whether a changeset is needed

A workspace is **published** when its `package.json` is not `"private": true`. Add a changeset when a change alters
what a published package ships: its runtime behavior, its types and exports, its dependencies or peer dependencies, or
the agent guidance and other files it distributes. A change confined to CI, tests, tooling, repository documentation,
or a private workspace needs no changeset.

Done when every published package whose shipped contents the change alters is named in a changeset.

## 2. Classify the change

The **public contract** is what a consumer of the last released version could rely on: exported names and types,
documented behavior, the shape of shipped files, and supported dependency ranges. Classify each change against it:

- **Breaking**: alters the public contract of a component that has already been released. Removing or renaming an
  export, narrowing an accepted input, widening a returned type, changing documented behavior, raising a peer
  dependency's minimum, or removing shipped guidance a consumer's agents follow. A component never released cannot
  break anything; changing it is a feature.
- **Feature**: adds to the contract without altering it. A new export, option, or guidance topic, or accepting more
  input. Deprecating something is a feature too: it ships before any removal, and the removal is breaking.
- **Fix**: brings behavior in line with what a user would have expected from the last release. Judge by that
  expectation, not by whether the code was "wrong": if users could not have expected the new behavior, it is a feature,
  and if they relied on the old behavior, it is breaking.

A dependency update with no change to the contract is a fix. Classify any contract change it causes on its own terms.

Done when every change has one class and you can name the contract element each breaking change alters.

## 3. Choose the bump

Read the package's current `version`, then map the class:

| Class    | Package at `0.y.z` | Package at `1.0.0` or later |
| -------- | ------------------ | --------------------------- |
| Breaking | `minor`            | `major`                     |
| Feature  | `patch`            | `minor`                     |
| Fix      | `patch`            | `patch`                     |

Changesets applies semver literally, so `major` on a `0.y.z` package releases `1.0.0`. Reserve `major` on 0.x for a
person's explicit decision to release 1.0.0, and ask before writing it. When several changesets name one package, it
releases at the highest bump among them.

## 4. Split into changesets

Write one changeset per changelog entry. List several packages in one file only when the same sentence is true for
each. Use separate files when packages need different wording, or when distinct changes to one package each deserve
their own entry. Until release, edit or delete an existing changeset rather than adding one that corrects it.

## 5. Write the summary

The reader is a developer who consumes the package from npm and sees only the changelog and the package. Write for
them:

- Open with one past-tense sentence saying what was added, changed, deprecated, removed, fixed, or secured, named by
  the exported identifier, option, or guidance topic the reader uses.
- Add why only when it affects the reader's decision to adopt or migrate.
- For every breaking change, start with `**Breaking:**`, because on 0.x the default changelog files it under "Minor
  Changes". Then give migration steps: the old form, the new form, and what to change in their code.
- For a deprecation, name the replacement and say the old form will be removed in a later breaking release.
- Describe behavior the reader can observe. Internal refactors, file moves, test changes, ticket numbers, and commit
  messages belong in the pull request.

A fix needs one sentence; a breaking change needs as much as migration takes.

## Examples

0.x package, breaking:

```md
---
"@scope/forms": minor
---

**Breaking:** `useField` now returns `{ value, error }` instead of a `[value, error]` tuple.

Replace `const [value, error] = useField(name)` with `const { value, error } = useField(name)`.
```

0.x package, feature:

```md
---
"@scope/forms": patch
---

Added a `validateOn` option to `useField` that accepts `"blur"` or `"change"`; it defaults to `"blur"`, as before.
```

Fix:

```md
---
"@scope/forms": patch
---

Fixed `useField` reporting the previous value's error for one render after the value changes.
```

Shipped agent guidance:

```md
---
"@scope/forms": patch
---

Added agent guidance on composing `useField` with server actions.
```

A summary that reads "Refactor field hook internals (#123)" fails the reader: it names no behavior they can observe.
If that refactor changed no behavior, the package needs no changeset.
