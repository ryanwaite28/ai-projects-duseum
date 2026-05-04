# Development Infrastructure Setup Guide
### From Complete Scratch to Production-Ready

> A comprehensive, opinionated guide for setting up development infrastructure from zero. Each step is tagged by the minimum organization size at which it becomes necessary, includes best practices, step-by-step instructions, and tool recommendations.

---

## Organization Size Tags

| Tag | Description |
|-----|-------------|
| `[ALL]` | Required for all org sizes — MVP through enterprise |
| `[MVP]` | Solo developer or early prototype, minimal overhead |
| `[STARTUP]` | Small team (2–20 engineers), early-stage product |
| `[MID-SIZE]` | Growing org (20–200 engineers), multiple teams/services |
| `[ENTERPRISE]` | Large org, regulated industries, or critical uptime SLAs |

> Tags reflect *when a step becomes necessary*, not when it becomes beneficial. Implementing controls early is almost always cheaper than retrofitting them later.

---

## Table of Contents

1. [Domain & Identity Foundation](#1-domain--identity-foundation)
2. [AWS Organization & Account Structure](#2-aws-organization--account-structure)
3. [Networking & DNS](#3-networking--dns)
4. [Identity, Access & SSO](#4-identity-access--sso)
5. [Secrets & Configuration Management](#5-secrets--configuration-management)
6. [TLS / PKI & Certificate Management](#6-tls--pki--certificate-management)
7. [Source Control & GitHub Organization](#7-source-control--github-organization)
8. [CI/CD Pipelines & Deployment](#8-cicd-pipelines--deployment)
9. [Infrastructure as Code (IaC)](#9-infrastructure-as-code-iac)
10. [Security & Compliance](#10-security--compliance)
11. [Artifact Storage & Build Management](#11-artifact-storage--build-management)
12. [Monitoring, Observability & Alerting](#12-monitoring-observability--alerting)
13. [Incident Management & Response](#13-incident-management--response)
14. [Disaster Recovery & Business Continuity](#14-disaster-recovery--business-continuity)
15. [Cost Management](#15-cost-management)
16. [Developer Experience](#16-developer-experience)

---

## 1. Domain & Identity Foundation

> Everything anchors to your domain — email, web, APIs, certificates, and organizational identity. This is step zero before any infrastructure is built.

### Best Practices
- Use a dedicated email alias per service (e.g. `aws-root@domain.com`, `github-admin@domain.com`) — never a personal address
- Separate your domain registrar from your DNS provider for resilience (e.g. register at Namecheap, manage DNS in Route 53)
- Enable domain auto-renew and lock the domain against unauthorized transfers
- Use a `.com` for credibility if public-facing; `.io` or `.dev` are acceptable for developer tools
- Set up email aliasing/groups (`engineering@`, `security@`, `alerts@`) before creating external accounts

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [Namecheap](https://namecheap.com) | Free (domain cost) | Budget-friendly registrar, good UI |
| [AWS Route 53](https://aws.amazon.com/route53/) | Paid (~$0.50/zone/mo) | Best choice if going AWS-native; integrates with ACM, ALB |
| [Cloudflare Registrar](https://cloudflare.com/registrar) | Free (at-cost domains) | Best price on renewals, excellent DNS performance |
| [Google Domains / Squarespace](https://domains.squarespace.com) | Paid | Simple UX, good for non-technical founders |
| [Google Workspace](https://workspace.google.com) | Paid ($6–18/user/mo) | Professional email + Drive + Calendar; most common for startups |
| [Microsoft 365](https://microsoft.com/en-us/microsoft-365) | Paid ($6–22/user/mo) | Better for orgs already in the Microsoft ecosystem |
| [Zoho Mail](https://zoho.com/mail) | Free tier / Paid | Best free option for email hosting on a custom domain |

### Steps

**1.1 — Purchase a domain** `[ALL]`

```bash
# Via AWS Route 53 CLI (or use the console)
aws route53domains register-domain \
  --domain-name yourdomain.com \
  --duration-in-years 1 \
  --auto-renew \
  --admin-contact file://contact.json \
  --registrant-contact file://contact.json \
  --tech-contact file://contact.json
```

1. Go to your registrar of choice (Namecheap, Cloudflare, Route 53)
2. Search for your desired domain
3. Enable **auto-renew** immediately — an expired domain is a catastrophic event
4. Enable **domain lock / transfer lock**
5. Enable **WHOIS privacy protection** (free on most registrars)

**1.2 — Set up email hosting** `[ALL]`

1. Purchase Google Workspace or Microsoft 365 (or configure Zoho for free tier)
2. Create role-based aliases before creating any accounts:
   - `aws-root@domain.com` → forwards to ops team
   - `github-admin@domain.com` → forwards to eng lead
   - `security@domain.com` → forwards to security team
   - `billing@domain.com` → forwards to finance
3. Verify domain ownership with your email provider (usually a TXT record)

**1.3 — Secure your root AWS account** `[ALL]`

1. Create AWS account using `aws-root@domain.com`
2. Immediately enable MFA on root (use a hardware key like YubiKey for production, TOTP for MVP)
3. Set a strong, unique password stored in a password manager (1Password, Bitwarden)
4. Do **not** create root access keys — leave that field empty
5. Set billing alerts even at this stage (see Section 15)
6. Never use root for day-to-day operations — it exists only for break-glass scenarios

---

## 2. AWS Organization & Account Structure

> Multi-account architecture is the single most impactful structural decision you will make. It is far harder to split a monolithic account later than to consolidate a multi-account setup. Even a solo developer benefits from at least separating dev from prod.

### Best Practices
- One account per environment (dev/staging/prod) at minimum — isolation is the goal
- The management/root account should contain **only** Organizations, billing, and IAM Identity Center — no workloads
- Design your OU hierarchy around how you want SCPs to apply, not just how teams are organized
- Enable all AWS Organization features (not just consolidated billing) from day one
- Use account vending machine patterns (Control Tower or custom) to ensure every new account starts with baseline guardrails

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS Organizations](https://aws.amazon.com/organizations/) | Free | Core — multi-account management, SCPs, consolidated billing |
| [AWS Control Tower](https://aws.amazon.com/controltower/) | Free (service costs apply) | Opinionated landing zone with guardrails; best for teams new to multi-account |
| [Terraform AWS Modules](https://registry.terraform.io/modules/terraform-aws-modules) | Free/OSS | `terraform-aws-organization` module for IaC-driven account management |
| [AWS CDK](https://aws.amazon.com/cdk/) | Free/OSS | TypeScript-native IaC; great if your team writes TS |
| [Superwerker](https://superwerker.cloud) | Free/OSS | Open-source quickstart for AWS best practices baseline |

### Steps

**2.1 — Enable AWS Organizations** `[ALL]`

```bash
# Enable Organizations with all features (not just consolidated billing)
aws organizations create-organization --feature-set ALL
```

**2.2 — Design your OU hierarchy** `[ALL]`

Recommended structure:

```
Root
├── Infrastructure
│   ├── Management        ← Organizations, billing, Identity Center
│   ├── Ops               ← CI/CD, monitoring, security tooling
│   └── Shared Services   ← VPC sharing, DNS, Transit Gateway
├── Workloads
│   ├── Dev               ← Developer sandbox accounts
│   ├── Staging / QA      ← Pre-production testing
│   └── Production        ← Live workloads
├── Security              ← Centralized audit logs, GuardDuty, Security Hub
└── Sandbox               ← Experimental / POC accounts with guardrails
```

```bash
# Create OUs via CLI
aws organizations create-organizational-unit \
  --parent-id r-xxxx \        # Root ID from describe-roots
  --name "Workloads"

aws organizations create-organizational-unit \
  --parent-id ou-xxxx-xxxxxxxx \  # Workloads OU ID
  --name "Production"
```

**2.3 — Create environment accounts** `[ALL]`

```bash
# Create a member account (it auto-joins the org)
aws organizations create-account \
  --email dev-aws@domain.com \
  --account-name "MyProject-Dev" \
  --iam-user-access-to-billing ALLOW

# Move account to the correct OU
aws organizations move-account \
  --account-id 123456789012 \
  --source-parent-id r-xxxx \
  --destination-parent-id ou-xxxx-dev
```

**2.4 — Enable organization-level services** `[STARTUP]`

Enable these in the Organizations console or via CLI:

```bash
# Enable CloudTrail at org level
aws cloudtrail create-trail \
  --name org-trail \
  --s3-bucket-name your-audit-logs-bucket \
  --is-organization-trail \
  --is-multi-region-trail \
  --enable-log-file-validation

# Enable GuardDuty org-wide
aws guardduty create-detector --enable
aws guardduty enable-organization-admin-account \
  --admin-account-id <security-account-id>
```

> **Control Tower** automates steps 2.1–2.4 with a console wizard. Recommended for teams that want guardrails without writing all the IaC themselves.

---

## 3. Networking & DNS

> Network design is one of the hardest things to change after the fact. IP address space decisions made today affect whether you can peer VPCs or connect to on-premises networks years from now. Plan carefully and document your CIDR allocations.

### Best Practices
- Plan your entire IP address space upfront — assign non-overlapping `/16` CIDRs per account
- Never use `10.0.0.0/16` in every account — this prevents VPC peering forever
- Three subnet tiers per VPC: **public** (load balancers), **private** (applications), **isolated** (databases — no route to internet at all)
- Prefer at least 3 AZs in production for resilience
- Enable VPC Flow Logs from day one — retroactive network forensics is impossible without them
- Use private hosted zones in Route 53 for internal service discovery (never hardcode IPs)

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS VPC](https://aws.amazon.com/vpc/) | Free | Core networking primitive |
| [AWS Transit Gateway](https://aws.amazon.com/transit-gateway/) | Paid ($0.05/attachment/hr) | Hub-and-spoke for multi-account/multi-VPC routing |
| [AWS Route 53](https://aws.amazon.com/route53/) | Paid ($0.50/zone/mo) | Public + private DNS, health checks, routing policies |
| [Terraform VPC Module](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws) | Free/OSS | Production-grade VPC with all subnet tiers in ~50 lines |
| [AWS CDK VPC construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.Vpc.html) | Free/OSS | TypeScript-native VPC provisioning |
| [Infracost](https://infracost.io) | Free/OSS | Estimates cost of networking changes before applying |
| [Draw.io / Lucidchart](https://draw.io) | Free/Paid | Document your network architecture |

### Steps

**3.1 — Plan your IP address space** `[ALL]`

Document your CIDR allocation before writing any code:

```
Global: 10.0.0.0/8
├── Dev account:        10.0.0.0/16
├── Staging account:    10.1.0.0/16
├── Prod account:       10.2.0.0/16
├── Ops account:        10.3.0.0/16
└── Shared Services:    10.4.0.0/16
```

**3.2 — Create VPCs with subnet tiers** `[ALL]`

Using Terraform (recommended):

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "prod-vpc"
  cidr = "10.2.0.0/16"

  azs              = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets   = ["10.2.0.0/24",  "10.2.1.0/24",  "10.2.2.0/24"]
  private_subnets  = ["10.2.10.0/24", "10.2.11.0/24", "10.2.12.0/24"]
  database_subnets = ["10.2.20.0/24", "10.2.21.0/24", "10.2.22.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false  # one per AZ in prod; true = cheaper but single point of failure
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true
  enable_flow_log        = true
  flow_log_destination_type = "s3"
  flow_log_destination_arn  = aws_s3_bucket.vpc_flow_logs.arn

  tags = {
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}
```

**3.3 — Configure Route 53 hosted zones** `[ALL]`

```hcl
# Public zone (external DNS)
resource "aws_route53_zone" "public" {
  name = "yourdomain.com"
}

# Private zone per VPC (internal service discovery)
resource "aws_route53_zone" "internal" {
  name = "internal.yourdomain.com"

  vpc {
    vpc_id = module.vpc.vpc_id
  }
}
```

**3.4 — Configure DNS records** `[ALL]`

| Record Type | Purpose | Example |
|-------------|---------|---------|
| `A` / `AAAA` | Point domain to IP or ALB | `app.domain.com → ALB DNS` |
| `CNAME` | Alias one domain to another | `www → app.domain.com` |
| `MX` | Email routing | Points to Google/Microsoft mail servers |
| `TXT (SPF)` | Authorize email senders | `v=spf1 include:_spf.google.com ~all` |
| `TXT (DKIM)` | Email signing | Provided by your email host |
| `TXT (DMARC)` | Email policy | `v=DMARC1; p=reject; rua=mailto:dmarc@domain.com` |
| `CAA` | Restrict certificate authorities | `0 issue "amazon.com"` |

**3.5 — Set up Transit Gateway for multi-account routing** `[MID-SIZE]`

```hcl
resource "aws_ec2_transit_gateway" "main" {
  description                     = "Central routing hub"
  amazon_side_asn                 = 64512
  auto_accept_shared_attachments  = "enable"
  default_route_table_association = "enable"
  default_route_table_propagation = "enable"

  tags = { Name = "org-transit-gateway" }
}

# Share via RAM to member accounts
resource "aws_ram_resource_share" "tgw" {
  name                      = "transit-gateway-share"
  allow_external_principals = false
}
```

---

## 4. Identity, Access & SSO

> Identity is the new perimeter. Every human and every system that touches your infrastructure needs a well-defined, least-privileged identity. Long-lived credentials are the #1 source of cloud breaches.

### Best Practices
- **No long-lived IAM user credentials** — use SSO for humans, OIDC/instance roles for machines
- Grant the minimum permissions required and expand as needed — never the other way around
- Enforce MFA for all human identities without exception
- Rotate any credentials that must exist; prefer ephemeral credentials that cannot be rotated because they expire
- Use permission boundaries to limit what even administrators can grant
- Separate the identity plane (who you are) from the authorization plane (what you can do)

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS IAM Identity Center](https://aws.amazon.com/iam/identity-center/) | Free | Central SSO for all AWS accounts — the right default |
| [Okta](https://okta.com) | Paid ($2–8/user/mo) | Enterprise-grade IdP; connects to Identity Center, GitHub, and everything else |
| [Google Workspace SAML](https://workspace.google.com) | Included | Use existing Google Workspace as your IdP for AWS SSO |
| [Azure AD / Entra ID](https://azure.microsoft.com/en-us/products/active-directory) | Paid (or included with M365) | Best if already in the Microsoft ecosystem |
| [1Password](https://1password.com) | Paid ($3–8/user/mo) | Secrets/credential management for teams |
| [Bitwarden](https://bitwarden.com) | Free/Paid | Open-source password manager, great free tier |
| [HashiCorp Vault](https://vaultproject.io) | Free/OSS or Paid (HCP) | Advanced secrets engine, dynamic credentials, PKI |
| [aws-vault](https://github.com/99designs/aws-vault) | Free/OSS | CLI tool to securely store and use AWS credentials locally |

### Steps

**4.1 — Enable IAM Identity Center** `[ALL]`

```bash
# Enable Identity Center (done in the management account)
# Only available via console first-time; subsequent config via CLI/IaC

# Via Terraform
resource "aws_ssoadmin_instance" "main" {}  # enables Identity Center

# Connect your IdP (e.g. Google Workspace)
resource "aws_ssoadmin_managed_policy_attachment" "example" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.main.arns)[0]
  managed_policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
  permission_set_arn = aws_ssoadmin_permission_set.readonly.arn
}
```

**4.2 — Define Permission Sets** `[ALL]`

```hcl
# ReadOnly — for most developers in prod
resource "aws_ssoadmin_permission_set" "readonly" {
  name             = "ReadOnly"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"
}

resource "aws_ssoadmin_managed_policy_attachment" "readonly" {
  instance_arn       = local.sso_instance_arn
  managed_policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
  permission_set_arn = aws_ssoadmin_permission_set.readonly.arn
}

# Developer — deploy to dev/staging, read prod
resource "aws_ssoadmin_permission_set" "developer" {
  name             = "Developer"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT8H"
}

# Admin — full access, only for infra team
resource "aws_ssoadmin_permission_set" "admin" {
  name             = "Administrator"
  instance_arn     = local.sso_instance_arn
  session_duration = "PT4H"   # shorter session for elevated access
}
```

**4.3 — Set up OIDC for GitHub Actions** `[ALL]`

This eliminates long-lived AWS access keys in CI/CD entirely:

```hcl
# Create the OIDC provider (once per account)
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]
}

# IAM role assumed by GitHub Actions
resource "aws_iam_role" "github_actions_deploy" {
  name = "github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:your-org/*:*"
        }
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}
```

```yaml
# In your GitHub Actions workflow
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
    aws-region: us-east-1
    # No access keys needed — OIDC handles it
```

**4.4 — Configure SCPs** `[STARTUP]`

```json
// Deny disabling CloudTrail (attach to all OUs except Security)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyCloudTrailDisable",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:DeleteTrail",
        "cloudtrail:StopLogging",
        "cloudtrail:UpdateTrail"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyRootUsage",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    },
    {
      "Sid": "RequireEncryptionOnS3",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": ["aws:kms", "AES256"]
        }
      }
    }
  ]
}
```

---

## 5. Secrets & Configuration Management

> Secrets in source code are the most common and most preventable security incident in software engineering. Where you store secrets matters as much as keeping them secret in the first place.

### Best Practices
- Treat secrets and config differently: secrets need encryption + auditing; config just needs versioning
- Use a consistent hierarchy for secrets paths so IAM policies can be path-scoped
- Rotate credentials automatically wherever possible — especially database passwords
- Scan for secrets in code at the pre-commit stage and again in CI
- Never log secrets — structured logging frameworks should redact them automatically

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) | Paid ($0.40/secret/mo) | Secrets with rotation; use for DB passwords, API keys, OAuth secrets |
| [AWS SSM Parameter Store](https://aws.amazon.com/systems-manager/features/#Parameter_Store) | Free (standard) / Paid (advanced) | Config values, feature flags; SecureString for lightweight secrets |
| [HashiCorp Vault](https://vaultproject.io) | Free/OSS or Paid (HCP ~$0.03/hr) | Advanced: dynamic DB credentials, PKI, cross-cloud secrets |
| [Doppler](https://doppler.com) | Free/Paid ($6/user/mo) | Developer-friendly secrets manager; syncs to AWS, GitHub, Vercel |
| [git-secrets](https://github.com/awslabs/git-secrets) | Free/OSS | Pre-commit hook to prevent secrets being committed |
| [truffleHog](https://github.com/trufflesecurity/trufflehog) | Free/OSS | Scans git history and staged changes for credentials |
| [GitGuardian](https://gitguardian.com) | Free/Paid | Real-time secret scanning across GitHub org; free for OSS |
| [detect-secrets](https://github.com/Yelp/detect-secrets) | Free/OSS | Yelp's pre-commit secret detection tool |

### Steps

**5.1 — Establish a secret hierarchy** `[ALL]`

```
/{environment}/{application}/{secret-name}

Examples:
/prod/api-gateway/jwt-secret
/prod/postgres/master-password
/staging/stripe/api-key
/dev/sendgrid/api-key
```

```hcl
resource "aws_secretsmanager_secret" "db_password" {
  name        = "/prod/postgres/master-password"
  description = "RDS master password for prod"

  recovery_window_in_days = 7  # 0 for immediate delete in non-prod

  tags = {
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_rotation" "db_password" {
  secret_id           = aws_secretsmanager_secret.db_password.id
  rotation_lambda_arn = aws_lambda_function.rds_rotation.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
```

**5.2 — Set up pre-commit secret scanning** `[ALL]`

```bash
# Install pre-commit
pip install pre-commit

# .pre-commit-config.yaml
repos:
  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.63.7
    hooks:
      - id: trufflehog
        name: TruffleHog
        entry: trufflehog git file://. --since-commit HEAD --only-verified --fail

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

```bash
pre-commit install  # installs hooks into .git/hooks/pre-commit
```

**5.3 — SSM Parameter Store for app config** `[ALL]`

```hcl
resource "aws_ssm_parameter" "db_endpoint" {
  name  = "/prod/postgres/endpoint"
  type  = "String"           # Not sensitive
  value = aws_db_instance.main.address
}

resource "aws_ssm_parameter" "api_key" {
  name   = "/prod/external-service/api-key"
  type   = "SecureString"    # Encrypted via KMS
  value  = var.api_key       # Supplied at apply time, not in code
  key_id = aws_kms_key.ssm.arn
}
```

---

## 6. TLS / PKI & Certificate Management

> Encryption in transit is a non-negotiable baseline. ACM makes this essentially free and zero-maintenance for AWS workloads.

### Best Practices
- Use DNS validation for ACM certificates — it auto-renews without human intervention
- Never use self-signed certs in production or staging
- Enforce TLS 1.2+ everywhere; disable TLS 1.0/1.1
- Redirect HTTP → HTTPS at the load balancer, never in application code
- Set HSTS headers with a long max-age once you are confident in your HTTPS setup
- Use CAA DNS records to restrict which CAs can issue certificates for your domain

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS ACM](https://aws.amazon.com/certificate-manager/) | Free | TLS certs for ALB, CloudFront, API Gateway; auto-renewing |
| [Let's Encrypt / Certbot](https://letsencrypt.org) | Free/OSS | Free certs for non-AWS or self-managed servers |
| [AWS Private CA](https://aws.amazon.com/private-certificate-authority/) | Paid ($400/mo per CA) | Internal PKI for mTLS between services |
| [HashiCorp Vault PKI](https://vaultproject.io) | Free/OSS | Open-source alternative for internal CA and mTLS |
| [AWS SES](https://aws.amazon.com/ses/) | Paid ($0.10/1000 emails) | Transactional email with domain verification |
| [SSL Labs](https://ssllabs.com/ssltest/) | Free | Test your TLS configuration grade |

### Steps

**6.1 — Request and validate ACM certificates** `[ALL]`

```hcl
resource "aws_acm_certificate" "main" {
  domain_name               = "yourdomain.com"
  subject_alternative_names = ["*.yourdomain.com"]
  validation_method         = "DNS"   # Always DNS, not EMAIL

  lifecycle {
    create_before_destroy = true  # Critical for zero-downtime cert rotation
  }
}

# Create DNS validation records automatically in Route 53
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = aws_route53_zone.public.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
```

**6.2 — Enforce HTTPS at the load balancer** `[ALL]`

```hcl
# HTTP listener — redirect everything to HTTPS
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener with your ACM certificate
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"  # Enforce TLS 1.2+
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
```

**6.3 — Set up SES for transactional email** `[ALL]`

```hcl
resource "aws_ses_domain_identity" "main" {
  domain = "yourdomain.com"
}

resource "aws_route53_record" "ses_verification" {
  zone_id = aws_route53_zone.public.zone_id
  name    = "_amazonses.yourdomain.com"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}
```

---

## 7. Source Control & GitHub Organization

> Your Git organization structure mirrors your engineering organization. Getting branching strategy, access control, and automation right early prevents painful migrations and security incidents.

### Best Practices
- Use a GitHub Organization (not personal repos) — repos should survive individual account changes
- Enforce branch protection on `main`/`master` with no exceptions, including for admins
- CODEOWNERS for sensitive directories (IAM policies, infrastructure, security configs)
- Connect GitHub org to your IdP via SAML SSO — leavers lose access automatically
- Treat `.github` as a special repo — reusable workflows, org-level templates live here
- Never store secrets in GitHub Secrets at the repo level for shared credentials — use org-level or environment secrets

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [GitHub](https://github.com) | Free/Paid ($4–21/user/mo) | Dominant platform; best GitHub Actions integration |
| [GitLab](https://gitlab.com) | Free/Paid ($29+/mo) | Better self-hosted story; built-in CI/CD |
| [Bitbucket](https://bitbucket.org) | Free/Paid ($3+/user/mo) | Good Jira integration for Atlassian shops |
| [GitHub Advanced Security](https://github.com/features/security) | Paid (included in Enterprise) | Secret scanning, code scanning, Dependabot |
| [Dependabot](https://docs.github.com/en/code-security/dependabot) | Free | Automated dependency update PRs |
| [Renovate Bot](https://renovatebot.com) | Free/OSS | More configurable than Dependabot; handles monorepos well |
| [terraform-github-repository](https://registry.terraform.io/providers/integrations/github/latest) | Free/OSS | Manage GitHub repos, teams, and access via Terraform |

### Steps

**7.1 — Create and configure a GitHub Organization** `[ALL]`

1. Go to github.com → Your profile → Create organization
2. Choose a plan (Free for public OSS, Team for private repos)
3. Configure organization settings:
   - Require 2FA for all members
   - Set base repository permissions to `None` (explicit grants only)
   - Disable forking of private repos
   - Enable secret scanning and push protection

**7.2 — Configure branch protection** `[ALL]`

Via Terraform (recommended so rules are consistently applied):

```hcl
resource "github_branch_protection" "main" {
  repository_id = github_repository.app.node_id
  pattern       = "main"

  required_status_checks {
    strict   = true           # Branch must be up to date before merging
    contexts = ["ci/test", "ci/lint", "ci/security-scan"]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
    required_approving_review_count = 1   # 2 for prod-critical repos
  }

  enforce_admins                  = true   # No bypass, even for admins
  allows_force_pushes             = false
  allows_deletions                = false
  require_conversation_resolution = true
}
```

**7.3 — Set up CODEOWNERS** `[STARTUP]`

```bash
# .github/CODEOWNERS

# Infrastructure and security require infra team review
/infrastructure/       @your-org/infrastructure-team
/terraform/            @your-org/infrastructure-team
/.github/workflows/    @your-org/infrastructure-team
/security/             @your-org/security-team

# Application ownership by team
/services/api/         @your-org/backend-team
/services/web/         @your-org/frontend-team
/services/shared/      @your-org/backend-team @your-org/frontend-team
```

**7.4 — Configure Renovate for automated dependency updates** `[STARTUP]`

```json
// renovate.json at repo root
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 9am on Monday"],
  "prConcurrentLimit": 5,
  "automerge": true,
  "automergeType": "pr",
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["dependencies", "major-update"]
    }
  ]
}
```

---

## 8. CI/CD Pipelines & Deployment

> Your pipeline is the only path code should take to production. Manual deployments are untraceable, unrepeatable, and introduce human error at the worst possible moment.

### Best Practices
- Build once, promote the same artifact — never rebuild per environment
- Every pipeline stage is a quality gate — failing fast is the goal
- Use OIDC for cloud credentials, never long-lived access keys in CI
- Require manual approval gates for production deployments
- Store pipeline configuration as code alongside the application it deploys
- Keep reusable workflow logic in a central `.github` repo — avoid copy/pasting pipeline configs

### Tools

| Tool | Type | Best For |
|------|------|----------|
| [GitHub Actions](https://github.com/features/actions) | Free (2000 min/mo) / Paid | **Best default** — tight Git integration, OIDC built-in, huge marketplace |
| [GitLab CI/CD](https://docs.gitlab.com/ee/ci/) | Free/Paid | Best if using GitLab; self-hostable runners |
| [Jenkins](https://jenkins.io) | Free/OSS (infrastructure cost) | Maximum flexibility; justified when team has ops capacity to maintain it |
| [CircleCI](https://circleci.com) | Free/Paid ($15+/mo) | Fast parallelism; good for complex test suites |
| [AWS CodePipeline](https://aws.amazon.com/codepipeline/) | Paid ($1/pipeline/mo) | AWS-native; good for simple deploy workflows without a GitHub dependency |
| [ArgoCD](https://argoproj.github.io/cd/) | Free/OSS | GitOps for Kubernetes — excellent for K8s-based deployments |
| [Spinnaker](https://spinnaker.io) | Free/OSS | Advanced multi-cloud deployment pipelines; high operational overhead |
| [Atlantis](https://runatlantis.io) | Free/OSS | Terraform pull request automation — plan on PR, apply on merge |

> **Recommendation by team size:**
> - Solo/MVP: GitHub Actions (free tier is generous, zero infra to manage)
> - Startup: GitHub Actions with reusable workflows in a `.github` org repo
> - Mid-size: GitHub Actions + Atlantis for Terraform, or migrate runners to self-hosted for cost at scale
> - Enterprise: Jenkins (if existing investment) or GitHub Actions Enterprise; ArgoCD for K8s workloads

### Steps

**8.1 — Set up a central reusable workflows repo** `[ALL]`

```
.github/                          ← Special GitHub org-level repo
├── workflow-templates/
│   ├── node-ci.yml               ← Reusable: lint, test, build for Node apps
│   ├── docker-build-push.yml     ← Reusable: build and push to ECR
│   ├── terraform-plan.yml        ← Reusable: terraform plan on PR
│   └── deploy-ecs.yml            ← Reusable: deploy to ECS
└── CODEOWNERS
```

**8.2 — Standard application pipeline** `[ALL]`

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run test:ci
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  security-scan:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'HIGH,CRITICAL'
          exit-code: '1'

  build:
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.ref == 'refs/heads/main'
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        id: meta
        run: |
          IMAGE_TAG="${{ github.sha }}"
          docker build -t ${{ vars.ECR_REPO }}:${IMAGE_TAG} .
          docker push ${{ vars.ECR_REPO }}:${IMAGE_TAG}
          echo "tags=${{ vars.ECR_REPO }}:${IMAGE_TAG}" >> $GITHUB_OUTPUT

  deploy-dev:
    needs: build
    uses: your-org/.github/.github/workflows/deploy-ecs.yml@main
    with:
      environment: dev
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets: inherit

  deploy-staging:
    needs: deploy-dev
    uses: your-org/.github/.github/workflows/deploy-ecs.yml@main
    with:
      environment: staging
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets: inherit

  deploy-prod:
    needs: deploy-staging
    environment: production   # GitHub environment with required reviewers
    uses: your-org/.github/.github/workflows/deploy-ecs.yml@main
    with:
      environment: prod
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets: inherit
```

**8.3 — Terraform pipeline with Atlantis** `[STARTUP]`

```yaml
# atlantis.yaml at repo root
version: 3
projects:
  - name: networking
    dir: terraform/networking
    workspace: prod
    autoplan:
      when_modified: ["*.tf", "../modules/**/*.tf"]
      enabled: true

  - name: application
    dir: terraform/application
    workspace: prod
    autoplan:
      when_modified: ["*.tf"]
      enabled: true
```

> Atlantis runs `terraform plan` on every PR and posts the diff as a comment. `terraform apply` runs on merge. This gives you full IaC review in the same workflow as code review.

---

## 9. Infrastructure as Code (IaC)

> If it is not in code, it does not exist. Console-created resources are untraceable, unrepeatable, and impossible to review. IaC is not optional — it is the foundation of everything else.

### Best Practices
- Choose **one** IaC tool and use it consistently — mixed IaC creates unmanageable drift
- Modularize everything — shared modules encode your organization's standards and security requirements
- Remote state is mandatory for team use — never use local state for shared infrastructure
- IaC is code: it needs linting, testing, and code review like any other code
- Use `plan` in CI (on PR) and `apply` on merge — never run `apply` locally against shared environments
- Tag every resource with `Environment`, `ManagedBy`, `Team`, and `Project` from day one

### Tools

| Tool | Type | Best For |
|------|------|----------|
| [Terraform](https://terraform.io) | Free/OSS (BSL license) | **Best default** — mature ecosystem, multi-cloud, huge module library |
| [OpenTofu](https://opentofu.org) | Free/OSS (MPL) | Drop-in Terraform fork under a truly open-source license |
| [AWS CDK](https://aws.amazon.com/cdk/) | Free/OSS | TypeScript-native; great if your team writes TS; AWS-only |
| [Pulumi](https://pulumi.com) | Free/OSS or Paid | General-purpose IaC in TypeScript/Python/Go; more flexible than CDK |
| [Checkov](https://checkov.io) | Free/OSS | IaC security scanner — catches misconfigs before apply |
| [tflint](https://github.com/terraform-linters/tflint) | Free/OSS | Terraform linter for style and provider-specific rules |
| [Terratest](https://terratest.gruntwork.io) | Free/OSS | Go-based integration tests for Terraform modules |
| [Infracost](https://infracost.io) | Free/OSS | Cost estimate in PR comments before applying changes |
| [terraform-docs](https://terraform-docs.io) | Free/OSS | Auto-generate module documentation from code |

> **Recommendation:** Use **Terraform** (or OpenTofu) for AWS infrastructure; use **AWS CDK** if your team is TypeScript-heavy and AWS-only. Avoid mixing both.

### Steps

**9.1 — Bootstrap Terraform state storage** `[ALL]`

This is the chicken-and-egg problem: you need somewhere to store state before Terraform can manage anything. Use a bootstrap script for the state bucket itself:

```bash
#!/bin/bash
# bootstrap-state.sh — run once per account, manually
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"
BUCKET_NAME="terraform-state-${ACCOUNT_ID}-${REGION}"
TABLE_NAME="terraform-state-lock"

# Create S3 bucket for state
aws s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}"

# Enable versioning (allows state history and recovery)
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "${BUCKET_NAME}" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Block all public access
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name "${TABLE_NAME}" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"

echo "State bucket: ${BUCKET_NAME}"
echo "Lock table: ${TABLE_NAME}"
```

**9.2 — Configure Terraform backend and structure** `[ALL]`

```hcl
# terraform/backend.tf
terraform {
  required_version = ">= 1.6.0"

  backend "s3" {
    bucket         = "terraform-state-123456789012-us-east-1"
    key            = "prod/networking/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

Recommended directory structure:

```
terraform/
├── modules/                  ← Reusable modules (your org's standards)
│   ├── vpc/
│   ├── ecs-service/
│   ├── rds-cluster/
│   └── alb/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   ├── staging/
│   └── prod/
└── bootstrap/                ← One-time state bucket setup
    └── bootstrap-state.sh
```

**9.3 — CDK Bootstrap (if using AWS CDK)** `[ALL]`

```bash
# Bootstrap every account+region combination you deploy to
# Run from the management account or with cross-account permissions

# Bootstrap dev account
AWS_PROFILE=dev-account npx cdk bootstrap \
  aws://DEV_ACCOUNT_ID/us-east-1 \
  --trust MANAGEMENT_ACCOUNT_ID \          # Allow management account to deploy
  --cloudformation-execution-policies \
    arn:aws:iam::aws:policy/AdministratorAccess

# Bootstrap prod account
AWS_PROFILE=prod-account npx cdk bootstrap \
  aws://PROD_ACCOUNT_ID/us-east-1 \
  --trust MANAGEMENT_ACCOUNT_ID
```

**9.4 — Add IaC security scanning to CI** `[STARTUP]`

```yaml
# In your CI pipeline
- name: Run Checkov IaC security scan
  uses: bridgecrewio/checkov-action@master
  with:
    directory: terraform/
    framework: terraform
    soft_fail: false          # Fail the build on HIGH/CRITICAL findings
    check: CKV_AWS_*          # AWS-specific checks
    skip_check: CKV2_AWS_*    # Skip experimental checks

- name: Estimate cost impact
  uses: infracost/infracost-gh-action@master
  with:
    path: terraform/environments/prod
    # Posts cost diff as a PR comment
```

---

## 10. Security & Compliance

> Security is not a phase at the end — it is woven through every layer. These controls focus on detection, compliance posture, and supply chain integrity.

### Best Practices
- Enable GuardDuty org-wide on day one — it is cheap relative to what it detects
- Encryption at rest is a baseline, not a differentiator — every storage resource should be encrypted
- Shift security left: scan in pre-commit → scan in CI → scan in registry → runtime monitoring
- Treat compliance frameworks as a checklist of controls to implement, not paperwork to file
- Security Groups should default to deny-all; document every opened port with a comment

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS GuardDuty](https://aws.amazon.com/guardduty/) | Paid (~$1–5/account/mo) | ML-based threat detection on CloudTrail + VPC Flow Logs |
| [AWS Security Hub](https://aws.amazon.com/security-hub/) | Paid ($0.001/finding/mo) | Centralized compliance scoring and findings aggregation |
| [AWS Macie](https://aws.amazon.com/macie/) | Paid | S3 sensitive data discovery (PII, credentials) |
| [AWS Config](https://aws.amazon.com/config/) | Paid ($0.003/rule evaluation) | Compliance rules and configuration drift detection |
| [SonarQube](https://sonarqube.org) | Free/OSS or Paid (Cloud) | SAST: code quality + security vulnerabilities |
| [Semgrep](https://semgrep.dev) | Free/OSS or Paid | Fast, accurate SAST; great OSS rules for AWS/IaC |
| [Trivy](https://trivy.dev) | Free/OSS | Container image + filesystem + IaC vulnerability scanner |
| [Snyk](https://snyk.io) | Free/Paid ($25+/mo) | Developer-friendly SCA + container scanning with fix PRs |
| [OWASP ZAP](https://zaproxy.org) | Free/OSS | DAST — dynamic application security testing |
| [Prowler](https://prowler.pro) | Free/OSS | AWS security best practices auditor (1000+ checks) |
| [ScoutSuite](https://github.com/nccgroup/ScoutSuite) | Free/OSS | Multi-cloud security auditing tool |
| [Syft](https://github.com/anchore/syft) | Free/OSS | SBOM generation for containers and filesystems |

### Steps

**10.1 — Enable GuardDuty org-wide** `[ALL]`

```hcl
# In the security/delegated-admin account
resource "aws_guardduty_organization_admin_account" "main" {
  admin_account_id = var.security_account_id
}

resource "aws_guardduty_organization_configuration" "main" {
  auto_enable_organization_members = "ALL"
  detector_id                      = aws_guardduty_detector.main.id

  datasources {
    s3_logs { auto_enable = true }
    kubernetes { audit_logs { enable = true } }
    malware_protection {
      scan_ec2_instance_with_findings { ebs_volumes { auto_enable = true } }
    }
  }
}
```

**10.2 — Enable Security Hub with CIS benchmarks** `[STARTUP]`

```hcl
resource "aws_securityhub_account" "main" {}

resource "aws_securityhub_standards_subscription" "cis" {
  depends_on    = [aws_securityhub_account.main]
  standards_arn = "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0"
}

resource "aws_securityhub_standards_subscription" "aws_foundational" {
  depends_on    = [aws_securityhub_account.main]
  standards_arn = "arn:aws:securityhub:us-east-1::standards/aws-foundational-security-best-practices/v/1.0.0"
}
```

**10.3 — Container image scanning pipeline** `[ALL]`

```yaml
# In GitHub Actions — scan before pushing to ECR
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE_URI }}
    format: 'sarif'
    output: 'trivy-results.sarif'
    severity: 'HIGH,CRITICAL'
    exit-code: '1'            # Fail build on HIGH/CRITICAL CVEs

- name: Upload Trivy results to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: 'trivy-results.sarif'
```

**10.4 — Generate SBOM for all artifacts** `[MID-SIZE]`

```yaml
- name: Generate SBOM with Syft
  uses: anchore/sbom-action@v0
  with:
    image: ${{ env.IMAGE_URI }}
    format: spdx-json
    output-file: sbom.spdx.json

- name: Attach SBOM to release
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom.spdx.json
```

**10.5 — Enforce encryption at rest** `[ALL]`

```hcl
# S3 bucket — SSE-KMS encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true  # Reduces KMS API calls (cost optimization)
  }
}

# RDS — encryption at rest (must be set at creation; cannot be added later)
resource "aws_db_instance" "main" {
  # ... other config ...
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn
}
```

---

## 11. Artifact Storage & Build Management

> Build artifacts need a controlled home separate from source code. A dedicated artifact repository enforces immutability, provenance tracking, and access control on what gets deployed.

### Best Practices
- Build artifacts are immutable — once tagged and pushed, they cannot be overwritten
- The artifact tested in staging must be byte-for-byte identical to what deploys to prod
- Scan images in the registry in addition to at build time (new CVEs are discovered daily)
- Set lifecycle policies to prevent unbounded storage growth
- Use ECR as the default for containerized AWS workloads; Artifactory for polyglot package management

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS ECR](https://aws.amazon.com/ecr/) | Paid ($0.10/GB/mo) | **Default** for Docker images on AWS; native ECS/EKS integration |
| [GitHub Container Registry](https://docs.github.com/en/packages) | Free (with GitHub) | Good for OSS or when already on GitHub; free for public images |
| [JFrog Artifactory](https://jfrog.com/artifactory/) | Free/OSS or Paid ($98+/mo) | Universal artifact repository — Docker, npm, Maven, PyPI, Helm |
| [Nexus Repository](https://sonatype.com/nexus/repository-manager) | Free/OSS or Paid | Strong OSS option for proxy + private registry |
| [Harbor](https://goharbor.io) | Free/OSS | Self-hosted Docker registry with scanning and RBAC |
| [Cosign / Sigstore](https://sigstore.dev) | Free/OSS | Container image signing and verification |

### Steps

**11.1 — Set up ECR with scanning and lifecycle policies** `[ALL]`

```hcl
resource "aws_ecr_repository" "app" {
  name                 = "my-app"
  image_tag_mutability = "IMMUTABLE"   # Critical — prevents tag overwriting

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}
```

---

## 12. Monitoring, Observability & Alerting

> Observability is your ability to understand what your system is doing from the outside. Without it, debugging production is guesswork. The three pillars are metrics, logs, and traces — you need all three.

### Best Practices
- Instrument from day one — adding observability to an uninstrumented system in production is painful
- Use structured (JSON) logging everywhere — it makes logs queryable without parsing
- Alert on symptoms (high error rate, high latency) not causes (high CPU, disk space)
- The RED method per service: Rate, Errors, Duration — these three signals define service health
- Adopt OpenTelemetry (OTel) as your instrumentation standard — it is vendor-neutral

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS CloudWatch](https://aws.amazon.com/cloudwatch/) | Paid | AWS-native metrics, logs, alarms; good default for simple setups |
| [Prometheus](https://prometheus.io) | Free/OSS | De facto standard for metrics collection; pull-based |
| [Grafana](https://grafana.com) | Free/OSS or Cloud ($8+/mo) | Dashboards for Prometheus, CloudWatch, Loki, Tempo |
| [Grafana Loki](https://grafana.com/oss/loki/) | Free/OSS | Log aggregation — like Prometheus but for logs |
| [Grafana Tempo](https://grafana.com/oss/tempo/) | Free/OSS | Distributed tracing backend |
| [OpenTelemetry](https://opentelemetry.io) | Free/OSS | Vendor-neutral instrumentation standard — use this |
| [AWS X-Ray](https://aws.amazon.com/xray/) | Paid ($5/1M traces) | AWS-native distributed tracing; native Lambda + ECS integration |
| [Datadog](https://datadoghq.com) | Paid ($15+/host/mo) | All-in-one APM, logs, metrics, tracing; best if budget allows |
| [New Relic](https://newrelic.com) | Free/Paid | Full observability platform; generous free tier (100GB/mo) |
| [PagerDuty](https://pagerduty.com) | Paid ($21+/user/mo) | On-call scheduling, escalation policies, incident management |
| [OpsGenie](https://atlassian.com/software/opsgenie) | Free/Paid ($9+/user/mo) | PagerDuty alternative; good Jira integration |
| [Statuspage](https://atlassian.com/software/statuspage) | Paid ($79+/mo) | Internal and external incident status pages |

> **Recommendation by team size:**
> - MVP: CloudWatch + CloudWatch Alarms + SNS email notifications
> - Startup: Grafana Cloud free tier (10K metrics, 50GB logs) + OTel + PagerDuty free
> - Mid-size: Self-hosted Prometheus + Grafana stack on EKS, or Grafana Cloud at scale
> - Enterprise: Datadog or Grafana Enterprise; PagerDuty with full AIOps

### Steps

**12.1 — Instrument applications with structured logging** `[ALL]`

```typescript
// TypeScript — using pino (recommended) or winston
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'api-gateway',
    version: process.env.APP_VERSION,
    environment: process.env.NODE_ENV,
  },
  // In production, output JSON; in dev, pretty-print
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

// Structured logging — every field is queryable in CloudWatch Insights
logger.info({
  event: 'http.request',
  method: req.method,
  path: req.path,
  statusCode: res.statusCode,
  durationMs: Date.now() - startTime,
  userId: req.user?.id,           // Context — not a secret
}, 'HTTP request completed');
```

**12.2 — Set up OpenTelemetry instrumentation** `[STARTUP]`

```typescript
// otel.ts — bootstrap before app startup
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AWSXRayPropagator } from '@opentelemetry/propagator-aws-xray';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,  // Grafana Tempo or X-Ray
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
  textMapPropagator: new AWSXRayPropagator(),
});

sdk.start();
```

**12.3 — Configure alerting on symptoms** `[STARTUP]`

```hcl
# CloudWatch alarm on error rate (symptom) not CPU (cause)
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "api-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5    # 5% error rate

  metric_name = "HTTPCode_Target_5XX_Count"
  namespace   = "AWS/ApplicationELB"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = [aws_sns_topic.pagerduty.arn]
  ok_actions    = [aws_sns_topic.pagerduty.arn]
}
```

---

## 13. Incident Management & Response

> Your incident process is the operational muscle you build over time. The scaffolding must exist before the first real incident — discovering you have no runbooks at 2am is its own incident.

### Best Practices
- Define severity levels before you need them — the middle of an incident is not the time
- Runbooks should be executable by someone unfamiliar with the system
- Blameless post-mortems are the mechanism for systemic improvement — blame stops learning
- Practice incidents deliberately (game days) — the first run of any process will be imperfect
- Your on-call rotation should be fair and sustainable — burnout is an availability risk

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [PagerDuty](https://pagerduty.com) | Paid ($21+/user/mo) | Industry standard on-call + incident response |
| [OpsGenie](https://atlassian.com/software/opsgenie) | Free/Paid ($9+/user/mo) | More affordable PagerDuty alternative |
| [Incident.io](https://incident.io) | Paid ($19+/user/mo) | Modern incident management with Slack-native workflow |
| [Rootly](https://rootly.com) | Paid | Slack-native incident management; great for engineering teams |
| [Atlassian Statuspage](https://atlassian.com/software/statuspage) | Paid ($79+/mo) | External-facing status page |
| [Cachet](https://cachethq.io) | Free/OSS | Self-hosted status page |
| [AWS Fault Injection Service](https://aws.amazon.com/fis/) | Paid | Managed chaos engineering — inject faults into AWS resources |
| [Chaos Monkey](https://netflix.github.io/chaosmonkey/) | Free/OSS | Netflix's original chaos engineering tool |
| [Notion / Confluence](https://notion.so) | Free/Paid | Runbook and post-mortem documentation |

### Steps

**13.1 — Define severity levels** `[STARTUP]`

```markdown
## Incident Severity Definitions

| Severity | Criteria | Response SLA | Comms Cadence |
|----------|----------|-------------|---------------|
| SEV1 | Production down, all users affected, data loss risk | Page immediately, respond < 5 min | Every 15 min |
| SEV2 | Major feature broken, significant user impact | Page immediately, respond < 15 min | Every 30 min |
| SEV3 | Minor feature degraded, partial user impact | Notify on-call, respond < 1 hr | Every 2 hrs |
| SEV4 | Minor bug, no active user impact | Ticket created, fix in next sprint | On resolution |
```

**13.2 — Post-mortem template** `[STARTUP]`

```markdown
## Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Severity:** SEV[1-4]
**Duration:** X hours Y minutes
**Author(s):** [Name]
**Reviewers:** [Names]

---

### Summary
[2-3 sentence plain-language summary of what happened and impact]

### Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | Incident detected (how: alert / user report / monitoring) |
| HH:MM | On-call engineer paged |
| HH:MM | Initial diagnosis |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |

### Root Cause
[What specifically caused the incident]

### Contributing Factors
[What conditions made the root cause possible or worse]

### What Went Well
- [Thing 1]

### What Went Poorly
- [Thing 1]

### Action Items
| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| [Specific, actionable item] | @name | YYYY-MM-DD | P1 |
```

---

## 14. Disaster Recovery & Business Continuity

> DR is not just backup — it is a defined, tested capability to restore service within acceptable time and data loss targets. Define RTO and RPO before designing any solution; these numbers drive every architecture decision.

### Best Practices
- An untested backup is not a backup — test restores on a regular schedule
- Backups should live in a separate AWS account — production account compromise should not reach backups
- Multi-AZ is the baseline for production; multi-region for critical workloads
- RTO and RPO targets vary by service tier — tier your applications and set appropriate targets
- DR runbooks must be executable under pressure by someone unfamiliar with the system

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS Backup](https://aws.amazon.com/backup/) | Paid (storage cost) | Centralized, policy-driven backup for RDS, EFS, DynamoDB, EBS |
| [AWS DRS (Elastic Disaster Recovery)](https://aws.amazon.com/drs/) | Paid ($0.028/hr/server) | Block-level replication for EC2/on-prem to AWS |
| [Velero](https://velero.io) | Free/OSS | Kubernetes workload backup and restore |
| [S3 Cross-Region Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html) | Paid (transfer cost) | Replicate S3 objects to another region automatically |
| [AWS Route 53 Health Checks](https://aws.amazon.com/route53/) | Paid | DNS failover based on health checks |

### Steps

**14.1 — Define RTO/RPO per service tier** `[STARTUP]`

```markdown
## Service Tier Definitions

| Tier | Examples | RTO | RPO | Strategy |
|------|----------|-----|-----|----------|
| Tier 1 — Critical | Payment processing, auth | < 1 hr | < 5 min | Multi-region active-passive, real-time replication |
| Tier 2 — Important | Core application | < 4 hrs | < 1 hr | Multi-AZ, hourly backups |
| Tier 3 — Standard | Internal tools, analytics | < 24 hrs | < 24 hrs | Single AZ, daily backups |
| Tier 4 — Low | Dev/staging environments | < 72 hrs | Best effort | Recreate from IaC |
```

**14.2 — Configure AWS Backup** `[ALL]`

```hcl
resource "aws_backup_vault" "main" {
  name        = "prod-backup-vault"
  kms_key_arn = aws_kms_key.backup.arn
}

resource "aws_backup_plan" "main" {
  name = "prod-backup-plan"

  rule {
    rule_name         = "daily-backups"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 * * ? *)"   # 2 AM UTC daily

    lifecycle {
      delete_after = 35  # 35 days retention
    }

    copy_action {
      # Copy to backup vault in separate account
      destination_vault_arn = "arn:aws:backup:us-east-1:BACKUP_ACCOUNT_ID:backup-vault:dr-vault"
      lifecycle { delete_after = 90 }
    }
  }

  rule {
    rule_name         = "weekly-backups"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 2 ? * SUN *)"   # Sunday 2 AM UTC

    lifecycle {
      delete_after = 365  # 1 year retention for weekly
    }
  }
}
```

---

## 15. Cost Management

> Cloud costs grow silently until they become a crisis. FinOps discipline from day one is far cheaper than optimizing a bill that has already grown out of control. The best time to set up cost governance was before you started; the second best time is now.

### Best Practices
- Set budget alerts before you deploy anything — not after the first bill arrives
- Cost allocation tags are mandatory and should be enforced via SCP
- Dev environments running 24/7 are the single largest source of preventable waste
- Review costs weekly — anomalies compound quickly in cloud environments
- Reserved Instances and Savings Plans require a stable baseline to commit to — analyze first

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) | Free | Visualize, filter, and analyze AWS spending |
| [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/) | Free (first 2 budgets) | Alerts when spending exceeds or is forecast to exceed a threshold |
| [AWS Cost Anomaly Detection](https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/) | Free | ML-based anomaly detection on spend patterns |
| [Infracost](https://infracost.io) | Free/OSS | Shows cost impact of IaC changes in PR comments |
| [CloudHealth](https://cloudhealth.vmware.com) | Paid | Enterprise multi-cloud FinOps platform |
| [Spot.io](https://spot.io) | Paid (% of savings) | Automated Spot Instance management; 60–80% compute savings |
| [AWS Instance Scheduler](https://aws.amazon.com/solutions/implementations/instance-scheduler-on-aws/) | Free/OSS | Automatic start/stop of EC2 and RDS on a schedule |
| [Komiser](https://komiser.io) | Free/OSS | Open-source cloud cost visibility dashboard |

### Steps

**15.1 — Set up budgets and alerts** `[ALL]`

```hcl
resource "aws_budgets_budget" "monthly_total" {
  name         = "monthly-total-budget"
  budget_type  = "COST"
  limit_amount = "1000"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = ["billing@yourdomain.com"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["billing@yourdomain.com", "cto@yourdomain.com"]
  }
}
```

**15.2 — Enforce cost allocation tags via SCP** `[ALL]`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RequireCostAllocationTags",
      "Effect": "Deny",
      "Action": [
        "ec2:RunInstances",
        "rds:CreateDBInstance",
        "elasticloadbalancing:CreateLoadBalancer",
        "ecs:CreateService"
      ],
      "Resource": "*",
      "Condition": {
        "Null": {
          "aws:RequestTag/Environment": "true",
          "aws:RequestTag/Team": "true"
        }
      }
    }
  ]
}
```

**15.3 — Schedule dev environment shutdown** `[STARTUP]`

```hcl
# AWS Instance Scheduler — stop dev resources outside business hours
resource "aws_scheduler_schedule" "dev_stop" {
  name = "dev-stop-evenings"

  flexible_time_window { mode = "OFF" }
  schedule_expression = "cron(0 19 ? * MON-FRI *)"   # 7 PM UTC weekdays

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
    role_arn = aws_iam_role.scheduler.arn
    input = jsonencode({
      Filters = [{ Name = "tag:Environment", Values = ["dev"] }]
    })
  }
}
```

---

## 16. Developer Experience

> Developer experience is a force multiplier. Every hour spent fighting environment setup, unclear processes, or missing documentation is an hour not spent building product. DX investment pays compounding returns.

### Best Practices
- A new engineer should merge code to dev on day one — if they cannot, fix the onboarding
- Local dev should closely mirror production — environment differences are a debugging tax
- Standardize tooling across all repos — consistency reduces cognitive overhead
- ADRs (Architecture Decision Records) capture why decisions were made, not just what
- Self-service infrastructure removes the ops bottleneck — guardrails make it safe

### Tools

| Tool | Type | Use Case |
|------|------|----------|
| [Docker Compose](https://docs.docker.com/compose/) | Free/OSS | Local multi-service development environment |
| [LocalStack](https://localstack.cloud) | Free/OSS or Paid ($35+/mo) | Emulate AWS services locally (S3, SQS, DynamoDB, Lambda, etc.) |
| [devcontainers](https://containers.dev) | Free/OSS | Reproducible development environments in VS Code / GitHub Codespaces |
| [pre-commit](https://pre-commit.com) | Free/OSS | Framework for managing pre-commit hooks |
| [ESLint](https://eslint.org) / [Biome](https://biomejs.dev) | Free/OSS | Linting for TypeScript/JavaScript |
| [Prettier](https://prettier.io) | Free/OSS | Opinionated code formatter — eliminates style debates |
| [Husky](https://typicode.github.io/husky/) | Free/OSS | Simple pre-commit hooks for Node.js projects |
| [Backstage](https://backstage.io) | Free/OSS | Internal developer portal — service catalog, docs, templates |
| [Mintlify](https://mintlify.com) | Free/Paid | Beautiful developer documentation from markdown |
| [Notion](https://notion.so) | Free/Paid | Team documentation, runbooks, ADRs |

### Steps

**16.1 — Standardize local development environment** `[ALL]`

```yaml
# docker-compose.yml — mirrors production service dependencies
version: '3.9'
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://postgres:password@postgres:5432/myapp_dev
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: myapp_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

**16.2 — Set up pre-commit hooks** `[ALL]`

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/trufflesecurity/trufflehog
    rev: v3.63.7
    hooks:
      - id: trufflehog
        name: Detect secrets
        entry: trufflehog git file://. --since-commit HEAD --only-verified --fail

  - repo: local
    hooks:
      - id: typescript-lint
        name: TypeScript lint
        entry: npm run lint
        language: system
        types: [typescript]
        pass_filenames: false

      - id: typescript-typecheck
        name: TypeScript typecheck
        entry: npm run typecheck
        language: system
        pass_filenames: false
```

**16.3 — ADR template** `[STARTUP]`

```markdown
# ADR-[number]: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-[X]
**Deciders:** [Names / teams involved]

## Context
[What is the situation that requires this decision? What forces are at play?]

## Decision
[What is the change we are making? Be specific.]

## Rationale
[Why this option over the alternatives? What trade-offs were accepted?]

## Alternatives Considered
- **Option A**: [Description + why rejected]
- **Option B**: [Description + why rejected]

## Consequences
**Positive:**
- [Outcome 1]

**Negative / Trade-offs:**
- [Trade-off 1]

**Risks:**
- [Risk 1 + mitigation]
```

---

## Quick Reference: Minimum Viable Setup by Org Size

### MVP / Solo Developer
The minimum needed to build and ship something without accumulating critical security or operational debt:

- Domain + email hosting
- Single AWS account (no org needed yet) with MFA on root
- Route 53 for DNS, ACM for TLS
- GitHub repo with branch protection
- GitHub Actions for CI/CD with OIDC auth to AWS
- Terraform or CDK for all infrastructure (no console-only resources)
- AWS Secrets Manager for any credentials
- ECR + ECS Fargate or Lambda for compute
- CloudWatch for logs and basic alarms
- S3 + Glacier for backups

### Startup (2–20 engineers)
All of the above, plus:

- AWS Organizations with at least 3 accounts (dev / staging / prod)
- IAM Identity Center with Google Workspace as IdP
- SCPs for baseline guardrails (deny root, require encryption, restrict regions)
- GuardDuty and Security Hub enabled org-wide
- Pre-commit hooks + Trivy scanning in CI
- Atlantis or GitHub Actions for Terraform plan/apply workflow
- Centralized logging (CloudWatch Logs Insights or Grafana Loki)
- PagerDuty or OpsGenie on-call rotation
- Defined SEV1/SEV2 incident process + at least one runbook
- AWS Budgets alerts per account
- Dev environment auto-shutdown

### Mid-Size (20–200 engineers)
All of the above, plus:

- Full OU hierarchy with Shared Services and Security accounts
- Transit Gateway for cross-account networking
- Renovate Bot for automated dependency management
- SBOM generation for all artifacts
- Artifactory or Nexus as universal artifact proxy
- SonarQube or Semgrep for SAST in CI
- Grafana + Prometheus stack for full observability
- SLOs defined per service with error budget alerting
- Synthetic monitoring for critical user journeys
- DR runbooks tested quarterly
- Compliance mapping to SOC 2 or ISO 27001
- Access reviews on a quarterly cadence
- Backstage or equivalent internal developer portal

### Enterprise
All of the above, plus:

- Active-active or active-passive multi-region for Tier 1 services
- AWS Private CA or Vault for internal mTLS PKI
- Network Firewall for east-west traffic inspection
- FinOps practice with team-level cost accountability
- Formal penetration testing program
- Hardware security keys (YubiKey) for all privileged access
- Artifact signing with Cosign/Sigstore
- Dedicated security engineering team with SIEM (Splunk, Elastic SIEM)
- Annual third-party security audit

---

*Last updated: 2025 · Version 1.0*