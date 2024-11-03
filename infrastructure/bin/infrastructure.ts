#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BaseProps, CommonProps, SolutionProps } from '../lib/props-stack';

import { DnsStack } from '../lib/dns-stack';
import { SolutionStack } from '../lib/solution-stack';
import { BaseStack, BaseStackProps } from '@jtviegas/cdk-blueprints';


const app = new cdk.App();
const baseStackName = `${process.env.STACK_PREFIX!}-baseStack`
const environment = ((app.node.tryGetContext("environments"))["solution"])[(process.env.ENVIRONMENT || 'dev')]


const baseProps: BaseStackProps = {
  crossRegionReferences: true,
  env: solutionEnvironment,
  tags: {
    organisation: process.env.ORGANISATION!,
    department: process.env.DEPARTMENT!,
    solution: process.env.SOLUTION!,
    environment: solutionEnvironment["name"]
  },
  organisation: process.env.ORGANISATION!,
  department: process.env.DEPARTMENT!,
  solution: process.env.SOLUTION!,
  logsBucket: true,
}

const baseStack = new BaseStack(app, baseStackName, baseProps);

const dnsProps: BaseProps = {
    ...baseProps,
    env: dnsEnvironment,
  }

// const baseProps: BaseProps = {
//   env: solutionEnvironment,
//   tags: {
//     organisation: process.env.ORGANISATION!,
//     domain: process.env.DOMAIN!,
//     solution: process.env.SOLUTION!,
//     environment: solutionEnvironment["name"]
//   },
//   solution: process.env.SOLUTION!,
//   organisation: process.env.ORGANISATION!,
//   domain: process.env.DOMAIN!,
//   parameterPrefix: `/${process.env.SOLUTION!}/${solutionEnvironment["name"]}`,
//   resourceNamePrefix: `${process.env.DOMAIN!}-${process.env.SOLUTION!}`,
//   dnsLoadBalancerDomain: process.env.DNS_LOADBALANCER_DOMAIN!,
//   dnsAppDomain: process.env.DNS_APP_DOMAIN!,
//   dnsParentDomain: process.env.DNS_PARENT_DOMAIN!,
//   crossRegionReferences: true
// }

// const commonProps: CommonProps = {
//   ...baseProps,
//   outputKmsKeyArn: process.env.OUTPUT_KMSKEY_ARN!,
//   outputLogGroupArn: process.env.OUTPUT_LOGGROUP_ARN!,
//   outputBucketLogsArn: process.env.OUTPUT_BUCKETLOGS_ARN!,
//   outputRoleArn: process.env.OUTPUT_ROLE_ARN!,
//   outputVpcName: process.env.OUTPUT_VPC_NAME!,
//   outputVpcId: process.env.OUTPUT_VPC_ID!,
// }

// const dnsProps: BaseProps = {
//   ...baseProps,
//   env: dnsEnvironment,
// }

// const commonStack = new CommonStack(app, commonStackName, commonProps);
// const dnsStack = new DnsStack(app, dnsStackName, dnsProps);

// const solutionProps: SolutionProps = {
//   ...commonProps,
//   appCertificate: dnsStack.appCertificate,
//   loadBalancerHostedZone: dnsStack.loadBalancerHostedZone,
//   appHostedZone: dnsStack.appHostedZone,
//   bucketLogs: commonStack.output.bucketLogs,
//   key: commonStack.output.key,
//   logGroup: commonStack.output.logGroup,
//   role: commonStack.output.role,
//   vpc: commonStack.output.vpc
// }
// const solutionStack = new SolutionStack(app, solutionStackName, solutionProps);
