#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SolutionStack, SolutionStackProps } from '@jtviegas/cdk-blueprints';


const app = new cdk.App();
const stackName = `${process.env.STACK_PREFIX!}`
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: SolutionStackProps = {
  crossRegionReferences: true,
  env: environment,
  tags: {
    organisation: process.env.ORGANISATION!,
    department: process.env.DEPARTMENT!,
    solution: process.env.SOLUTION!,
    environment: environment["name"]
  },
  organisation: process.env.ORGANISATION!,
  department: process.env.DEPARTMENT!,
  solution: process.env.SOLUTION!,
  stackName: stackName,
  domainLoadBalancer: process.env.DNS_LOADBALANCER_DOMAIN!,
  domainDistribution: process.env.DNS_APP_DOMAIN!,
  parentDomain: process.env.DNS_PARENT_DOMAIN!,
  dockerfileDir: "../app"
}

const solutionStack = new SolutionStack(app, stackName, props)
