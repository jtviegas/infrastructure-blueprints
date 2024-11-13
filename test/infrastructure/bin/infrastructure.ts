#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
//import { Subdomains, SubdomainsProps } from '@jtviegas/cdk-blueprints';
import {
  BaseConstructs, AppGwDistributedSpaProps,
  AppGwDistributedSpa
} from "../../../src";
import { Construct } from 'constructs';
import path = require('path');


class SpaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppGwDistributedSpaProps) {
    super(scope, id, props);
    const baseConstructs = new BaseConstructs(this, `${id}-base`, props)
    const service = new AppGwDistributedSpa(this, `${id}-spa`, props, baseConstructs);
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: AppGwDistributedSpaProps = {
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
  stackName: "SpaStack",
  docker: {
    dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
  }
}

new SpaStack(app, "SpaStack", props)

