# ReviewLens deployment repair

## Diagnosis and architecture

Render built successfully but killed the process after RAM exceeded 512 MB.
The original main.py imported both ML runtimes and loaded both models before
Uvicorn could listen. Lazy loading alone would only postpone that memory problem.

The extension still extracts reviews and confirms matching products. Render keeps
POST /analyze, aspect keywords, duplicate normalization, rating mismatches,
aspect sentiment totals, and the original JSON fields. A separate worker returns
DistilBERT sentiments and MiniLM embeddings. Render calculates cosine similarity
with the standard library and preserves the 0.80 threshold. Exact duplicates
are still marked on the second and later occurrences within each request.
Semantic similarity remains between reviews of one listing, as in the original;
comparison still analyzes the two listings independently in the extension.

## Hosting decision — no purchase required by this patch

The worker must run outside Render's 512 MB service. It can run on your laptop
for free, or on a CPU host with sufficient RAM. For an entirely local free demo,
run worker + backend locally and set the extension URL to http://127.0.0.1:8001.
Render can call a laptop worker only through a reachable HTTPS endpoint, such as
an authenticated worker behind a tunnel. Never use localhost as INFERENCE_URL
on Render: that points to Render itself. Tunnel setup and uptime are separate
from this code; no tunnel, public deployment, or account has been created here.

Current official HF docs say creating new Docker/standard Gradio Spaces requires
a paid plan even though CPU Basic has no hourly charge. Do not buy PRO or choose
paid hardware for this patch. If your account already permits a no-cost Docker
Space, the supplied worker is compatible. Verify the UI shows no charge first.
Free ZeroGPU hosting is documented for eligible personal accounts, but uses the
Gradio SDK and quotas; this FastAPI Docker worker is NOT a ZeroGPU deployment.
No claim is made that a new always-on cloud worker is universally available free.

References checked on 12 November 2026:
- https://huggingface.co/docs/hub/en/spaces-overview
- https://huggingface.co/docs/hub/en/spaces-zerogpu

## Apply files

Copy backend/ and extension/ over the corresponding project directories.
Add inference-worker/ as a new directory. Keep your git history and virtual
environments. Review the changes before committing. This package contains no keys.

## Start the worker locally (Python 3.11, PowerShell)

From inference-worker/:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:INFERENCE_API_KEY = 'REPLACE_WITH_A_LONG_RANDOM_SECRET'
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7860 --workers 1
```

Model downloads require network access on first startup. /health becomes ready
only after both models load. Keep one worker process; inference requests queue
behind a lock, including the extension's two parallel comparison requests.

For an eligible Docker Space: upload the CONTENTS of inference-worker/ to its
repository root, retain the README YAML, use port 7860, and set
INFERENCE_API_KEY as a secret. Wait until GET /health returns ready.
The shared secret authenticates /infer; never put it in the extension.

## Configure Render

Use the existing service, branch cross-platform-development, Free instance:

- Root directory: backend
- Build: pip install -r requirements.txt
- Start: uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
- Health check: /health
- Environment: PYTHON_VERSION=3.11.11
- Environment: INFERENCE_URL=https://YOUR-REACHABLE-WORKER (no /infer suffix)
- Secret: INFERENCE_API_KEY=the same worker secret

Commit and push your reviewed files, then clear Render's build cache and deploy
so old ML dependencies are removed. Do not increase the instance tier.
GET /health checks the lightweight API only; a real /analyze call verifies the
worker connection. This avoids a sleeping worker making Render itself unhealthy.

## Update the extension

Replace https://YOUR-RENDER-SERVICE.onrender.com in BOTH extension/popup.js
and extension/manifest.json with the exact URL shown in your Render dashboard.
Both single-listing analysis and comparison now use BACKEND_URL.
Reload the unpacked extension in chrome://extensions and refresh both shops.
No extraction selectors or comparison UI were changed.

## Validate before and after deployment

In a backend environment that has the requirements installed:

```powershell
python test_solution.py
```

The six handler-level tests mock the inference HTTP response deliberately. HTTP/ASGI testing was blocked by the managed host worker-thread restriction; the suite invokes the real handlers directly and inspects CORS configuration. These are not live endpoint tests. To exercise real
cached models in the worker environment, run python test_real_models.py from
the package root. That smoke test sets offline mode; initial model downloads
must have completed first. The dependency pins target a fresh Python 3.11
installation; local tests used the existing installed environment, so a clean
Docker image build remains a deployment verification step.

Live check (PowerShell):

```powershell
$base = 'https://YOUR-RENDER-SERVICE.onrender.com'
Invoke-RestMethod "$base/health"
$body = @{ platform='amazon'; product_name='Test shirt'; reviews=@(
    @{text='Soft comfortable fabric';rating=5},
    @{text='Terrible weak material';rating=5},
    @{text='Soft comfortable fabric';rating=5}
)} | ConvertTo-Json -Depth 5
Invoke-RestMethod "$base/analyze" -Method Post -ContentType 'application/json' -Body $body
```

Expect 3 reviews, positive/negative/positive sentiment, second occurrence marked
duplicate, similarity near 1 for identical texts, and a mismatch on the negative
5-star review. Repeat with platform='flipkart', then test real product extraction
and comparison in Chrome. Actual predictions can vary slightly by model/runtime.

## Limits

- Up to 100 reviews per request, 10000 characters per review; blank/empty text
  has input restrictions. Sentiment preserves the original first-512-character
  cutoff and adds token truncation. These prevent unbounded memory/latency.
- Render and external workers can sleep. Worker timeout returns 504; unavailable,
  unconfigured, or malformed inference returns 503. No lexical fallback fabricates
  model predictions. Retry after the worker wakes.
- Laptop inference requires the laptop to stay awake and reachable. Public/free
  cloud availability, quotas, privacy, and uptime depend on the provider.
- The existing keyword aspect detector and review-level aspect sentiment remain
  heuristic. Similarity/duplicates are signals, not proof of fake reviews.
- The public Render /analyze endpoint has no user authentication (as before).
  A public launch should add rate limiting to protect inference capacity.
- No paid plan, account, Render setting, repository commit, or live deployment
  was modified automatically. Live HTTP tests require your deployed addresses.
