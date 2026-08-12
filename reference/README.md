# reference/ — historical snapshots, NOT authoritative

Nothing in this folder is read by the build. It is kept for provenance only.

| File | What it is |
|---|---|
| `SpaceX_PL_Business_Case_Model.xlsx` | The original workbook the dashboard's figures were first derived from. |
| `build_spacex_model.py` | The script that generated that workbook. |

**The live model lives in [`src/dashboard/assumptions.js`](../src/dashboard/assumptions.js).**

These two files and the dashboard are now independent. Changing the spreadsheet or
re-running the Python script has no effect on the site, and the dashboard's figures
have already diverged wherever assumptions were recalibrated since. Do not treat
them as a source to sync from — read them as a record of where the model started.
