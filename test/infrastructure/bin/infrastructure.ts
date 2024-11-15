#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '../../../src';

export interface SpaStackProps extends AppGwDistributedSpaProps {
  readonly logsBucketOn: boolean;
}

class SpaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SpaStackProps) {
    super(scope, id, props);

    const baseConstructs: IBaseConstructs = new BaseConstructs(this, `${id}-base`, props);    
    const service = new AppGwDistributedSpa(this, `${id}-spa`, baseConstructs, props);

    const url: string =  `https://${service.distribution.distributionDomainName}`;
    new CfnOutput(this,  `${id}-outputDistributionUrl`, { value: url, 
      exportName: process.env.OUTPUT_DISTRIBUTION_URL});
    new CfnOutput(this,  `${id}-outputDistributionId`, { value: service.distribution.distributionId, 
      exportName: process.env.OUTPUT_DISTRIBUTION_ID});
    new CfnOutput(this,  `${id}-outputBucketSpa`, { value: service.bucketSpa.bucketName, 
      exportName: process.env.OUTPUT_BUCKET_SPA});
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: SpaStackProps = {
  logsBucketOn: true,
  crossRegionReferences: true,
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
  docker: {
    dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
  }
}

new SpaStack(app, process.env.STACK!, props)



