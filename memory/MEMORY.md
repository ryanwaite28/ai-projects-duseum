# Memory Index — Duseum Project

- [Duseum project context](project_duseum_context.md) — AWS account 408141212087 (shared dev+prod), GitHub, stack, 6 implementation stages, confirmed pre-existing infra
- [Stripe and AWS reference info](reference_stripe_aws.md) — Stripe account IDs, webhook endpoints, connect client IDs, AWS CLI profile (`rmw-llc`), SSO URL, extra webhook events to handle gracefully
- [Spec gate before implementation](feedback_spec_gate.md) — always produce Section 13.7 spec; wait for "Approved — proceed." before coding
- [Duseum critical implementation rules](feedback_project_rules.md) — no hardcoding, server-side access control, async fan-out, idempotency, secrets from Secrets Manager, MiniStack not LocalStack, IAM duseum- prefix
- [Project status: complete](project_status_complete.md) — user marked project done 2026-05-06; treat future work as maintenance/enhancement mode
