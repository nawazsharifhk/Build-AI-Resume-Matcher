# Resume Match AI

A local-first resume analyzer that compares a resume with a job description, explains skill matches and gaps, and creates practical improvement suggestions and interview questions.

## Run on Windows

1. Install Python 3.10 or newer.
2. Double-click `run.bat` (or run it from PowerShell).
3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

The first launch creates a local virtual environment and installs the small set of Python dependencies. The app binds to `127.0.0.1` so it stays on your machine.

## Local LLM (optional)

The app works without an LLM. Its local NLP mode calculates the match score and produces grounded suggestions and interview questions. For LLM-written coaching, install [Ollama](https://ollama.com) and pull the default model:

```sh
ollama pull qwen3.5:2b-q4_K_M
```

Enable **Use local LLM** in the app. The default is Qwen 3.5 2B in a compact quantization for faster local responses; larger models remain selectable in Settings. When the local Ollama server is stopped, the app starts it automatically. Settings can test the connection and list installed models. The default endpoint is `http://127.0.0.1:11434`; you can change the endpoint and model in Settings. The analysis score remains an explainable NLP calculation in either mode.

## Files and privacy

- `app.py` contains the API, document parsers, scoring, and optional Ollama integration.
- `web/` contains the responsive interface and its browser-side API client.
- `GET /api/health`, `GET /api/ollama/models`, `POST /api/ollama/test`, and `POST /api/analyze` are available. Interactive API docs are at `/docs`.
- Optional server defaults can be set in a `.env` file copied from `.env.example`; the browser Settings panel can save a local Ollama address and model on this device.
- Resume contents are processed in memory and are not stored by the server. Recent match summaries can be saved in the browser on the current device; they do not include the uploaded file or raw resume text.
- PDF, DOCX, TXT, and MD files are supported for both resumes and job descriptions (8 MB maximum per file). Scanned image-only PDFs need OCR before upload.
- Interview questions are grounded in detected role skills and responsibility statements. Course recommendations include a Coursera course search for every detected missing skill and attach a related practice question.

## Notes

The skill matcher uses a curated phrase library, so it is useful but not a replacement for a human review. A listed gap means the phrase was not found in the resume text; it does not prove you lack that skill.
