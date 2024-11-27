import { Duration, Size } from 'aws-cdk-lib';
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging,
  FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol
} from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol, ApplicationProtocolVersion, NetworkListenerAction, NetworkLoadBalancer, NetworkTargetGroup, Protocol as LbProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AccessLogFormat, AuthorizationType, ConnectionType, Cors, HttpIntegration, Integration, IntegrationType, LogGroupLogDestination, PassthroughBehavior, Period, ProxyResource, RestApi, VpcLink } from 'aws-cdk-lib/aws-apigateway';
import { AlbListenerTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { CommonStackProps, deriveAffix, deriveResourceName } from '../commons/utils';
import { IBaseConstructs } from './base';


/*
export interface ServiceStackProps extends AppGwDistributedServiceProps {
  readonly logsBucketOn: boolean;
}

  class ServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ServiceStackProps) {
      super(scope, id, props);
      const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
      const service = new AppGwDistributedService(this, `${id}-service`, props, baseConstructs);
    }
  }
  
  const app = new cdk.App();
  const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]
  
  const props: ServiceStackProps = {
    logsBucketOn: true,
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
    stackName: "ServiceStack",
    docker: {
      imageUri: "strm/helloworld-http",
      // dockerfileDir: path.join(__dirname, "../../resources/docker/streamlit-frontend")
    }
  }
  
  new ServiceStack(app, "ServiceStack", props);
*/

export interface AppGwDistributedServiceProps extends CommonStackProps {

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

export interface IAppGwDistributedService {
  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly api: RestApi;
  readonly baseConstructs: IBaseConstructs;
}

export class AppGwDistributedService extends Construct implements IAppGwDistributedService {

  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly api: RestApi;
  readonly baseConstructs: IBaseConstructs;

  constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id);

    if(baseConstructs.logsBucket === undefined){
      throw Error("must provide bucket for logs in base construct");
    }
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
    serviceSecurityGroupApp.addIngressRule(Peer.ipv4(baseConstructs.vpc.vpcCidrBlock), 
      Port.allTcp(), "allow all tcp ingress from private net")

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
      publicLoadBalancer: false,
      serviceName: deriveResourceName(props, "fargate", "srv"),
      taskDefinition: this.taskDefinition,
      openListener: false,
    });
    this.fargateService.loadBalancer.addSecurityGroup(serviceSecurityGroupApp);
    this.fargateService.loadBalancer.logAccessLogs(baseConstructs.logsBucket!, "lb");

    // --- vpc link ---
    
    //  the private network load balancer
    const nlbVpc = new NetworkLoadBalancer(this, `${id}-vpcNlb`, {
       vpc: baseConstructs.vpc,
    });

    // vpclink to the private network load balancer
    const vpcLink2Nlb = new VpcLink(this, `${id}-vpcLink`, {
      description: "link to the private vpc",
      targets: [nlbVpc],
      vpcLinkName: `${props.solution}-uiVpcLink`
    });
    
    // target group related to fargate service app load balancer in the private network
    const targetGroupAppLb = new NetworkTargetGroup(this, `${id}-targetGroup4UiAppLb`, {
      port: 80,
      vpc: baseConstructs.vpc,
      targets: [new AlbListenerTarget(this.fargateService.listener)]
    });

    // nlb listener forwarding to the target group related to the fargate service app load balancer
    const nlbListenerVpc = nlbVpc.addListener(`${id}-vpcNlbListener`, {
      port: 80,
      protocol: LbProtocol.TCP,
      defaultAction: NetworkListenerAction.forward([targetGroupAppLb])
    });

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

    const defaultIntegration = new Integration({
      type: IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: ConnectionType.VPC_LINK,
        vpcLink: vpcLink2Nlb,
        passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy"
        }
      },
    });

    const defaultMethodOptions = {
      apiKeyRequired: false, 
      authorizationType: AuthorizationType.NONE,
      requestParameters: {
        "method.request.path.proxy": true
      }
    };
    const proxyResource = new ProxyResource(this, `${id}-proxyResource`, {
      parent: this.api.root,
      anyMethod: false
    });
    proxyResource.addMethod("ANY", defaultIntegration, defaultMethodOptions);

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
