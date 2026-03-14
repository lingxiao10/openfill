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
基于以下来填写表单，能够使用多行动序列就使用行动序列（而不是每次只一个行动）先把普通的输入框填写完，然后处理复杂的组件（例如下拉框、时间/日期组件），而且复杂组件需要一步步的进行操作，需要观察展开的菜单一步步的选择。
对于添加条目的场景注意必须要先添加再保存（如果有添加按钮）
你的填写必须要非常非常谨慎，可靠，每一个词填写之后不要想当然觉得成功了，都要自我检查。