import * as cdk from 'aws-cdk-lib';
import { Environment } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { IStackSynthesizer } from 'aws-cdk-lib';
import { BaseStackProperties, SysEnv } from '@jtviegas/cdk-blueprints';


export interface BaseProps extends BaseStackProperties {
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
  readonly vpc: Vpc;
  readonly bucketLogs: Bucket;
  readonly logGroup: LogGroup;
  readonly key: Key;
  readonly role: Role;
}
