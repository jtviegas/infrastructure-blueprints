import { Stack } from "aws-cdk-lib";
import { CommonStackProps } from "../../constructs/commons";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps, VpcSpec } from "../base";
import { DnsStack } from "./dns";
import { ServiceStackProps, ServiceStack } from "./service";


export interface SolutionStackProps extends CommonStackProps {
  readonly vpcSpec?: VpcSpec;
  readonly domainLoadBalancer: string;
  readonly domainDistribution: string;
  readonly parentDomain: string;
  readonly dockerfileDir: string;
}


export class SolutionStack extends Stack {

  constructor(scope: Construct, id: string, props: SolutionStackProps) {
    super(scope, id, props);

    const baseProps: BaseStackProps = { ...props, logsBucketOn: true }
    const baseStack = new BaseStack(this, `${id}-baseStack`, baseProps);
    const dnsStack = new DnsStack(this, `${id}-dnsStack`, props);


    const serviceProps: ServiceStackProps = {
      ...props,
      role: baseStack.role,
      vpc: baseStack.vpc,
      key: baseStack.key,
      logGroup: baseStack.logGroup,
      bucketLogs: baseStack.logsBucket!,
      hostedZoneLoadBalancer: dnsStack.hostedZoneLoadBalancer,
      hostedZoneDistribution: dnsStack.hostedZoneSrv,
      certificateDistribution: dnsStack.certificateSrv
    }
    const serviceStack = new ServiceStack(this, `${id}-serviceStack`, serviceProps);
    serviceStack.node.addDependency([baseStack.logsBucket]);
  }


}