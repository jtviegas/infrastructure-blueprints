import { CfnOutput, Duration, RemovalPolicy, Size, Stack } from 'aws-cdk-lib';
import { IVpc, Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { DnsStackProps } from './dns';
import { deriveAffix, deriveOutput, deriveResourceName } from '../../constructs/commons';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';

export interface ServiceStackProps extends DnsStackProps {
  readonly dockerfileDir: string;
  readonly role: IRole;
  readonly vpc: IVpc;
  readonly key: Key;
  readonly logGroup: LogGroup;
  readonly bucketLogs: Bucket;
  readonly hostedZoneLoadBalancer: IHostedZone;
  readonly hostedZoneDistribution: IHostedZone;
  readonly certificateDistribution: Certificate;
}

export class ServiceStack extends Stack {

  readonly CLOUDFRONT_PREFIX_LIST: string = "pl-fab65393";

  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-image`, {
      directory: props.dockerfileDir,
      assetName: deriveResourceName(props, "image"),
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(props.role)

    // --- fargate service ---

    const ecsCluster = new Cluster(this, `${id}-cluster`, {
      vpc: props.vpc,
      clusterName: deriveResourceName(props, "cluster"),
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

    const taskDefinition = new FargateTaskDefinition(this, `${id}-taskDefinition`, {
      executionRole: props.role, // grants the ECS agent permission to call AWS APIs
      family: deriveAffix(props),
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: props.role, // grants containers in the task permission to call AWS APIs,
    });

    taskDefinition.addContainer(`${id}-taskDefinitionContainerSrv`, {
      image: ContainerImage.fromRegistry(containerImageApp.imageUri),
      containerName: deriveResourceName(props, "image", "srv"),
      logging: LogDrivers.awsLogs({
        streamPrefix: deriveResourceName(props, "srv"),
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

    const securityGroupApp = new SecurityGroup(this, `${id}-securityGroup`, {
      vpc: props.vpc,
      securityGroupName: deriveResourceName(props, "sg", "srv"),
    });
    securityGroupApp.addIngressRule(Peer.prefixList(this.CLOUDFRONT_PREFIX_LIST), 
      Port.allTcp(), "allow all tcp ingress from cloudfront distribution")

    const fargateService = new ApplicationLoadBalancedFargateService(this, `${id}-fargateService`, {
      assignPublicIp: false,
      cluster: ecsCluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: 512, // Default is 256
      desiredCount: 1, // Default is 1
      domainName: props.domainLoadBalancer,
      domainZone: props.hostedZoneLoadBalancer,
      enableECSManagedTags: true,
      healthCheck: {
        command: [ "CMD-SHELL", "curl -f http://localhost/ || exit 1" ],
        // the properties below are optional
        interval: Duration.minutes(1),
        retries: 3,
        startPeriod: Duration.minutes(1),
        timeout: Duration.seconds(30),
      },
      memoryLimitMiB: 2048, 
      loadBalancerName: deriveResourceName(props, "lb"),
      propagateTags: PropagatedTagSource.SERVICE,
      protocol: ApplicationProtocol.HTTPS,
      protocolVersion: ApplicationProtocolVersion.HTTP1,
      publicLoadBalancer: true,
      redirectHTTP: true,
      securityGroups: [securityGroupApp],
      serviceName: deriveResourceName(props, "fargate", "srv"),
      taskDefinition: taskDefinition,
      openListener: false,
    });
    fargateService.loadBalancer.addSecurityGroup(securityGroupApp)

    // ------- cloudfront distribution  -------

    const lbOriginApp = new HttpOrigin(props.domainLoadBalancer, {protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY})

    const distribution = new Distribution(this, `${id}-distribution`, {
      defaultBehavior: { 
        origin:  lbOriginApp, 
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        allowedMethods: AllowedMethods.ALLOW_ALL, 
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      certificate: props.certificateDistribution,
      domainNames: [props.domainDistribution],
      enableLogging: true,
      logBucket: props.bucketLogs,
      logIncludesCookies: true,
      logFilePrefix: deriveResourceName(props, "distribution"),
    });

    distribution.applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-distributionUrl`, { 
      value: `https://${distribution.distributionDomainName}`,
      exportName: deriveOutput(props, "distributionUrl") });

    const aRecordApp = new ARecord(this, `${id}-aRecord`, {
      zone: props.hostedZoneDistribution,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

  }
}
