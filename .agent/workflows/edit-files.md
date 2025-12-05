---
description: How to safely edit files without corruption
---

# Safe File Editing Workflow

Follow these steps **every time** you edit a file to prevent corruption:

## Before Editing

1. **Always re-read the file immediately before editing**
   - Use `view_file` on the exact line range you plan to modify
   - Never rely on previously cached/viewed content
   - If the file has changed since you last viewed it, update your mental model

2. **Identify the exact target content**
   - Copy the **exact** characters including all whitespace and indentation
   - Pay special attention to:
     - Leading spaces/tabs (indentation must match exactly)
     - Trailing whitespace
     - Line endings
     - Empty lines

## During Editing

3. **Use the smallest possible replacement**
   - Target only the lines that actually need to change
   - Prefer `replace_file_content` for single contiguous blocks
   - Use `multi_replace_file_content` only for genuinely non-adjacent edits

4. **Double-check StartLine and EndLine**
   - Ensure the range contains exactly the target content
   - The range should not include duplicate instances of the target string

5. **Verify replacement content is complete**
   - The replacement must be a drop-in substitute
   - Preserve surrounding context (don't accidentally delete adjacent code)

## After Editing

6. **Verify the edit succeeded**
   - If the tool reports an error, re-read the file and retry
   - For critical changes, use `view_file` to confirm the result

## Common Pitfalls to Avoid

- ❌ Editing based on stale file content
- ❌ Guessing at indentation instead of copying exactly
- ❌ Using overly broad line ranges that might match multiple instances
- ❌ Replacing large blocks when small targeted edits would suffice
- ❌ Making parallel edit calls to the same file
