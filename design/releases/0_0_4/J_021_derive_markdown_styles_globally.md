---
author:
id: J-021
internalId: 11ffc4ac-44e0-4dab-a8d9-af9e83a43aff
title: derive active Markdown content styles once in the global theme
status: ready
owner:
affects:
  - app/src/theme/theme_context.ts
  - app/src/theme/theme_provider.tsx
  - app/src/theme/theme_provider.test.tsx
  - app/src/theme/use_app_theme.ts
  - app/src/components/editor/markdown_style_sx.ts
  - app/src/components/editor/markdown_editor.tsx
  - app/src/components/actions/action_conversation_chat.tsx
  - app/src/components/config/markdown_style_preview.tsx
policy:
  checkLinting: true
  requireTests: true
after: 4edefccb-f7e3-4ae1-9c0d-5939ac1d3745
---

## Goal

Build the active Markdown content styling once when the global Markdown style configuration changes. Components that render active Markdown consume the stable derived style and never rebuild it during unrelated renders.

This job is independent of the action-popup subscription refactor and should land before performance verification of that refactor.

## Current architecture

`AppThemeProvider` owns `markdownStyleConfig`, but consumers receive only the raw configuration. Both `MarkdownEditor` and `ActionConversationChat` call `buildMarkdownContentSx(markdownStyleConfig)` in their render bodies. The builder creates a new nested MUI style object even when the configuration is unchanged.

`MarkdownStylePreview` also calls the builder, but it renders an explicit configuration draft rather than the active global style.

## Required change

- Derive a stable `markdownContentSx` value in `AppThemeProvider` with `useMemo`, depending only on `markdownStyleConfig`.
- Expose the derived value through `AppThemeContextValue` and its fallback value.
- Make `MarkdownEditor` and `ActionConversationChat` consume `markdownContentSx` directly.
- Do not call `buildMarkdownContentSx` from either component.
- Keep `buildMarkdownContentSx` as a pure derivation function owned by the theme/style layer.
- Memoize `MarkdownStylePreview`'s derived style by its explicit `config` prop. The preview cannot consume the active global style because it must show unsaved draft configuration.
- Do not introduce a service class; this is a pure derived theme value.

## Identity contract

- `markdownContentSx` retains object identity across renders when `markdownStyleConfig` is unchanged.
- Changing palette mode, popup state, editor content, conversation content, or unrelated configuration does not rebuild it.
- Changing the active Markdown style configuration rebuilds it once and updates all active Markdown consumers.
- Changing the preview's explicit draft configuration rebuilds only the preview value.

## Testing implications

- Theme-provider tests prove the derived style is exposed and retains identity across unrelated provider renders.
- Theme-provider tests prove changing `markdownStyleConfig` replaces the derived value.
- Markdown editor and conversation-chat tests prove they use the provided derived style.
- Preview tests prove an explicit draft config updates the preview without changing the active global style.

## Acceptance criteria

- [ ] Active Markdown style construction occurs only in the global theme provider.
- [ ] `MarkdownEditor` and `ActionConversationChat` do not import or call `buildMarkdownContentSx`.
- [ ] The active derived style retains identity until `markdownStyleConfig` changes.
- [ ] `MarkdownStylePreview` derives only from its explicit config and memoizes that derivation.
- [ ] Existing Markdown appearance and live theme updates remain unchanged.
- [ ] App lint and tests pass.

