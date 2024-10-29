import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestPolicy, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { LoadBalancerV2Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AccountPrincipal, CompositePrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key, KeySpec, KeyUsage } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { HostedZone, NsRecord, PublicHostedZone } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import path = require('path');


export interface SysEnv {
  readonly name: string;
  readonly region?: string;
  readonly account: string;
}

export interface SolutionProps extends cdk.StackProps {
  readonly env: SysEnv;
  readonly solution: string;
  readonly organisation: string;
  readonly domain: string;
  readonly appImage: string;
  readonly dnsSubDomain: string;
  readonly dnsParentDomain: string;
}

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SolutionProps) {
    super(scope, id, props);

    // --- common resources ---
    const parameterPrefix = `/${props.solution}/${props.env.name}/${props.env.region}`
    const namePrefix = `${props.domain}-${props.solution}`
    const kmsKey = new Key(this, `${id}-kmsKey`);
    const logGroup = new LogGroup(this, `${id}-logGroup`, { logGroupName: `${namePrefix}-logGroup`, removalPolicy: RemovalPolicy.DESTROY });
    const teamAccount = new AccountPrincipal(props.env.account)

    const cfnConfTags = []
    for (const key in props.tags) {
      cfnConfTags.push({ key: key, value: props.tags[key] })
    }

    // --- solution role ---

    const roleSolution = new Role(this, `${id}-roleSolution`, {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
        teamAccount
      ),
      roleName: `${namePrefix}`,
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        )
      ]
    });
    roleSolution.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "cloudwatch:*",
          "ec2:*",
          "glue:*",
          "iam:ListRolePolicies",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "logs:*",
          "s3:*",
          "s3-object-lambda:*",
          "execute-api:Invoke",
          "ecs:*",
          "kms:*",
          "route53:*",
        ],
        resources: ["*"],
      }));
    roleSolution.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:*"],
        resources: [`arn:aws:ssm:*:*:parameter${parameterPrefix}/*`],
      }));

    // --- network ---

    const vpc = new Vpc(this, `${id}-vpc`, {
      vpcName: `${namePrefix}-vpc`,
      subnetConfiguration: [
        {
          name: `${namePrefix}-privateSubnet`,
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: `${namePrefix}-publicSubnet`,
          subnetType: SubnetType.PUBLIC,
        }
      ]
    });

    // --- dns ---

    const dnsHostedZoneAppSubDomain = new PublicHostedZone(this, `${id}-dnsHostedZoneAppSubDomain`, {
      zoneName: props.dnsSubDomain,
      //queryLogsLogGroupArn: logGroup.logGroupArn
    });

    const dnsHostedZoneAppParentDomain = HostedZone.fromLookup(this, `${id}-dnsHostedZoneAppParentDomain`, {domainName: props.dnsParentDomain, privateZone: false});
    const dnsNsRecordAppSubDomain = new NsRecord(this, `${id}-dnsNsRecordAppSubDomain`, {
      zone: dnsHostedZoneAppParentDomain,
      recordName: props.dnsSubDomain,
      values: dnsHostedZoneAppSubDomain.hostedZoneNameServers!,
      ttl: Duration.seconds(172800),
    });

    // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-containerImageApp`, {
      directory: path.join(__dirname, '../../app'),
      assetName: props.appImage,
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(roleSolution)

    // --- fargate service ---

    const ecsCluster = new Cluster(this, `${id}-ecsCluster`, {
      vpc: vpc,
      clusterName: `${namePrefix}-cluster`,
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
      executionRole: roleSolution, // grants the ECS agent permission to call AWS APIs
      family: `${props.solution}-app`,
      runtimePlatform: {
        operatingSystemFamily: OperatingSystemFamily.LINUX,
        cpuArchitecture: CpuArchitecture.X86_64,
      },
      taskRole: roleSolution, // grants containers in the task permission to call AWS APIs,
    });

    taskDefinitionApp.addContainer(`${id}-taskDefinitionContainerApp`, {
      image: ContainerImage.fromRegistry(containerImageApp.imageUri),
      containerName: `${namePrefix}-app`,
      logging: LogDrivers.awsLogs({
        streamPrefix: `${namePrefix}-app`,
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

    const securityGroupAppHttp80 = new SecurityGroup(this, `${id}-securityGroupApp`, {
      vpc: vpc,
      securityGroupName: `${namePrefix}-sgApp`,
    });
    securityGroupAppHttp80.addIngressRule(Peer.anyIpv4(), Port.allTcp(), "allow all tcp ingress")

    const fargateServiceApp = new ApplicationLoadBalancedFargateService(this, `${id}-fargateServiceApp`, {
      assignPublicIp: false,
      cluster: ecsCluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: 512, // Default is 256
      desiredCount: 1, // Default is 1
      domainName: props.dnsSubDomain,
      domainZone: dnsHostedZoneAppSubDomain,
      memoryLimitMiB: 2048, // Default is 512
      loadBalancerName: `${namePrefix}-lb`,
      propagateTags: PropagatedTagSource.SERVICE,
      protocol: ApplicationProtocol.HTTPS,
      publicLoadBalancer: true,
      redirectHTTP: true,
      securityGroups: [securityGroupAppHttp80],
      serviceName: `${namePrefix}-app`,
      taskDefinition: taskDefinitionApp,
    });

    // ------- cloudfront distribution  -------

    const lbOriginApp = new LoadBalancerV2Origin(fargateServiceApp.loadBalancer, {
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      keepaliveTimeout: Duration.seconds(30),
    });

    const distributionApp = new Distribution(this, `${id}-distributionApp`, {
      defaultBehavior: { 
        origin:  lbOriginApp, 
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        allowedMethods: AllowedMethods.ALLOW_ALL, 
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
      },
      enableLogging: true,

    });

    new CfnOutput(this, "distributionUrl", { value: `https://${distributionApp.distributionDomainName}` });


  }
}
