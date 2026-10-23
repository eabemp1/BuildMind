# Reply-to address (inbound email)

Founders put `reply+<code>@YOUR_INBOUND_DOMAIN` as the Reply-To on outreach. Replies reach BuildMind from the
sender's own mail provider, so the founder cannot type a reply into existence. BuildMind counts each
authenticated sender once and forwards a copy to the founder.

Not tested end to end: it needs a domain and an inbound provider, which only you can set up.

## Setup
1. Pick a subdomain, for example `in.buildmind.live`, and point its MX records at an inbound email provider.
2. Set env vars: `INBOUND_EMAIL_DOMAIN=in.buildmind.live` and `INBOUND_EMAIL_SECRET=<long random string>`.
3. Have the provider POST each received message to `https://buildmind.live/api/inbound/reply` with header
   `x-inbound-secret: <INBOUND_EMAIL_SECRET>` and this JSON:

```json
{ "to": "reply+abcd2345@in.buildmind.live", "from": "Name <person@example.com>", "subject": "...", "text": "...",
  "spf": "pass", "dkim": "pass" }
```

`spf` / `dkim` must be the provider's own check results. At least one must be `"pass"`, or the message is ignored.
Cloudflare Email Routing with an Email Worker works: read the `Authentication-Results` header in the worker, map
it to `spf`/`dkim`, and `fetch()` the endpoint. Postmark and Mailgun inbound also expose those results.

## What counts
One reply per sender per address. Ignored: the founder's own address, no-reply and bounce senders, auto-replies,
throwaway domains, unauthenticated mail. Counted at proof level (a friend can still reply).
