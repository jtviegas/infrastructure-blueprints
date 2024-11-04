#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DistributedLoadBalancedServiceStack, DistributedLoadBalancedServiceStackProps, SubdomainsStack, SubdomainsStackProps } from '@jtviegas/cdk-blueprints';
import path = require('path');


const app = new cdk.App();

const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const subdomainProps: SubdomainsStackProps = {
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
  stackName: process.env.STACK_SUBDOMAINS!,
  domain: {
    name: process.env.DNS_PARENT_DOMAIN!,
  },
  subdomains:[
    {
      name: process.env.DNS_APP_DOMAIN!,
      createCertificate: true,
    },
    {
      name: process.env.DNS_LOADBALANCER_DOMAIN!
    }
  ]
}

const solutionStack = new SubdomainsStack(app, process.env.STACK_SUBDOMAINS!, subdomainProps)

const props: DistributedLoadBalancedServiceStackProps = {
  ...subdomainProps,
  logsBucketOn: true,
  stackName: process.env.STACK_SERVICE!,
  domainLoadBalancer: process.env.DNS_LOADBALANCER_DOMAIN!,
  dockerfileDir: path.join(__dirname, '../../app'),
  domainDistribution: process.env.DNS_APP_DOMAIN!,
}

const serviceStack = new DistributedLoadBalancedServiceStack(app, process.env.STACK_SERVICE!, props)