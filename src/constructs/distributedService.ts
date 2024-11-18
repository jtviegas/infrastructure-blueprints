import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { ARecord, IHostedZone, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, 
  FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CLOUDFRONT_PREFIX_LIST, DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { CommonStackProps, deriveAffix, deriveParameter, deriveResourceName, removeNonTextChars, SSMParameterReader } from '../commons/utils';
import { IBaseConstructs } from './base';


/*
--- USAGE ---

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

*/

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
  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly hostedZoneLoadBalancer: IHostedZone;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly distribution: Distribution;
}

export class DistributedService extends Construct implements IDistributedService {

  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly hostedZoneLoadBalancer: IHostedZone;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: DistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id);

    if(baseConstructs.logsBucket === undefined){
      throw Error("base constructs must include logs bucket");
    }

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

    const hostZoneIdLoadBalancer= new SSMParameterReader(this, `${id}-paramReaderHzIdLb`, {
      parameterName: deriveParameter(props, `${removeNonTextChars(props.domain.loadBalancer)}/hostedZoneId`),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();

    this.hostedZoneLoadBalancer = PublicHostedZone.fromHostedZoneAttributes(this, `${id}-hzLoadBalancer`, {
      hostedZoneId: hostZoneIdLoadBalancer,
      zoneName: props.domain.loadBalancer
    });

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
      domainZone: this.hostedZoneLoadBalancer,
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

    const certificateArnDistribution= new SSMParameterReader(this, `${id}-paramReaderCertArnDist`, {
      parameterName: deriveParameter(props, `${removeNonTextChars(props.domain.distribution)}/certificateArn`),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const certificateDistribution = Certificate.fromCertificateArn(this, `${id}-certificateDistribution`, certificateArnDistribution)

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

    // new CfnOutput(this, `${id}-distributionUrl`, { 
    //   value: `https://${this.distribution.distributionDomainName}`,
    //   exportName: deriveOutput(props, "distributionUrl") });
    
    const hostZoneIdDistribution= new SSMParameterReader(this, `${id}-paramReaderHzIdDist`, {
      parameterName: deriveParameter(props, `${removeNonTextChars(props.domain.distribution)}/hostedZoneId`),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();

    const hostedZoneDistribution = PublicHostedZone.fromHostedZoneAttributes(this, `${id}-hzDistribution`, {
      hostedZoneId: hostZoneIdDistribution,
      zoneName: props.domain.distribution
    })
    const aRecordApp = new ARecord(this, `${id}-aRecord`, {
      zone: hostedZoneDistribution,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

  }
}
