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
  dnsLoadBalancerDomain: process.env.DNS_LOADBALANCER_DOMAIN!,
  dnsAppDomain: process.env.DNS_APP_DOMAIN!,
  dnsParentDomain: process.env.DNS_PARENT_DOMAIN!,
}


new InfrastructureStack(app, stackName, props);
