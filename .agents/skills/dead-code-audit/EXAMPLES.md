# Dead Code Audit Examples

## Audit-Only Scan

**Request:** "Run a dead-code scan and report what is dead."

**Action:** Run the tools. Inspect each finding. Return the classifications without edits.

**Result:** The report separates proven dead code from false positives and unresolved findings.

## Proven Helper Cleanup

**Request:** "Remove the unused parser helper from the scan."

**Action:** Check every applicable evidence path before you remove the smallest dead slice.

**Result:** The focused deletion passes the complete validation sequence.

## Host-Wiring False Positive

**Request:** "Explain why the scan marks this view model as unused."

**Action:** Trace React use, state selectors, dynamic imports, IPC, and entrypoint wiring before any edit.

**Result:** The report identifies the live path and gives a narrow recurring suppression only when necessary.
