#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, CLOUDFRONT_PREFIX_LIST, 
  DNS_GLOBAL_RESOURCES_REGION, 
  IBaseConstructs, read_cidrs, 
  Subdomains,
  SubdomainSpec,
  SubdomainsProps} from '../../../src';
  

class SubdomainsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SubdomainsProps) {
    super(scope, id, props);
    const subdomains = new Subdomains(this, `${id}-subdomains`, props)
  }
}

interface SpaStackProps extends AppGwDistributedSpaProps {
  readonly logsBucketOn: boolean;
  readonly subdomains: SubdomainSpec[];
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
  cloudfront_cidrs: read_cidrs(path.join(__dirname, "../cloudfront_cidr.json")),
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
  },
  subdomains: [
    {
      name: "dev.jtviegas.com",
      createCertificate: true,
      private: false
    }
  ]
}

new SubdomainsStack(app, process.env.STACK_SUBDOMAINS!, 
  {
    ...props, 
    env: {...props.env, region: DNS_GLOBAL_RESOURCES_REGION},
    stackName: process.env.STACK_SUBDOMAINS!
});
new SpaStack(app, process.env.STACK!, {...props, domain: props.subdomains[0].name})



