#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import {
  createCustomFunction, CustomCodeFunctionProps, read_cidrs,
  SpaWholeScaffolding,
  SpaWholeScaffoldingProps
} from '../../../src';
import { Stack } from 'aws-cdk-lib';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, PassthroughBehavior } from 'aws-cdk-lib/aws-apigateway';

interface TestStackProps extends SpaWholeScaffoldingProps {
  readonly functions: { [key: string]: CustomCodeFunctionProps; };
}

class TestStack extends Stack {
  readonly functions: { [key: string]: IFunction; } = {};
  constructor(scope: Construct, id: string, props: TestStackProps) {
    super(scope, id, props);

    const spa = new SpaWholeScaffolding(this, "SpaWholeScaffolding", props);

    for (const n in props.functions) {
      let cf: CustomCodeFunctionProps = props.functions[n];
      this.functions[cf.name] = createCustomFunction(this, id, spa, props, cf);
    }

    spa.resourceApi.addResource('hello').addMethod('GET',
      new LambdaIntegration(this.functions["hello"], {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      }),
      { apiKeyRequired: false },);

  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: TestStackProps = {
  organisation: process.env.ORGANISATION!,
  department: process.env.DEPARTMENT!,
  solution: process.env.SOLUTION!,
  env: environment,
  tags: {
    organisation: process.env.ORGANISATION!,
    department: process.env.DEPARTMENT!,
    solution: process.env.SOLUTION!,
    environment: environment.name,
  },
  stackName: process.env.STACK!,
  cloudfront_cidrs: read_cidrs(path.join(__dirname, "../cloudfront_cidr.json")),
  domain: {
    hostedZoneId: process.env.DOMAIN_HZ_ID!,
    name: process.env.DOMAIN_NAME!,
    certificateArn: process.env.DOMAIN_CERT_ARN!
  },
  functions: {
    "hello": {
      name: "hello",
      dirCode: path.join(__dirname, "../../resources/docker/hellosrv")
    }
  },
}

const spaStack = new TestStack(app, props.stackName!, props);