#!/usr/bin/env node
// =============================================================================
// infrastructure/bin/duseum.ts
// CDK app entry point
//
// Usage:
//   cdk synth  --context env=dev  [--context sha=<git-sha>]
//   cdk deploy --context env=prod [--context sha=<git-sha>]
//
// Rules (CLAUDE.md):
//   - env must be 'dev' or 'prod' — throws if missing or invalid
//   - Account: 408141212087 (shared dev + prod — env prefix isolates resources)
//   - Region:  us-east-1
//   - No hardcoded ARNs or resource names — all driven from envName context
// =============================================================================

import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { DuseumStage } from '../constructs/duseum-stage'

const app = new cdk.App()

// ── Validate required context ─────────────────────────────────────────────────

const env = app.node.tryGetContext('env') as string | undefined

if (!env) {
  throw new Error(
    'Missing required CDK context: pass --context env=dev or --context env=prod'
  )
}

if (env !== 'dev' && env !== 'prod') {
  throw new Error(
    `Invalid env context "${env}": must be exactly "dev" or "prod"`
  )
}

// Optional: git SHA for traceability tags (supplied by GitHub Actions)
const sha = app.node.tryGetContext('sha') as string | undefined

// ── AWS environment ───────────────────────────────────────────────────────────

const awsEnv: cdk.Environment = {
  account: '408141212087',
  region: 'us-east-1',
}

// NOTE: OIDC provider + IAM deploy/build roles are NOT managed by CDK.
// They are pre-provisioned by scripts/bootstrap.sh (Sections 5 + 6) and must
// exist before CDK can run — CDK needs the deploy role to deploy (chicken-and-egg).

// ── Application stage ─────────────────────────────────────────────────────────

new DuseumStage(app, `duseum-${env}`, {
  envName: env,
  sha,
  env: awsEnv,
})
