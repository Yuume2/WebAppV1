# WhatsApp notifications (Phase 3)

WhatsApp is a **notification-only** channel for now. No reply parsing, no
trigger-from-WhatsApp. Yume reads the notification and answers via Notion or
GitHub.

## Provider choice

Two viable options:

| Option | Pros | Cons |
|---|---|---|
| Twilio WhatsApp sandbox | Setup in 5 min, $0.005/msg, no business verification | Sandbox only; for prod, full Twilio approval (slow) |
| Meta WhatsApp Cloud API | Free tier 1000 conv/month, official | Requires Business Verification (1-3 days) and a Facebook Business Manager |

**Default recommendation**: Twilio sandbox for the MVP. Switch later if volume
justifies the verification cost.

## Architecture

```
GitHub issue_comment webhook
     │
     ▼
n8n workflow webappv1-question-to-whatsapp
     │ filters body.startsWith("<!-- claude-question v1")
     ▼
Twilio / Meta Cloud API → Yume's phone
```

Yume answers in Notion (Phase 3) or directly on GitHub (always available).

## What goes into the message

- Issue number and title
- Question id (qid)
- Block level (hard / soft / nice)
- Direct GitHub link

What does **not** go in:

- Question body text
- AC details
- Code snippets
- Issue body

WhatsApp is treated as untrusted transport. Sensitive context stays in GitHub
and Notion.

## Setup checklist (when you're ready)

1. Decide Twilio sandbox vs Meta. Default: Twilio sandbox.
2. Twilio path:
   - Create Twilio account → WhatsApp sandbox.
   - Send `join <sandbox-keyword>` from your phone.
   - Note the sandbox `From` number and your `To` number.
   - In n8n, create credential `webappv1-whatsapp` (Twilio API).
3. n8n:
   - Import `scripts/n8n/webappv1-question-to-whatsapp.json`.
   - Map env vars `WHATSAPP_FROM`, `WHATSAPP_TO`.
   - Map credential `webappv1-whatsapp`.
   - Save inactive.
4. GitHub:
   - Settings → Webhooks → New webhook.
   - URL: the n8n webhook URL (with shared secret in path).
   - Events: select `Issue comments` only.
5. Test:
   - On a throwaway issue, post a fake `<!-- claude-question v1\nqid: q-test -->` comment.
   - WhatsApp message should arrive within seconds.
6. Activate the n8n workflow only after the test succeeds.

## Failure modes

- Twilio sandbox session expires after 72h of inactivity. Re-join from phone.
- WhatsApp rate limits (sandbox): 9 msg/min. Realistic for question flow.
- n8n cloud free plan: 5k executions/month — far above expected use.

## Future: reply-from-WhatsApp

Not implemented. When ready:
- n8n workflow that listens to inbound WhatsApp messages.
- Verify sender phone == `WHATSAPP_TO` exactly.
- Parse message text for `qid:` prefix.
- Post answer to GitHub via the same `claude-answer` marker.
- Mirror to Notion DB.

This adds a new attack surface (inbound message can spoof). Defer until needed.
