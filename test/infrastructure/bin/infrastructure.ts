#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import { AppGwDistributedService, AppGwDistributedServiceProps, AppGwDistributedServicePublic, AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, CLOUDFRONT_PREFIX_LIST, 
  DNS_GLOBAL_RESOURCES_REGION, 
  IBaseConstructs, read_cidrs, 
  Subdomains,
  SubdomainSpec,
  SubdomainsProps} from '../../../src';
  
  class ServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps) {
      super(scope, id, props);
      const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
      const service = new AppGwDistributedService(this, `${id}-service`, props, baseConstructs);
    }
  }

  class ServicePublicStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps) {
      super(scope, id, props);
      const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, {...props, logsBucketOn: true})
      const service = new AppGwDistributedServicePublic(this, `${id}-service`, props, baseConstructs);
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
  new ServicePublicStack(app, "ServicePublicStack", {...props, stackName: "ServicePublicStack"})
