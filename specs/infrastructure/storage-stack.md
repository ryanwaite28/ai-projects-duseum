## Spec: Storage Stack (DynamoDB + S3)

**Status**: ✅ Implemented
**FR coverage**: NFR-SCALE-01, NFR-SCALE-03, NFR-REL-03
**Relevant PROJECT.md sections**: 4.7, 5, 13.5

**What this implements**: CDK StorageStack provisioning DynamoDB main table + idempotency table + config table; S3 media bucket (private); SSM output publishing.

**Prerequisites**: AWS account `408141212087` bootstrapped (`duseum-cdk-toolkit` stack exists in `us-east-1`); `aws sso login --profile rmw-llc` completed; CDK v2 installed

**Done when**:
- [x] `cdk synth --strict --context env=dev` passes with zero warnings
- [x] Three DynamoDB tables deployed with on-demand billing; TTL enabled on idempotency table
- [x] S3 bucket blocks all public access; CORS allows PUT from `*.duseum.com` and `localhost`
- [x] GSI1, GSI2, GSI3 defined on main table
- [x] All 5 SSM outputs written under `/duseum/{env}/stacks/storage/`
- [x] All resources tagged `Project=duseum`, `Environment={env}`, `Stack=storage`, `ManagedBy=CDK`
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `infrastructure/stacks/storage-stack.ts` — DynamoDB tables + S3 bucket + SSM outputs

**DynamoDB tables**:
| Table | Purpose | Billing | TTL |
|---|---|---|---|
| `duseum-{env}-dynamodb-main` | All application data (single-table design) | On-demand | No |
| `duseum-{env}-dynamodb-idempotency` | Stripe webhook dedup | On-demand | Yes (`ttl` attribute) |
| `duseum-{env}-dynamodb-config` | Platform config, featured author state | On-demand | No |

**S3 bucket**:
- Name: `duseum-{env}-s3-media`
- Block all public access
- CORS: allow PUT from `*.duseum.com` + `localhost` (for presigned URL uploads)
- Lifecycle: delete objects with `upload-intent/` prefix after 1 day (expired intents cleanup)

**GSI definitions** (on main table):
| GSI | PK | SK | Purpose |
|---|---|---|---|
| `GSI1` | `GSI1PK` | `GSI1SK` | Author directory (ENTITY#AUTHOR), pieces by Author, collections by Author |
| `GSI2` | `GSI2PK` | `GSI2SK` | Tag-based browse; `GSI2PK=TAG#{tag}` |
| `GSI3` | `GSI3PK` | `GSI3SK` | Trending/recent browse; `GSI3PK=BROWSE#PUBLIC` sorted by publishedAt or trendScore |

**SSM outputs** (`/duseum/{env}/stacks/storage/`):
- `dynamodb_main_table_name`
- `dynamodb_idempotency_table_name`
- `dynamodb_config_table_name`
- `s3_media_bucket_name`
- `s3_media_bucket_arn`

**Tags**: `Project=duseum`, `Environment={env}`, `Stack=storage`, `ManagedBy=CDK`

**Tests to write**:
- CDK unit: tables created with correct billing mode and TTL; S3 bucket has block public access; SSM params written
