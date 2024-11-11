#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
//import { Subdomains, SubdomainsProps } from '@jtviegas/cdk-blueprints';
import { Subdomains, SubdomainsProps, BaseConstructs, BaseConstructsProps, 
  IBaseConstructs, DistributedServiceProps, DistributedService, CommonStackProps } from "../../../src"
import path = require('path');
import { Construct } from 'constructs';


class BaseStack extends cdk.Stack {
  readonly baseConstructs: IBaseConstructs;

  constructor(scope: Construct, id: string, props: BaseConstructsProps) {
    super(scope, id, props);
    this.baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
  }
}

class SubdomainsStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SubdomainsProps, base: IBaseConstructs) {
    super(scope, id, props);

    // work out the subdomains vpc settings based on base constructs
    const subdomainspecs = []
    for(const subdomain of props.subdomains){
      subdomainspecs.push({...subdomain, vpc: base.getVpcLookupAttributes()})
    }
    const subdomainProps: SubdomainsProps ={
      ...props,
      subdomains: subdomainspecs
    }
    const subdomains = new Subdomains(this, `${id}-subdomains`, subdomainProps)
  }
}

class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id, props);
    const service = new DistributedService(this, `${id}-service`, props, baseConstructs);
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
  stackName: "BaseStack",
  logsBucketOn: true
}
const baseStack = new BaseStack(app, "BaseStack", baseProps, );

const subdomainsProps: SubdomainsProps = {
  ...baseProps,
  env: {...environment, region: "us-east-1"},
  domain: {
    name: "jtviegas.com",
    private: false
  },
  subdomains: [
    { name: "ui.jtviegas.com", private: false, createCertificate: true}, 
    { name: "lb.jtviegas.com", private: false, createCertificate: false}
  ],
  stackName: "SubdomainsStack",
}
const subdomainsStack = new SubdomainsStack(app, "SubdomainsStack", subdomainsProps, baseStack.baseConstructs);

const dsProps: DistributedServiceProps = {
  ...subdomainsProps,
  env: environment,
  domain: {
    distribution: "ui.jtviegas.com",
    loadBalancer: "lb.jtviegas.com"
  },
  docker: {
    imageUri: "strm/helloworld-http"
  },
  stackName: "ServiceStack",
}
new ServiceStack(app, "ServiceStack", dsProps, baseStack.baseConstructs)

