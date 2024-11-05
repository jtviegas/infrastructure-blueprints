import { CfnOutput, Duration, RemovalPolicy, Size, Stack } from 'aws-cdk-lib';
import { IVpc, Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { IRole } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { ARecord, IHostedZone, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { BaseConstructs, BaseConstructsProps } from '../constructs/base';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { deriveAffix, deriveOutput, deriveParameter, deriveResourceName, removeNonTextChars, SSMParameterReader } from '..';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CLOUDFRONT_PREFIX_LIST, DNS_RESOURCES_REGION } from '../commons/constants';

export interface DistributedLoadBalancedServiceStackProps extends BaseConstructsProps {
  readonly logsBucketOn: boolean;
  readonly domainLoadBalancer: string;
  readonly dockerfileDir: string;
  readonly domainDistribution: string;
  readonly capacity?: {
    readonly cpuUnits?: number; // default: 512, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#cpu
    readonly desiredCount?: number; // default: 1, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#desiredcount
    readonly ephemeralStorageGiB?: number; default: 21, // check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#ephemeralstoragegib
    readonly memoryLimitMiB?: number; // default: 1024, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#memorylimitmib
    readonly maxCountPercentageThreshold?: number; // default: 100, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#maxhealthypercent
    readonly minCountPercentageThreshold?: number; // default: 0, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#minhealthypercent
  }
}

export class DistributedLoadBalancedServiceStack extends Stack {

  constructor(scope: Construct, id: string, props: DistributedLoadBalancedServiceStackProps) {
    super(scope, id, props);

    const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)

    // // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-image`, {
      directory: props.dockerfileDir,
      assetName: deriveResourceName(props, "image"),
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(baseConstructs.role)

    // --- fargate service ---

    const ecsCluster = new Cluster(this, `${id}-cluster`, {
      vpc: baseConstructs.vpc,
      clusterName: deriveResourceName(props, "cluster"),
      containerInsights: true,
      enableFargateCapacityProviders: true,
      executeCommandConfiguration: {
        kmsKey: baseConstructs.key,
        logConfiguration: {
          cloudWatchLogGroup: baseConstructs.logGroup,
          cloudWatchEncryptionEnabled: true,
        },
        logging: ExecuteCommandLogging.OVERRIDE,
      },
    });

    const taskDefinition = new FargateTaskDefinition(this, `${id}-taskDefinition`, {
      executionRole: baseConstructs.role, // grants the ECS agent permission to call AWS APIs
      family: deriveAffix(props),
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: baseConstructs.role, // grants containers in the task permission to call AWS APIs,
    });

    taskDefinition.addContainer(`${id}-taskDefinitionContainerSrv`, {
      image: ContainerImage.fromRegistry(containerImageApp.imageUri),
      containerName: deriveResourceName(props, "image", "srv"),
      logging: LogDrivers.awsLogs({
        streamPrefix: deriveResourceName(props, "srv"),
        mode: AwsLogDriverMode.NON_BLOCKING,
        logGroup: baseConstructs.logGroup,
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
      vpc: baseConstructs.vpc,
      securityGroupName: deriveResourceName(props, "sg", "srv"),
    });
    securityGroupApp.addIngressRule(Peer.prefixList(CLOUDFRONT_PREFIX_LIST), 
      Port.allTcp(), "allow all tcp ingress from cloudfront distribution")

    const hostZoneIdLoadBalancer= new SSMParameterReader(this, `${id}-paramReaderHzIdLb`, {
      parameterName: deriveParameter(props, `${removeNonTextChars(props.domainLoadBalancer)}/hostedZoneId`),
      region: DNS_RESOURCES_REGION
    }).getParameterValue();

    const hostedZoneLoadBalancer = PublicHostedZone.fromHostedZoneAttributes(this, `${id}-hzLoadBalancer`, {
      hostedZoneId: hostZoneIdLoadBalancer,
      zoneName: props.domainLoadBalancer
    })

    const fargateService = new ApplicationLoadBalancedFargateService(this, `${id}-fargateService`, {
      assignPublicIp: false,
      cluster: ecsCluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: ((props.capacity !== undefined) && (props.capacity.cpuUnits !== undefined)) ? props.capacity.cpuUnits : 512,
      desiredCount: ((props.capacity !== undefined) && (props.capacity.desiredCount !== undefined)) ? props.capacity.desiredCount : 1,
      domainName: props.domainLoadBalancer,
      domainZone: hostedZoneLoadBalancer,
      enableECSManagedTags: true,
      ephemeralStorageGiB: ((props.capacity !== undefined) && (props.capacity.ephemeralStorageGiB !== undefined)) ? props.capacity.ephemeralStorageGiB : 21,
      healthCheck: {
        command: [ "CMD-SHELL", "curl -f http://localhost/ || exit 1" ],
        // the properties below are optional
        interval: Duration.minutes(1),
        retries: 3,
        startPeriod: Duration.minutes(1),
        timeout: Duration.seconds(30),
      },
      memoryLimitMiB: ((props.capacity !== undefined) && (props.capacity.memoryLimitMiB !== undefined)) ? props.capacity.memoryLimitMiB : 1024,
      maxHealthyPercent: ((props.capacity !== undefined) && (props.capacity.maxCountPercentageThreshold !== undefined)) ? props.capacity.maxCountPercentageThreshold : 100,
      minHealthyPercent: ((props.capacity !== undefined) && (props.capacity.minCountPercentageThreshold !== undefined)) ? props.capacity.minCountPercentageThreshold : 0,
      loadBalancerName: deriveResourceName(props, "lb"),
      propagateTags: PropagatedTagSource.SERVICE,
      protocol: ApplicationProtocol.HTTPS,
      protocolVersion: ApplicationProtocolVersion.HTTP1,
      publicLoadBalancer: false,
      redirectHTTP: true,
      serviceName: deriveResourceName(props, "fargate", "srv"),
      taskDefinition: taskDefinition,
      openListener: false,
    });
    //fargateService.loadBalancer.addSecurityGroup(securityGroupApp)

    // ------- cloudfront distribution  -------



  }
}
