#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack, SolutionProps } from '../lib/infrastructure-stack';


const stackName = process.env.INFRA_STACK!
const app = new cdk.App();
const environment_ctx = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: SolutionProps = {
  env: environment_ctx,
  solution: process.env.SOLUTION!,
  organisation: process.env.ORGANISATION!,
  domain: process.env.DOMAIN!,
  appImage: process.env.APP_IMAGE!,
  outputAppImageUri: process.env.OUTPUT_APP_IMAGE_URI!,
  vpcCidr: process.env.VPC_CIDR!,
  vpcPrivateSubnetCidr: process.env.VPC_PRIV_SUBNET_CIDR!,
  vpcPrivateSubnetAz: process.env.VPC_PRIV_SUBNET_AZ!,
  vpcPublicSubnetCidr: process.env.VPC_PUB_SUBNET_CIDR!,
  vpcPublicSubnetAz: process.env.VPC_PUB_SUBNET_AZ!,
}


new InfrastructureStack(app, stackName, props);