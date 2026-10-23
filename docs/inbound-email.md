# Reply-to address (inbound email)

Founders use `reply+<code>@YOUR_INBOUND_DOMAIN` as the Reply-To address on outreach. Replies arrive at BuildMind from the sender's own email provider. BuildMind checks the inbound provider's SPF/DKIM results, counts each authenticated sender once, and forwards a copy to the founder.

## Resend setup

1. In Resend, open **Receiving Emails** and use a Resend-provided inbound address for a quick test, or configure a custom inbound domain such as `in.buildmind.live`. Add the DNS records Resend displays.
2. In **Webhooks**, create an endpoint at `https://buildmind.live/api/inbound/reply` and select the `email.received` event.
3. Add these production environment variables to the BuildMind deployment:
   - `INBOUND_EMAIL_DOMAIN`: just the domain part of the receiving address, such as `in.buildmind.live` or `onteamvroi.resend.app` (copy the exact Resend domain).
   - `RESEND_WEBHOOK_SECRET`: the signing secret shown on the Resend webhook.
   - `RESEND_API_KEY`: a Resend API key. The webhook contains message metadata, so BuildMind uses this key to retrieve the received message, including its body and trusted SPF/DKIM results.
4. Redeploy BuildMind. Send a new email to a generated `reply+<code>@INBOUND_EMAIL_DOMAIN` address and check the webhook attempt in Resend.

Resend requests are authenticated using their Svix signature headers. Do not put the Resend signing secret in `INBOUND_EMAIL_SECRET`: that variable is only for legacy providers that POST the normalized format below with an `x-inbound-secret` header.

## Other inbound providers

A compatible provider can POST each received message to the endpoint with header `x-inbound-secret: <INBOUND_EMAIL_SECRET>` and this JSON:

```json
{
  "to": "reply+abcd2345@in.buildmind.live",
  "from": "Name <person@example.com>",
  "subject": "...",
  "text": "...",
  "spf": "pass",
  "dkim": "pass"
}
```

`spf` and `dkim` must be the provider's own authentication results. At least one must be `"pass"`, or the message is ignored.

## What counts

One reply per sender per address. Ignored: the founder's own address, no-reply and bounce senders, auto-replies, throwaway domains, and unauthenticated mail. Counted at proof level (a friend can still reply).
