#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
//import { Subdomains, SubdomainsProps } from '@jtviegas/cdk-blueprints';
import {
  BaseConstructs, AppGwDistributedService,
  AppGwDistributedServiceProps
} from "../../../src";
import { Construct } from 'constructs';
import path = require('path');


class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps) {
    super(scope, id, props);
    const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
    const service = new AppGwDistributedService(this, `${id}-service`, props, baseConstructs);
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: AppGwDistributedServiceProps = {
  crossRegionReferences: true,
  organisation: "nn",
  department: "dsss",
  solution: "testdsrv",
  env: environment,
  tags: {
    organisation: "nn",
    department: "dsss",
    solution: "testdsrv",
    environment: environment.name,
  },
  stackName: "ServiceStack",
  docker: {
    // imageUri: "strm/helloworld-http",
    dockerfileDir: path.join(__dirname, "../../resources/docker/streamlit-frontend")
  }
}

new ServiceStack(app, "ServiceStack", props)

