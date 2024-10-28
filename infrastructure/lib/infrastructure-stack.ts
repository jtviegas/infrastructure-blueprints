import * as cdk from 'aws-cdk-lib';
import { CfnOutput, RemovalPolicy, Size } from 'aws-cdk-lib';
import { CfnCertificateAuthority, CfnPermission } from 'aws-cdk-lib/aws-acmpca';
import { IpAddresses, Peer, Port, PrivateSubnet, PublicSubnet, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AppProtocol, AwsLogDriverMode, Cluster, ContainerImage, CpuArchitecture, ExecuteCommandLogging, FargateTaskDefinition, LogDrivers, OperatingSystemFamily, PropagatedTagSource, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { AccountPrincipal, CompositePrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
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
  readonly vpcCidr: string;
  readonly vpcPrivateSubnetCidr: string;
  readonly vpcPrivateSubnetAz: string;
  readonly vpcPublicSubnetCidr: string;
  readonly vpcPublicSubnetAz: string;
  readonly outputAppImageUri: string;
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
      cfnConfTags.push({key: key, value: props.tags[key]})
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

    // --- container image ---

    const containerImageApp = new DockerImageAsset(this, `${id}-containerImageApp`, {
      directory: path.join(__dirname, '../../app'),
      assetName: props.appImage,
      platform: Platform.LINUX_AMD64,
    });
    containerImageApp.repository.grantPullPush(roleSolution)

    new StringParameter(this, `${id}-paramAppImageUri`, {
      parameterName: `${parameterPrefix}/${props.outputAppImageUri}`,
      stringValue: containerImageApp.imageUri,
      description: 'app service url',
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

    new CfnOutput(this, props.outputAppImageUri, { value: containerImageApp.imageUri });

    // --- certificate authority ---

    const certificateAuthority = new CfnCertificateAuthority(this, `${id}-certificateAuthority`, {
      type: 'ROOT',
      keyAlgorithm: 'RSA_2048',
      signingAlgorithm: 'SHA256WITHRSA',
      subject: {
        commonName: 'jtviegas.com',
        country: 'DK',
        organization: 'tgedr',
        organizationalUnit: 'it',
        // distinguishedNameQualifier: 'string',
        // state: 'string',
        // serialNumber: 'string',
        locality: 'Copenhagen',
        // title: 'string',
        // surname: 'string',
        // givenName: 'string',
        // initials: 'DG',
        // pseudonym: 'string',
        // generationQualifier: 'DBG',
      },
      tags: cfnConfTags
    });

    const certificateAuthorityPermission = new CfnPermission(this, `${id}-certificateAuthorityPermission`, {
      actions: ['IssueCertificate', 'GetCertificate', 'ListPermissions'],
      certificateAuthorityArn: certificateAuthority.attrArn,
      principal: 'acm.amazonaws.com',
    });


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

    const securityGroupAppHttp80 = new SecurityGroup(this, `${id}-securityGroupAppHttp80`, {
      vpc: vpc,
      securityGroupName: `${namePrefix}-appHttp80`,
    });
    securityGroupAppHttp80.addIngressRule(Peer.anyIpv4(), Port.allTcp(), "allow ingress in port 80")

    const fargateServiceApp = new ApplicationLoadBalancedFargateService(this, `${id}-fargateServiceApp`, {
      assignPublicIp: false,
      cluster: ecsCluster,
      circuitBreaker: {
        enable: true,
        rollback: true
      },
      cpu: 512, // Default is 256
      desiredCount: 1, // Default is 1
      memoryLimitMiB: 2048, // Default is 512
      loadBalancerName: `${props.solution}-${props.env.name}-lb`,
      propagateTags: PropagatedTagSource.SERVICE,
      publicLoadBalancer: true,
      serviceName: `${props.solution}-ui`,
      taskDefinition: taskDefinitionApp,
      securityGroups: [securityGroupAppHttp80],
    });

  }
}
