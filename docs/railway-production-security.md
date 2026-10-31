# Railway production security verification

This checklist records the deployment assumptions for House of Briar. Do not infer a trusted proxy address from the site's public IP, a Railway domain, or an arbitrary RFC1918 range.

## Forwarded visitor IP addresses

- `lib/client-address.js` uses the socket peer by default. It only accepts `X-Real-IP` when the **immediate socket peer** matches an exact address in `TRUSTED_PROXY_IPS` and Railway mode is enabled.
- `TRUSTED_PROXY_IPS` is optional. **Leave it unset** until the actual Railway ingress peer addresses are verified and confirmed to be exclusively trusted proxy infrastructure.
- Never set `TRUSTED_PROXY_IPS` to `0.0.0.0`, an entire private subnet, an external client address, or the website's public IP without evidence that it is the immediate ingress peer.
- Before setting it, verify that untrusted callers cannot reach the listener from the allowlisted peer address, and that the trusted edge replaces rather than forwards arbitrary client-supplied `X-Real-IP`.
- After setting it, test a normal request and a deliberately forged `X-Real-IP` from an untrusted connection; the latter must not influence recorded visitor identity. If either check fails, remove the variable.
- Without verified ingress addresses, coarse visitor geolocation may be less accurate. This is preferable to trusting spoofable headers.

## Non-root application process

- `docker-entrypoint.sh` creates and repairs ownership of the mounted data directory, then replaces itself with `gosu node "$@"`. The root-only operation is the initial data-directory ownership repair.
- `.github/workflows/docker-build.yml` builds the runtime image, mounts a directory containing a root-owned file, and asserts that a Node process can write there with `process.getuid() === 1000`.
- A passing image test verifies the container startup contract; it **does not prove** the UID of a particular already-running Railway process.
- For a production runtime verification, use an authorized Railway shell or equivalent operator inspection of the running application process and confirm its effective UID is `1000` (`node`). Do not expose secrets, change volume ownership manually, or introduce a public diagnostics endpoint solely for this check.

## Audit completion

Before closing issue #323, record the successful main-branch Node.js CI and Docker build runs, the runtime UID verification evidence (or explicitly mark it unavailable), and the decision to keep `TRUSTED_PROXY_IPS` unset unless exact trusted peers have been validated. The upload/webhook abuse-case coverage lives in `tests/upload-webhook-abuse.test.js`.
