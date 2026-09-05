### 49. Enable HTTP/3 (QUIC); confirm the header/POS query isn't the source of "slow"

Investigated a report that searches feel slow. Measured, rather than
assumed, where the time actually goes (this project's established
convention): from an external client, `/api/collocations/<word>`
showed 0.9-5.8s total time with 4.3KB responses - but hitting the
`backend` container directly over the internal Docker network
(bypassing Caddy and the public network entirely) measured 130-235ms
consistently, matching decision #47's baseline, for both rare and
common words. A plain static-asset request (no backend, no DB
involved at all) showed the *same* ~0.8-1.3s total time as the API
route. Conclusion: the wait is connection setup / RTT between the
client and `us-central1`, not the collocations query - ruled out
restructuring the endpoint into a stream, since streaming only helps
once the server can push bytes sooner or the client wants partial
data before a large payload finishes; here the delay is entirely
before the first byte can leave the server, and the payload is
already tiny and gzipped (decision #46).

Also checked whether Caddy's defaults were silently hurting this -
no aggressive `idle_timeout` or forced `Connection: close` in either
`Caddyfile`, and a second request reusing an already-open connection
measured a real drop (~1s to ~0.37s) - keep-alive itself needed no
fix.

**Enabled HTTP/3 (QUIC)**, which was not reachable despite Caddy
2.11.4 supporting it by default with automatic HTTPS (no directive
needed): the GCP firewall only allowed `tcp:443` (`default-allow-https`),
with no `udp:443` rule at any scope, and `compose.prod.yml`'s `caddy`
service only published `443:443` (TCP-only shorthand). Fixed both:
added `allow-https-quic` firewall rule (INGRESS, `udp:443`,
`0.0.0.0/0`, target tag `https-server` - deliberately mirrors
`default-allow-https`'s exact scope rather than inventing a new one),
and added `'443:443/udp'` to `compose.prod.yml`'s `caddy` ports list.
`compose.yml` (dev) has no Caddy service at all - frontend/backend are
exposed directly there - so this is a prod-only file, not a
both-files case.

QUIC collapses transport + TLS negotiation into fewer round trips than
TCP + TLS 1.3, which should reduce (not eliminate) the handshake
portion of the RTT-dominated cost measured above. **Not verified
end-to-end**: this session's `curl` (8.7.1, SecureTransport-linked) has
no HTTP/3 support, so there's no external confirmation that a client
actually negotiates h3 against the live site - only that the firewall
rule and port mapping exist and Caddy is listening. A follow-up with
an HTTP/3-capable client (e.g. `curl --http3` built against a QUIC TLS
backend, or a browser's network panel showing protocol `h3`) is the
next step to confirm this measurably changes anything, per the same
empirical-before-assumed pattern used above.

**Not pursued**: CDN and geographic relocation, both of which would
address the RTT floor itself rather than just handshake overhead on
top of it - out of scope for this pass, noted as the next lever if
HTTP/3 alone doesn't move the number enough to matter.
