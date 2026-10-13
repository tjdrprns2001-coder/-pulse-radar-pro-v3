# DNA data source integrity

The DNA universe API exposes `sourceState`. When Binance Futures returns HTTP 418, the scanner may fall back to Bybit, OKX, or Gate. A successful HTTP 200 response must not be called Binance-only unless the source is verified.

Added a read-only source classifier and JSON stdin CLI. `PASS` means Binance Futures with no active fallback/block; `DEGRADED` means fallback or cooldown; `FAIL` means invalid or unattributed data.

Remaining: show the venue in `dna-scan.html`, integrate the CLI with scheduled GitHub Actions, and validate against production. Do not auto-merge before CI succeeds.
