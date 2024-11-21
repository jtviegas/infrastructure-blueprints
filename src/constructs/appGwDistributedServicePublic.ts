import { Duration, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging,
  FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AccessLogFormat, AuthorizationType, ConnectionType, Cors, HttpIntegration, LogGroupLogDestination, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { deriveAffix, deriveResourceName } from '../commons/utils';
import { IBaseConstructs } from './base';
import { AppGwDistributedServiceProps, IAppGwDistributedService } from './appGwDistributedService';


export class AppGwDistributedServicePublic extends Construct implements IAppGwDistributedService {

  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly api: RestApi;
  readonly baseConstructs: IBaseConstructs;

  constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id);

    this.baseConstructs = baseConstructs;

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
        name: "service"
      }]
    });

    const serviceSecurityGroupApp = new SecurityGroup(this, `${id}-securityGroup`, {
      vpc: baseConstructs.vpc,
      securityGroupName: deriveResourceName(props, "sg", "srv"),
    });
    serviceSecurityGroupApp.addIngressRule(Peer.anyIpv4(), 
      Port.allTcp(), "allow all tcp ingress")

    this.fargateService = new ApplicationLoadBalancedFargateService(this, `${id}-fargateService`, {
      assignPublicIp: false,
      cluster: this.cluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: ((props.capacity !== undefined) && (props.capacity.cpuUnits !== undefined)) ? props.capacity.cpuUnits : 512,
      desiredCount: ((props.capacity !== undefined) && (props.capacity.desiredCount !== undefined)) ? props.capacity.desiredCount : 1,
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
      protocol: ApplicationProtocol.HTTP,
      protocolVersion: ApplicationProtocolVersion.HTTP1,
      publicLoadBalancer: true,
      serviceName: deriveResourceName(props, "fargate", "srv"),
      taskDefinition: this.taskDefinition,
      openListener: false,
    });
    this.fargateService.loadBalancer.addSecurityGroup(serviceSecurityGroupApp)

    // ------- app gateway -------
    this.api = new RestApi(this, `${id}-api`, {
      restApiName: `${deriveAffix(props)}-api`,
      description: "API gateway",
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
      },
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(baseConstructs.logGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        })
      }
    });


    const ui_integration = new HttpIntegration( 
      `http://${this.fargateService.loadBalancer.loadBalancerDnsName}/`
       , {
      httpMethod: 'ANY',
      options: {
        connectionType: ConnectionType.INTERNET,
        passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      },
    });

    const ui_method_options = { apiKeyRequired: false, 
      authorizationType: AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            "method.response.header.Content-Type": true
          },
        },
      ],
    }

    const root_methods = this.api.root.addMethod('ANY', ui_integration, ui_method_options);
    this.api.root.addResource("{proxy+}").addMethod('ANY', ui_integration, ui_method_options)

    const api_plan = this.api.addUsagePlan(`${id}-usagePlan`, {
      name: `${props.solution}-ApiUsagePlan`,
      quota: {
        limit: 24000,
        period: Period.DAY
      },
      throttle: {
        rateLimit: 10,
        burstLimit: 2
      },
      apiStages: [{ stage: this.api.deploymentStage, api: this.api }]
    });
  }
}
