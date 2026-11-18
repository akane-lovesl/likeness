# Likeness

Likeness is a local portrait studio with seven visual styles. It has a browser showcase, a local simulator, and a GPU renderer.

## Start the showcase

Install the locked Node dependencies and open the address printed by the server.

    npm ci
    npm run serve

The showcase uses a procedural renderer and bundled browser assets.

## Start the local studio

Use uv with Python 3.12 or newer. The simulator runs without GPU models.

    uv sync --locked
    uv run likeness serve --engine mock --host localhost

For GPU rendering, install the GPU dependency group and fetch the pinned models. Their licenses are listed in the model manifest.

    uv sync --locked --group gpu
    uv run likeness fetch qwen21_turbo faces
    uv run likeness serve --engine qwen21_turbo --host localhost

Open the studio address printed by the server. The app labels the active edition and shows a processing trace for each portrait.

## Development

    npm run check
    npm test
    uv run pytest

The browser app is in web and the Python server is in likeness. The bundled test sittings are drawings. See the vendor notes for the browser assets and the relay guide for local setup and benchmark tasks.

Photos, rendered portraits, generated reports, logs, and GPU checkpoints belong in local storage. The project ignores these paths.
