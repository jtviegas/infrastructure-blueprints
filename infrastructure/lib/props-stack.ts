import * as cdk from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';

export interface SysEnv {
  readonly name: string;
  readonly region?: string;
  readonly account: string;
}

export interface BaseProps extends cdk.StackProps {
  readonly env: SysEnv;
  readonly solution: string;
  readonly organisation: string;
  readonly domain: string;
  readonly parameterPrefix: string;
  readonly resourceNamePrefix: string;
  readonly dnsLoadBalancerDomain: string;
  readonly dnsAppDomain: string;
  readonly dnsParentDomain: string;
}

export interface CommonProps extends BaseProps {
  readonly outputKmsKeyArn: string;
  readonly outputLogGroupArn: string;
  readonly outputBucketLogsArn: string;
  readonly outputRoleArn: string;
  readonly outputVpcName: string;
  readonly outputVpcId: string;
}

export interface SolutionProps extends CommonProps {

  readonly appCertificate: Certificate;
  readonly loadBalancerHostedZone: PublicHostedZone;
  readonly appHostedZone: PublicHostedZone; 


}
