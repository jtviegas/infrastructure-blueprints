import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { ARecord, IHostedZone, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging,
  FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CLOUDFRONT_PREFIX_LIST, DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { deriveAffix, deriveResourceName, SSMParameterReader, toParameter } from '../commons/utils';
import { IBaseConstructs } from './base';
import { CommonStackProps } from '../commons/props';

export interface DistributedServiceProps extends CommonStackProps {
  readonly domain: {
    readonly loadBalancer: string;
    readonly distribution: string;
  }
  readonly docker:{
    readonly imageUri?: string;
    readonly dockerfileDir?: string; // we assume Platform.LINUX_AMD64 by default
  }
  readonly capacity?: {
    readonly cpuUnits?: number; // default: 512, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#cpu
    readonly desiredCount?: number; // default: 1, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#desiredcount
    readonly ephemeralStorageGiB?: number; default: 21, // check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#ephemeralstoragegib
    readonly memoryLimitMiB?: number; // default: 1024, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#memorylimitmib
    readonly maxCountPercentageThreshold?: number; // default: 100, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#maxhealthypercent
    readonly minCountPercentageThreshold?: number; // default: 0, check: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs_patterns.ApplicationLoadBalancedFargateService.html#minhealthypercent
  }
}

export interface IDistributedService {
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly distribution: Distribution;
}

export class DistributedService extends Construct implements IDistributedService {

  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: DistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id);

    // ------- certificates and hosted zones -------
    const certificateArnDistribution = new SSMParameterReader(this, `${id}ParamReaderCertArnDist`, {
      parameterName: toParameter(props, props.domain.distribution, "certificateArn"),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const certificateDistribution = Certificate.fromCertificateArn(this, `${id}CertificateLb`, certificateArnDistribution);
    const hostZoneIdDist = new SSMParameterReader(this, `${id}ParamReaderHostedZoneIdDist`, {
      parameterName: toParameter(props, props.domain.distribution, "hostedZoneId"),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const hostedZoneDist: IHostedZone = PublicHostedZone.fromHostedZoneAttributes(this, `${id}HostedZoneDist`, {
      hostedZoneId: hostZoneIdDist,
      zoneName: props.domain.distribution
    });
    const hostZoneIdLb = new SSMParameterReader(this, `${id}ParamReaderHostedZoneIdLb`, {
      parameterName: toParameter(props, props.domain.loadBalancer, "hostedZoneId"),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const hostedZoneLb: IHostedZone = PublicHostedZone.fromHostedZoneAttributes(this, `${id}HostedZoneLb`, {
      hostedZoneId: hostZoneIdLb,
      zoneName: props.domain.loadBalancer
    });

    // // --- container image ---
    if((props.docker.dockerfileDir === undefined) && (props.docker.imageUri === undefined)){
      throw Error("must provide one of the docker arguments");
    }
    let dockerImageUri: string;
    if(props.docker.dockerfileDir !== undefined){
      const imageAsset: DockerImageAsset = new DockerImageAsset(this, `${id}-image`, {
        directory: props.docker.dockerfileDir,
        platform: Platform.LINUX_AMD64,
      });
      imageAsset.repository.grantPullPush(baseConstructs.role)
      dockerImageUri = imageAsset.imageUri
    }
    else {
      dockerImageUri = props.docker.imageUri!
    }

    // --- fargate service ---
    this.cluster = new Cluster(this, `${id}-cluster`, {
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

    this.taskDefinition = new FargateTaskDefinition(this, `${id}-taskDefinition`, {
      executionRole: baseConstructs.role, // grants the ECS agent permission to call AWS APIs
      family: deriveAffix(props),
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: baseConstructs.role, // grants containers in the task permission to call AWS APIs,
    });

    this.taskDefinition.addContainer(`${id}-taskDefinitionContainerSrv`, {
      image: ContainerImage.fromRegistry(dockerImageUri),
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

    this.fargateService = new ApplicationLoadBalancedFargateService(this, `${id}-fargateService`, {
      assignPublicIp: false,
      cluster: this.cluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: ((props.capacity !== undefined) && (props.capacity.cpuUnits !== undefined)) ? props.capacity.cpuUnits : 512,
      desiredCount: ((props.capacity !== undefined) && (props.capacity.desiredCount !== undefined)) ? props.capacity.desiredCount : 1,
      domainName: props.domain.loadBalancer,
      domainZone: hostedZoneLb,
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
      publicLoadBalancer: true,
      redirectHTTP: true,
      serviceName: deriveResourceName(props, "fargate", "srv"),
      taskDefinition: this.taskDefinition,
      openListener: false,
    });
    this.fargateService.loadBalancer.addSecurityGroup(securityGroupApp)

    // ------- cloudfront distribution  -------



    const lbOriginApp = new HttpOrigin(props.domain.loadBalancer, {protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY})

    this.distribution = new Distribution(this, `${id}-distribution`, {
      defaultBehavior: { 
        origin:  lbOriginApp, 
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        allowedMethods: AllowedMethods.ALLOW_ALL, 
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      certificate: certificateDistribution,
      domainNames: [props.domain.distribution],
      enableLogging: true,
      logBucket: baseConstructs.logsBucket,
      logIncludesCookies: true,
      logFilePrefix: deriveResourceName(props, "distribution"),
    });
    this.distribution.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const aRecordApp = new ARecord(this, `${id}-aRecord`, {
      zone: hostedZoneDist,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

  }
}
