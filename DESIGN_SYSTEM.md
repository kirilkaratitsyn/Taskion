# Taskion Design System

This file defines the current visual language of Taskion. Future UI changes should stay aligned with these rules unless there is a deliberate redesign.

## Core Direction

- Visual style: clean, premium, minimal, product-like
- Inspiration: shadcn-like structure with a light Vercel-style polish
- Background: always light, never dark by default
- Tone: calm, neutral, focused, low-noise
- Density: compact but not cramped

## Design Principles

- Prefer white and near-white surfaces over tinted panels
- Use subtle borders before strong shadows
- Keep contrast high for text and low for chrome
- Let spacing and typography do most of the work
- Avoid decorative clutter, gradients should stay soft
- Reuse existing component classes before inventing new patterns
- States should be shown through small color shifts, not heavy effects

## Tokens

Main tokens live in [src/style.css](/Users/kirilkaratitsyn/Documents/GitHub/Taskion/src/style.css).

### Colors

- `--background`: base page background
- `--foreground`: main text color
- `--card`: card background
- `--muted`: subtle surface
- `--muted-foreground`: secondary text
- `--border`: default border
- `--primary`: primary action color
- `--primary-foreground`: text on primary actions
- `--ring`: focus ring

### Shape

- Main radius token: `--radius: 14px`
- Chips and compact controls use `10px`
- Cards use `calc(var(--radius) + 2px)`

### Motion

- Default transition token: `--transition: 160ms ease`
- Control transitions: `0.15s cubic-bezier(0.4, 0, 0.2, 1)`

### Typography

- Primary font stack: `Geist`, `Geist Fallback`, `Manrope`, `Inter`, `SF Pro Display`, sans-serif
- Titles use tighter tracking
- Supporting text uses `--muted-foreground`

## Layout Rules

- Page container: `.app-wrapper`
- Global shell spacing: `.app-shell`
- Main composition: `.layout-grid`
- Current page structure:
  - left column: auth + pomodoro
  - right column: task form + todo list
- Inner column stacks use `.layout-column`
- Mobile should collapse to one column

## Surface System

### Cards

Use `.card` as the default surface.

Rules:

- border first, shadow second
- white background
- compact padding
- headers separated by spacing, not dividers

Related classes:

- `.card-header`
- `.card-header-inline`
- `.card-title`
- `.card-description`
- `.card-content`

## Form System

### Fields

Use:

- `.field`
- `.field-label`

Input behavior:

- white background
- subtle border
- strong focus ring
- muted placeholder

### Buttons

Use `.button` as base.

Variants:

- `.button-primary`
- `.button-secondary`

Rules:

- primary buttons are dark
- secondary buttons stay light and neutral
- never introduce bright accent colors unless tied to a semantic state

## Compact Controls

### Chips

Use `.chip` for segmented or filter-like controls.

Active state:

- `.chip-active`

Usage:

- task filters
- pomodoro mode selectors

Rules:

- compact height
- rounded 10px corners
- muted background by default
- dark fill when active

## Auth Messaging

The auth form has a dedicated message block.

Use:

- `.auth-message`
- `.auth-message-indicator`
- `.auth-message-content`
- `.auth-message-title`
- `.auth-message-text`

Variants:

- `.auth-message-success`
- `.auth-message-error`
- `.auth-message-neutral`

Rules:

- keep messages concise
- one title line, one short explanatory line
- do not use toast-like styling for auth inside this card

## Task List System

### Task Items

Use:

- `.task-item`
- `.task-item-main`
- `.task-item-title`
- `.task-item-meta`
- `.task-item-actions`

Task meta uses:

- `.task-status`
- `.task-created-at`

Status variants:

- `.task-status-todo`
- `.task-status-in_progress`
- `.task-status-done`

Task actions:

- `.task-next-status-button`
- `.task-delete-button`

Rules:

- task rows should feel structured, not playful
- keep action buttons compact
- status pill should read quickly at a glance

## Pomodoro System

### Main structure

Use:

- `.card-pomodoro`
- `.pomodoro-shell`
- `.pomodoro-display`
- `.pomodoro-label`
- `.pomodoro-time`
- `.pomodoro-modes`
- `.pomodoro-actions`
- `.pomodoro-stats`

Mode buttons:

- `.pomodoro-mode-button`

Primary actions:

- `.pomodoro-primary-button`
- `.pomodoro-reset-button`

Stats:

- `.pomodoro-stat`
- `.pomodoro-stat-label`
- `.pomodoro-stat-value`

State styling:

- `.pomodoro-primary-button[data-state="idle"]`
- `.pomodoro-primary-button[data-state="running"]`
- `.pomodoro-primary-button[data-state="finished"]`

Rules:

- timer text is the strongest element in the card
- mode buttons stay visually related to task filter chips
- pause and stop should be distinguishable by color/state, but still part of the same system
- disabled mode buttons should look intentionally inactive

## Top Bar

Use:

- `.topbar-actions`
- `.topbar-user-info`
- `.topbar-user-email`
- `.topbar-sign-out-button`

Rules:

- top bar stays light and compact
- user badge should feel informational, not promotional

## Empty States

Use:

- `.empty-state`

Rules:

- centered text
- dashed border
- muted supporting copy
- no loud illustration style

## Responsive Rules

- desktop: 2 clear columns
- tablet: preserve hierarchy, reduce gaps
- mobile: collapse to one column
- stacked buttons should stretch to full width on small screens

## Do

- Reuse current spacing rhythm: 8, 10, 12, 16, 18, 20, 24
- Keep controls compact and consistent
- Use semantic state colors only for meaningful changes
- Match new blocks to existing card and form patterns
- Keep new UI readable without extra decoration

## Don’t

- Do not introduce dark sections
- Do not use bright gradients or neon accents
- Do not add oversized shadows
- Do not mix multiple visual systems on one page
- Do not create custom one-off components if an existing class pattern fits

## Implementation Notes For Future Agents

- Prefer extending existing classes in [src/style.css](/Users/kirilkaratitsyn/Documents/GitHub/Taskion/src/style.css)
- If adding a new block, first check whether it can fit into:
  - `.card`
  - `.field`
  - `.button`
  - `.chip`
- If introducing new states, follow the existing naming style:
  - `component`
  - `component-part`
  - `component-variant`
- Preserve the current left/right information architecture unless asked to redesign
