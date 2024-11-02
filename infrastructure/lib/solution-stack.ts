import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, Fn, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
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

  readonly CLOUDFRONT_PREFIX_LIST: string = "pl-fab65393";

  constructor(scope: Construct, id: string, props: SolutionProps) {
    super(scope, id, props);


    // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-containerImageApp`, {
      directory: path.join(__dirname, '../../app'),
      assetName: props.resourceNamePrefix,
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(props.role)

    // --- fargate service ---

    const ecsCluster = new Cluster(this, `${id}-ecsCluster`, {
      vpc: props.vpc,
      clusterName: `${props.resourceNamePrefix}-cluster`,
      containerInsights: true,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        kmsKey: props.key,
        logConfiguration: {
          cloudWatchLogGroup: props.logGroup,
          cloudWatchEncryptionEnabled: true,
        },
        logging: ExecuteCommandLogging.OVERRIDE,
      },
    });

    const taskDefinitionApp = new FargateTaskDefinition(this, `${id}-taskDefinitionApp`, {
      executionRole: props.role, // grants the ECS agent permission to call AWS APIs
      family: `${props.solution}-app`,
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: props.role, // grants containers in the task permission to call AWS APIs,
    });

    taskDefinitionApp.addContainer(`${id}-taskDefinitionContainerApp`, {
      image: ContainerImage.fromRegistry(containerImageApp.imageUri),
      containerName: `${props.resourceNamePrefix}-app`,
      logging: LogDrivers.awsLogs({
        streamPrefix: `${props.resourceNamePrefix}-app`,
        mode: AwsLogDriverMode.NON_BLOCKING,
        logGroup: props.logGroup,
        maxBufferSize: Size.mebibytes(25),
      }),
      portMappings: [{
        protocol: Protocol.TCP,
        containerPort: 80,
        appProtocol: AppProtocol.http,
        name: "service",
      }]
    });

    const securityGroupApp = new SecurityGroup(this, `${id}-securityGroupApp`, {
      vpc: props.vpc,
      securityGroupName: `${props.resourceNamePrefix}-sgApp`,
    });
    securityGroupApp.addIngressRule(Peer.prefixList(this.CLOUDFRONT_PREFIX_LIST), Port.allTcp(), "allow all tcp ingress from cloudfront distribution")

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
      enableECSManagedTags: true,
      healthCheck: {
        command: [ "CMD-SHELL", "curl -f http://localhost/ || exit 1" ],
        // the properties below are optional
        interval: Duration.minutes(1),
        retries: 3,
        startPeriod: Duration.minutes(1),
        timeout: Duration.seconds(30),
      },
      memoryLimitMiB: 2048, // Default is 512
      loadBalancerName: `${props.resourceNamePrefix}-lb`,
      propagateTags: PropagatedTagSource.SERVICE,
      protocol: ApplicationProtocol.HTTPS,
      protocolVersion: ApplicationProtocolVersion.HTTP2,
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
      logBucket: props.bucketLogs,
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
