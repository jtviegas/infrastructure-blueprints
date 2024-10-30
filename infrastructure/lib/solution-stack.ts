import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Fn, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SolutionProps } from './props-stack';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

import path = require('path');
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';


export class SolutionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SolutionProps) {
    super(scope, id, props);

    // --- common resources ---

    const kmsKeyArn = Fn.importValue(props.outputKmsKeyArn);
    const kmsKey = Key.fromKeyArn(this, `${id}-kmsKey`, kmsKeyArn)

    const logGroupArn = Fn.importValue(props.outputLogGroupArn);
    const logGroup = LogGroup.fromLogGroupArn(this, `${id}-logGroup`, logGroupArn)

    const cfnConfTags = []
    for (const key in props.tags) {
      cfnConfTags.push({ key: key, value: props.tags[key] })
    }

    // --- logs bucket ---
    const bucketLogsArn = Fn.importValue(props.outputBucketLogsArn);
    const bucketLogs = Bucket.fromBucketArn(this, `${id}-bucketLogs`, bucketLogsArn)

    // --- solution role ---
    const roleArn = Fn.importValue(props.outputRoleArn);
    const role = Role.fromRoleArn(this, `${id}-role`, roleArn)

    // --- network ---
    const vpcName = StringParameter.valueFromLookup(this, `${props.parameterPrefix}/${props.outputVpcName}`);
    const vpcId = StringParameter.valueFromLookup(this, `${props.parameterPrefix}/${props.outputVpcId}`);
    const vpc = Vpc.fromLookup(this, `${id}-vpc`, {vpcName: vpcName, vpcId: vpcId});

    // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-containerImageApp`, {
      directory: path.join(__dirname, '../../app'),
      assetName: props.resourceNamePrefix,
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(role)

    // --- fargate service ---

    const ecsCluster = new Cluster(this, `${id}-ecsCluster`, {
      vpc: vpc,
      clusterName: `${props.resourceNamePrefix}-cluster`,
      containerInsights: true,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        kmsKey,
        logConfiguration: {
          cloudWatchLogGroup: logGroup,
          cloudWatchEncryptionEnabled: true,
        },
        logging: ExecuteCommandLogging.OVERRIDE,
      },
    });

    const taskDefinitionApp = new FargateTaskDefinition(this, `${id}-taskDefinitionApp`, {
      executionRole: role, // grants the ECS agent permission to call AWS APIs
      family: `${props.solution}-app`,
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: role, // grants containers in the task permission to call AWS APIs,
    });

    taskDefinitionApp.addContainer(`${id}-taskDefinitionContainerApp`, {
      image: ContainerImage.fromRegistry(containerImageApp.imageUri),
      containerName: `${props.resourceNamePrefix}-app`,
      logging: LogDrivers.awsLogs({
        streamPrefix: `${props.resourceNamePrefix}-app`,
        mode: AwsLogDriverMode.NON_BLOCKING,
        logGroup: logGroup,
        maxBufferSize: Size.mebibytes(25),
      }),
      portMappings: [{
        protocol: Protocol.TCP,
        containerPort: 80,
        appProtocol: AppProtocol.http,
        name: "app",
      }]
    });

    const securityGroupApp = new SecurityGroup(this, `${id}-securityGroupApp`, {
      vpc: vpc,
      securityGroupName: `${props.resourceNamePrefix}-sgApp`,
    });
    securityGroupApp.addIngressRule(Peer.prefixList("pl-fab65393"), Port.allTcp(), "allow all tcp ingress from cloudfront distribution")

    const fargateServiceApp = new ApplicationLoadBalancedFargateService(this, `${id}-fargateServiceApp`, {
      assignPublicIp: false,
      cluster: ecsCluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: 512, // Default is 256
      desiredCount: 1, // Default is 1
      domainName: props.dnsLoadBalancerDomain,
      domainZone: props.loadBalancerHostedZone,
      memoryLimitMiB: 2048, // Default is 512
      loadBalancerName: `${props.resourceNamePrefix}-lb`,
      propagateTags: PropagatedTagSource.SERVICE,
      protocol: ApplicationProtocol.HTTPS,
      publicLoadBalancer: true,
      redirectHTTP: true,
      securityGroups: [securityGroupApp],
      serviceName: `${props.resourceNamePrefix}-app`,
      taskDefinition: taskDefinitionApp,
      openListener: false,
    });
    fargateServiceApp.loadBalancer.addSecurityGroup(securityGroupApp)

    // ------- cloudfront distribution  -------

    const lbOriginApp = new HttpOrigin(props.dnsLoadBalancerDomain, {protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY})

    const distributionApp = new Distribution(this, `${id}-distributionApp`, {
      defaultBehavior: { 
        origin:  lbOriginApp, 
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        allowedMethods: AllowedMethods.ALLOW_ALL, 
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      certificate: props.appCertificate,
      domainNames: [props.dnsAppDomain],
      enableLogging: true,
      logBucket: bucketLogs,
      logIncludesCookies: true,
      logFilePrefix: `${props.resourceNamePrefix}-cloudfront`,
    });

    distributionApp.applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, "distributionUrl", { value: `https://${distributionApp.distributionDomainName}` });

    const aRecordApp = new ARecord(this, `${id}-aRecordApp`, {
      zone: props.appHostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distributionApp)),
    });

  }
}
