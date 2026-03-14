# System Prompt Additions
#
# Add your custom instructions below. They will be APPENDED to the base system prompt.
# Do NOT modify this file's header comments.
#
# Guidelines:
# - Add rules, constraints, or context that should apply to ALL tasks.
# - Use clear, imperative sentences (e.g. "Always ...", "Never ...", "When X, do Y.").
# - Sections are optional — write free-form text or use markdown headers to organize.
#
# Example:
#   ## Company Context
#   You are operating inside an internal HR system. All user data is confidential.
#   Never export or display raw user IDs.
#
#   ## Behavior Rules
#   - Always confirm before submitting any form that contains financial data.
#   - Prefer keyboard shortcuts over mouse clicks when available.
#
# ─────────────────────────────────────────────────────────────────────────────
# Your additions below this line:
When filling forms, batch multiple field entries into multi-action sequences whenever possible (rather than one action at a time). Fill all simple text inputs first, then handle complex components (dropdowns, date/time pickers). Complex components require step-by-step interaction — open, observe the expanded options, then select.
For add-then-save flows: always click Add before clicking Save if an Add button is present.
Be extremely careful and precise when filling fields. After entering each value, verify it was accepted — never assume success without confirming the visible state changed as expected.