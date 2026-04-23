// =============================================================================
// infrastructure/stacks/oidc-stack.ts
// OidcStack — GitHub Actions OIDC provider + IAM deploy roles
//
// Deployed ONCE manually to account 408141212087/us-east-1 (Section 11.3):
//   cd infrastructure
//   npx cdk deploy OidcStack --context env=dev --profile rmw-llc
//
// Creates:
//   1. GitHub Actions OIDC provider (token.actions.githubusercontent.com)
//   2. duseum-github-actions-deploy-dev  — trusted by develop-branch pushes
//   3. duseum-github-actions-deploy-prod — trusted by v*.*.* tag pushes only
//
// After deploy, set GitHub Actions secrets:
//   AWS_ROLE_ARN_DEPLOY_DEV  = SSM /duseum/shared/oidc/role_arn_deploy_dev
//   AWS_ROLE_ARN_DEPLOY_PROD = SSM /duseum/shared/oidc/role_arn_deploy_prod
// =============================================================================

import * as cdk from 'aws-cdk-lib'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'

const GITHUB_REPO = 'ryanwaite28/ai-projects-duseum'
// Thumbprint for token.actions.githubusercontent.com — rotate if GitHub rotates their cert
const OIDC_THUMBPRINT = '6938fd4d98bab03faadb97b34396831e3780aea1'

export class OidcStack extends cdk.Stack {
  public readonly deployDevRole: iam.Role
  public readonly deployProdRole: iam.Role

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    cdk.Tags.of(this).add('Project', 'duseum')
    cdk.Tags.of(this).add('ManagedBy', 'CDK')

    // =========================================================================
    // GitHub Actions OIDC Provider
    // =========================================================================

    const oidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: [OIDC_THUMBPRINT],
    })

    // =========================================================================
    // Shared OIDC principal factory
    // =========================================================================

    const oidcPrincipal = (subCondition: string) =>
      new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': subCondition,
        },
      })

    // =========================================================================
    // duseum-github-actions-deploy-dev
    // Trusted by: any ref in the repo (develop push + PR + workflow_dispatch)
    // =========================================================================

    this.deployDevRole = new iam.Role(this, 'DeployDevRole', {
      roleName: 'duseum-github-actions-deploy-dev',
      description: 'GitHub Actions OIDC role for dev deployments — repo ryanwaite28/ai-projects-duseum',
      assumedBy: oidcPrincipal(`repo:${GITHUB_REPO}:*`),
      maxSessionDuration: cdk.Duration.hours(1),
    })

    // CDK deploy requires broad permissions: CloudFormation, all deployed services,
    // IAM (creating Lambda execution roles), S3 (CDK bootstrap + artifact bucket).
    this.deployDevRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    )

    cdk.Tags.of(this.deployDevRole).add('Project', 'duseum')
    cdk.Tags.of(this.deployDevRole).add('Environment', 'dev')
    cdk.Tags.of(this.deployDevRole).add('ManagedBy', 'CDK')

    // =========================================================================
    // duseum-github-actions-deploy-prod
    // Trusted by: tag refs (v*.*.*) only — enforces tag-gated prod deploys
    // =========================================================================

    this.deployProdRole = new iam.Role(this, 'DeployProdRole', {
      roleName: 'duseum-github-actions-deploy-prod',
      description: 'GitHub Actions OIDC role for prod deployments — tag refs only',
      assumedBy: oidcPrincipal(`repo:${GITHUB_REPO}:ref:refs/tags/v*`),
      maxSessionDuration: cdk.Duration.hours(1),
    })

    this.deployProdRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')
    )

    cdk.Tags.of(this.deployProdRole).add('Project', 'duseum')
    cdk.Tags.of(this.deployProdRole).add('Environment', 'prod')
    cdk.Tags.of(this.deployProdRole).add('ManagedBy', 'CDK')

    // =========================================================================
    // SSM outputs — copy these ARNs into GitHub Actions secrets after deploy
    // =========================================================================

    new ssm.StringParameter(this, 'SsmDeployDevRoleArn', {
      parameterName: '/duseum/shared/oidc/role_arn_deploy_dev',
      stringValue: this.deployDevRole.roleArn,
      description: 'GitHub Actions OIDC deploy-dev role ARN → set as AWS_ROLE_ARN_DEPLOY_DEV secret',
    })

    new ssm.StringParameter(this, 'SsmDeployProdRoleArn', {
      parameterName: '/duseum/shared/oidc/role_arn_deploy_prod',
      stringValue: this.deployProdRole.roleArn,
      description: 'GitHub Actions OIDC deploy-prod role ARN → set as AWS_ROLE_ARN_DEPLOY_PROD secret',
    })
  }
}
