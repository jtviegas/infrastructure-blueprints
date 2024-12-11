#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import { BaseConstructs, DistributedService, DistributedServiceProps, DNS_GLOBAL_RESOURCES_REGION, IPublicSubdomain, PublicSubdomain, PublicSubdomainProps, read_cidrs, SpaSolutionScaffolding, SpaSolutionScaffoldingProps, toResourceName } from '../../../src';
import { Stack } from 'aws-cdk-lib';
import { IFunction, Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { AuthorizationType, LambdaIntegration, PassthroughBehavior } from 'aws-cdk-lib/aws-apigateway';


class SubdomainStack extends Stack {
  readonly subdomain: IPublicSubdomain;
  constructor(scope: Construct, id: string, props: PublicSubdomainProps) {
    super(scope, id, props);
    this.subdomain = new PublicSubdomain(this, `${id}PublicSubdomain`, props)
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const subdomainProps: PublicSubdomainProps = {
  crossRegionReferences: true,
  organisation: "nn",
  department: "dsss",
  solution: "testdsrv",
  env: {
    ...environment,
    region: DNS_GLOBAL_RESOURCES_REGION
  },
  tags: {
    organisation: "nn",
    department: "dsss",
    solution: "testdsrv",
    environment: environment.name,
  },
  stackName: "SubdomainStack",
  name: "test.jtviegas.com"
}

const subdomainStack = new SubdomainStack(app, subdomainProps.stackName!, subdomainProps);


class DistributeServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: DistributedServiceProps) {
    super(scope, id, props);
    const base = new BaseConstructs(this, `${id}BaseConstructs`, props)
    const spa = new DistributedService(this, `${id}-service`, props, base);
  }
}

const srvProps: DistributedServiceProps = {
  ...subdomainProps,
  env: environment,
  domain: {
    distribution: "ui.jtviegas.com",
  },
  docker: {
    imageUri: "strm/helloworld-http"
  },
}
const spaStack = new DistributeServiceStack(app, srvProps.stackName!, srvProps);