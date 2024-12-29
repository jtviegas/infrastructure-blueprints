import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { IVpc, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AccountPrincipal, CompositePrincipal, Effect, IRole, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey, Key } from 'aws-cdk-lib/aws-kms';
import { ILogGroup, LogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket, IBucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { deriveResourceName } from '../commons/utils';
import { CommonStackProps } from '../commons/props';

/*
class BaseStack extends cdk.Stack {
  readonly baseConstructs: IBaseConstructs;

  constructor(scope: Construct, id: string, props: BaseConstructsProps) {
    super(scope, id, props);
    this.baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
  }
}

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

const baseStack = new BaseStack(app, "BaseStack", baseProps);
*/


export interface IBaseConstructs {
  readonly key: IKey;
  readonly logGroup: ILogGroup;
  readonly logsBucket: IBucket;
  readonly role: IRole;
  readonly vpc: IVpc;
}

export interface BaseConstructsLookup {
  readonly keyArn: string;
  readonly logGroupArn: string;
  readonly logsBucketArn: string;
  readonly roleArn: string;
  readonly vpcId: string;
}

export class BaseConstructs extends Construct implements IBaseConstructs {

  readonly key: Key;
  readonly logGroup: LogGroup;
  readonly logsBucket: Bucket;
  readonly role: Role;
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: CommonStackProps) {
    super(scope, id);

    // --- kms key ---
    this.key = new Key(this, `${id}BaseConstructsLogsKey`, {
      enableKeyRotation: true,
    });

    // --- logGroup ---
    this.logGroup = new LogGroup(this, `${id}BaseConstructsLogGroup`,
      {
        logGroupName: deriveResourceName(props, "base"),
        removalPolicy: RemovalPolicy.DESTROY,
      });

    // --- logs bucket ---
    this.logsBucket = new Bucket(this, `${id}BaseConstructsLogsBucket`, {
      bucketName: deriveResourceName(props, "base", "logs"),
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
        },
      ],
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
    });

    // --- solution role ---
    this.role = new Role(this, `${id}BaseConstructsRole`, {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
        new ServicePrincipal("lambda.amazonaws.com"),
        new ServicePrincipal("apigateway.amazonaws.com"),
        new AccountPrincipal(props.env.account)
      ),
      roleName: deriveResourceName(props, "base"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        )
      ]
    });
    this.role.addToPolicy(
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
          "secretsmanager:*",
          "ssm:*"
        ],
        resources: ["*"],
      }));

    // --- vpc ---

    this.vpc = new Vpc(this, `${id}BaseConstructsVpc`, {
      vpcName: deriveResourceName(props, "base"),
      subnetConfiguration: [
        {
          name: deriveResourceName(props, "base", "private"),
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: deriveResourceName(props, "base", "public"),
          subnetType: SubnetType.PUBLIC,
        }
      ]
    });

  }

  public static fromProps(scope: Construct, id: string, lookup: BaseConstructsLookup): IBaseConstructs {
    return {
      key: Key.fromKeyArn(scope, `${id}BaseConstructsKey`, lookup.keyArn),
      logGroup: LogGroup.fromLogGroupArn(scope, `${id}BaseConstructsLogGroup`, lookup.logGroupArn),
      logsBucket: Bucket.fromBucketArn(scope, `${id}BaseConstructsLogsBucket`, lookup.logsBucketArn),
      role: Role.fromRoleArn(scope, `${id}BaseConstructsRole`, lookup.roleArn),
      vpc: Vpc.fromLookup(scope, `${id}BaseConstructsVpc`, {vpcId: lookup.vpcId})
    }
  }

}
