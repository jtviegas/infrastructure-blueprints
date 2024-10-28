#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack, SolutionProps } from '../lib/infrastructure-stack';

const stackName = process.env.INFRA_STACK!
const app = new cdk.App();
const environment_ctx = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: SolutionProps = {
  env: environment_ctx,
  tags: {
    organisation: process.env.ORGANISATION!,
    domain: process.env.DOMAIN!,
    solution: process.env.SOLUTION!,
    environment: environment_ctx["name"]
  },
  solution: process.env.SOLUTION!,
  organisation: process.env.ORGANISATION!,
  domain: process.env.DOMAIN!,
  appImage: process.env.APP_IMAGE!,
  dnsName: process.env.DNS_NAME!,
  hostedZoneId: process.env.DNS_HOSTED_ZONE_ID!,
  hostedZone: process.env.DNS_HOSTED_ZONE!,
}


new InfrastructureStack(app, stackName, props);
