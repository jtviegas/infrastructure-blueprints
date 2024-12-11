#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path = require('path');
//import { AppGwDistributedSpa, AppGwDistributedSpaProps, BaseConstructs, IBaseConstructs } from '@jtviegas/cdk-blueprints';
import {
  BaseConstructs, DistributedService, DistributedServiceProps, DNS_GLOBAL_RESOURCES_REGION, IPublicSubdomain,
  PublicSubdomain, PublicSubdomainProps
} from '../../../src';
import { Stack } from 'aws-cdk-lib';

interface SubdomainStackProps extends PublicSubdomainProps {
  readonly lb: string;
}
class SubdomainStack extends Stack {

  constructor(scope: Construct, id: string, props: SubdomainStackProps) {
    super(scope, id, props);
    new PublicSubdomain(this, `${id}PublicSubdomainUi`, props)
    new PublicSubdomain(this, `${id}PublicSubdomainLb`, {...props, name: props.lb})
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const subdomainProps: SubdomainStackProps = {
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
  name: "ui.jtviegas.com",
  lb: "lb.jtviegas.com",
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
    loadBalancer: "lb.jtviegas.com"
  },
  docker: {
    imageUri: "strm/helloworld-http"
  },
  stackName: "ServiceStack",
}
const spaStack = new DistributeServiceStack(app, srvProps.stackName!, srvProps);