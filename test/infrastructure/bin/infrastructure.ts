#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, BaseConstructsProps, DNS_GLOBAL_RESOURCES_REGION, IBaseConstructs, read_cidrs, Subdomains, SubdomainsProps } from '../../../src';


class SubdomainsStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SubdomainsProps) {
    super(scope, id, props);

    // work out the subdomains vpc settings based on base constructs
    const subdomainspecs = []
    for(const subdomain of props.subdomains){
      subdomainspecs.push({...subdomain})
    }
    const subdomainProps: SubdomainsProps ={
      ...props,
      subdomains: subdomainspecs
    }
    const subdomains = new Subdomains(this, `${id}-subdomains`, subdomainProps)
  }
}

class ServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: AppGwDistributedSpaProps) {
    super(scope, id, props);
    const base = new BaseConstructs(this, `${id}-baseConstructs`, props)
    const service = new AppGwDistributedSpa(this, `${id}-service`, base, props);
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const baseProps: BaseConstructsProps = {
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
  logsBucketOn: true
};

const subdomainsProps: SubdomainsProps = {
  ...baseProps,
  env: {
    ...environment,
    region: DNS_GLOBAL_RESOURCES_REGION
  },
  subdomains: [
    {
      name: "test.jtviegas.com",
      private: false,
      createCertificate: true
    }
  ],
  stackName: "SubdomainsStack"
}

const props: AppGwDistributedSpaProps = {
  ...baseProps,
  stackName: "ServiceStack",
  cloudfront_cidrs: read_cidrs(path.join(__dirname, "../cloudfront_cidr.json")),
  domain: "test.jtviegas.com",
  lambdas: [
    {
      name: "hello",
      image: {
        dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
      },
    }
  ],
  resources: [
    {
      methods: [
        {
          method: "GET",
          lambda: "hello"
        },
        {
          method: "POST",
          lambda: "hello"
        }
      ]
    }
  ]
}

const subdomainsStack = new SubdomainsStack(app, "SubdomainsStack", subdomainsProps);
new ServiceStack(app, "ServiceStack", props);

