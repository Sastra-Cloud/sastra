# Optional support integration

The public application integrates through an HTTP ticket API. It does not import
control-plane or operator-dashboard code. Default installations remain offline with
respect to support services: Help offers community links and local diagnostics.

Configure all three server-only variables to connect an explicitly enrolled installation:
`SASTRA_SUPPORT_URL`, `SASTRA_SUPPORT_INSTANCE_ID`, `SASTRA_SUPPORT_SECRET`. Use HTTPS in
production. Enrollment is revocable and independent of subscription mode, limits, AI
credits, and hosted scheduling.

The client posts JSON to `/support/v1/instance`. Headers are `x-support-instance`,
`x-support-timestamp` (Unix seconds), `x-support-nonce` (UUID), and `x-support-signature`.
The signature is hex HMAC-SHA256 with the installation secret over these newline-joined
values: uppercase method, pathname plus query, timestamp, nonce, hex SHA256(raw body).
The service rejects clock skew beyond five minutes and reused nonces.

The server derives `actor: {id,email,admin}` from the active authenticated session, never
from browser claims. The service enforces enrollment scope and reporter/admin access.
Operations: create, list, get, reply, preferences, upload, download. Creation and replies
carry a UUID `requestKey` retained across retries. Create includes support/bug/feature
category, subject, body, humanOnly and diagnostics. Requests and attachment metadata
are durably acknowledged; uploads are explicit base64 files checked by type and size.
Customer get responses contain only customer/operator messages, never notes or drafts.

The browser calls only its own `/api/support`; credentials never enter client bundles.
Same-origin and session checks apply. Diagnostics include version, revision, browser,
and sanitized route without query/hash or project identifiers. Attachments are selected
by the customer. Mute-email preference updates optimistically with rollback on failure;
external submissions and uploads show truthful progress and preserve input on failure.
