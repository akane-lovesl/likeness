# Local studio tasks

The relay runner executes the stages in each task.toml. Start from the repository root.

    uv run likeness relay pending
    uv run likeness relay run 0001

Task 0001 checks GPU access, runs the existing tests, fetches the pinned models, and exercises the renderer. The optional FLUX stages require access to their licensed checkpoint.

Task 0002 trains a likeness adapter. It requires the completed GPU setup, the user's input photographs, and ai-toolkit installed in workstation/ai-toolkit.

Run artifacts and generated reports stay local. Consult the task manifests for their commands and output locations.
