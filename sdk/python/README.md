# Production Master — Python SDK

A thin Python client for [Production Master](https://github.com/ProductionMasterAI/production-master).
It talks to the **same BFF + Stream Gateway** every other surface (Web, plugin,
CLI) uses — there is **no new backend and no privileged back door**. The client
only marshals requests, attaches a stable `Idempotency-Key` on mutations,
bridges the SSE stream with `Last-Event-ID` resume, and maps errors.

The runtime is **pure Python stdlib** — `pip install` pulls no third-party
dependencies, so install-to-first-`start_investigation` stays well under a
minute and CI stays hermetic.

## Install (beta)

The SDK is **pre-release** — not on PyPI yet. Use one of the beta paths below.

### From git (recommended)

```bash
pip install "git+https://github.com/ProductionMasterAI/production-master.git@main#subdirectory=sdk/python"
```

Pin a tag or commit for reproducible beta installs:

```bash
pip install "git+https://github.com/ProductionMasterAI/production-master.git@v0.1.0-beta.1#subdirectory=sdk/python"
```

### From a GitHub Release wheel

When a maintainer attaches build artifacts to a release:

```bash
pip install https://github.com/ProductionMasterAI/production-master/releases/download/v0.1.0-beta.1/production_master-0.1.0-py3-none-any.whl
```

Replace the URL with the wheel attached to the release you are targeting.

### PyPI (future)

When the product is ready for public distribution:

```bash
pip install production-master
```

The distribution name is `production-master`; the import package is
`production_master`.

## Point it at your service

Precedence is **explicit argument → `PM_SERVICE_URL` → built-in default**:

```bash
export PM_SERVICE_URL="https://bff.your-company.internal"   # self-hosted
```

```python
Client()                                        # PM_SERVICE_URL, else the default
Client(service_url="https://bff.example.com")   # wins over both
```

`PM_SERVICE_URL` is the same variable every editor registration in this repo
sets, so one variable points the plugin and the SDK at the same service.

The built-in default is the hosted service's own deployment origin rather than
a vanity API hostname. That is deliberate: a default pointing at a domain
nobody owns would hand the bearer token of every user who does not override it
to whoever registers that domain later. It moves to a vanity host once that
host is ours and serving the BFF.

## Authenticate

The SDK uses the same RFC 8628 device-code flow as the plugin/CLI. The token is
cached to `~/.config/production-master/token.json` with `0600` permissions.

```python
from production_master import login

# Prints a verification URL + user code, then blocks until you approve it.
login(service_url="https://production-master-service.vercel.app")
```

Once cached, `Client()` picks the token up automatically. You can also pass a
bearer token explicitly with `Client(token="...")`.

## Quickstart: `start_investigation` → `stream_events` → `get_report`

```python
from production_master import Client

client = Client()  # uses the cached device-code token

# 1. Start a run (POST /v1/runs with a stable Idempotency-Key).
inv = client.start_investigation({"ticket": "ACME-123", "title": "checkout 500s"})
print(inv.id, inv.uri)          # inv_… , investigation://inv_…

# 2. Stream events live (SSE with Last-Event-ID resume).
for event in inv.stream_events():
    print(event.sequence, event.type)

# 3. Fetch the rendered report and branch on the verdict.
report = inv.get_report(format="json")
if report["verdict"] == "CONFIRMED":
    print("Root cause:", report.get("rootCause"))

# Markdown is available too:
markdown = inv.get_report(format="md")
```

`start_investigation`, `stream_events`, and `get_report` are also available
directly on the `Client` (`client.stream_events(inv.id)`, etc.).

### Resuming a stream

`stream_events` reconnects automatically with `Last-Event-ID`. To resume from a
known position:

```python
# Replay the durable slice with sequence > 10, then attach the live stream.
for event in client.stream_events(inv.id, since_seq=10):
    ...

# Or resume from a specific event id.
for event in client.stream_events(inv.id, last_event_id="01J…"):
    ...
```

## Errors

Non-2xx responses raise typed errors that mirror the other SDKs:

| Status | Exception |
|--------|-----------|
| 409 | `IdempotencyConflict` |
| 402 | `BudgetExhausted` |
| 404 | `NotFound` |
| 403 | `NotFound` (no-enumeration: a forbidden singleton looks like not-found) |
| other | `ServiceError` (code `UNKNOWN`) |

```python
from production_master import BudgetExhausted, NotFound

try:
    client.start_investigation({"ticket": "ACME-1"})
except BudgetExhausted:
    ...
```

## Testing without a network

The transport is an injectable seam (`Transport` protocol). Inject a fake to
exercise the client offline:

```python
from production_master import Client
from production_master.transport import Response

class FakeTransport:
    def request(self, req):
        return Response(status=201, body={"investigationId": "inv_1"})
    def open_stream(self, req):
        return iter([])

client = Client(transport=FakeTransport())
```

## Development

```bash
cd sdk/python
python3 -m pip install -e '.[test]'
python3 -m pytest -q
```

## Publish to PyPI (post-beta, maintainers only)

**Not used during beta** — CI builds and tests the package on every pull
request; beta users install from git or a Release wheel as above.

PRD spec 12 (`docs/specs/12-cli-and-python-sdk.md` in the dev cockpit) targets
`pip install production-master` once the product is ready for public
distribution. Owner decisions (2026-07-07, issue #131 item 2):

- **Distribution name:** `production-master` (import: `production_master`)
- **Packaging:** one combined pip package — not four per-platform wheels

The publish job is `.github/workflows/publish-python.yml`. It runs on
`ubuntu-latest` (this repo is public — a self-hosted runner here would let a
fork's pull request run code on the owner's hardware) and authenticates with
**PyPI Trusted Publishing**: GitHub mints a short-lived OIDC token that PyPI
exchanges for a scoped, single-use upload token. There is deliberately **no
`PYPI_API_TOKEN` secret** in this repository — no long-lived credential to
leak, rotate, or scope wrong.

### One-time owner setup

1. **Reserve the project on PyPI** — sign in at [pypi.org](https://pypi.org/)
   as the publisher account and create **`production-master`** (it must match
   `[project].name` in `pyproject.toml`).
2. **Register the trusted publisher** — project settings → Publishing → add a
   GitHub publisher with exactly:

   | Field | Value |
   |---|---|
   | Owner | `ProductionMasterAI` |
   | Repository | `production-master` |
   | Workflow | `publish-python.yml` |
   | Environment | `pypi` |

3. **Create the `pypi` environment** on the repository (Settings →
   Environments). Add required reviewers if you want a human gate on every
   upload.

Until step 2 exists the upload fails closed with an authentication error — it
cannot fall back to some other credential and publish anyway.

### Release flow

1. Bump `__version__` in `production_master/__init__.py` and merge to `main`.
2. Tag it: `git tag python-v0.1.0 && git push origin python-v0.1.0`.
   The prefix matters — the plugin's own releases use bare `v*` tags, so
   `python-v*` keeps the two release trains from firing each other.
3. The job re-runs pytest against the tagged tree, asserts the tag matches
   `__version__`, builds sdist + wheel, and uploads.
4. Verify: `pip install production-master` then
   `python -c "import production_master; print(production_master.__version__)"`.

Local dry-run (no upload):

```bash
cd sdk/python
python3 -m pip install '.[test,dev]'
python3 -m pytest -q
python3 -m build
ls dist/
```
