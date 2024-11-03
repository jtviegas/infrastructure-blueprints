import * as cdk from 'aws-cdk-lib';
import { CfnOutput, NestedStack, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { IVpc, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AccountPrincipal, CompositePrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';
import { CommonStackProps, deriveOutput, deriveParameter, deriveParameterPrefix, deriveResourceName } from '../constructs/commons';



export interface VpcSpec {
  readonly id: string;
  readonly name: string;
}

export interface BaseStackProps extends CommonStackProps {
  readonly logsBucketOn: boolean;
  readonly vpcSpec?: VpcSpec;
}

export class BaseStack extends Stack {

  readonly key: Key;
  readonly logGroup: LogGroup;
  readonly logsBucket?: Bucket;
  readonly role: Role;
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // --- common resources ---

    // --- kms key ---
    this.key = new Key(this, `${id}-key`, {
      enableKeyRotation: true,
    });
    new StringParameter(this, `${id}-paramKeyArn`, {
      parameterName: deriveParameter(props, "BaseKeyArn"),
      stringValue: this.key.keyArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputBaseKeyArn`, {value: this.key.keyArn, exportName: deriveOutput(props, "BaseKeyArn")});

    // --- logGroup ---
    this.logGroup = new LogGroup(this, `${id}-logGroup`, 
      { 
        logGroupName: deriveResourceName(props, "base"), 
        removalPolicy: RemovalPolicy.DESTROY,
    });
    new StringParameter(this, `${id}-paramLogGroupArn`, {
      parameterName: deriveParameter(props, "BaseLogGroupArn"),
      stringValue: this.logGroup.logGroupArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputLogGroupArn`, {value: this.logGroup.logGroupArn, exportName: deriveOutput(props, "BaseLogGroupArn")});
    

    // --- logs bucket ---
    if (props.logsBucketOn){
      this.logsBucket = new Bucket(this, `${id}-bucketLogs`, {
        bucketName: deriveResourceName(props, "base", "logs"),
        versioned: false, 
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        lifecycleRules: [
          {
            expiration: cdk.Duration.days(7),
          },
        ],
        objectOwnership: ObjectOwnership.OBJECT_WRITER,
      });
      new StringParameter(this, `${id}-paramBucketLogsArn`, {
        parameterName: deriveParameter(props, "BaseBucketLogsArn"),
        stringValue: this.logsBucket.bucketArn,
        tier: ParameterTier.STANDARD,
        dataType: ParameterDataType.TEXT
      }).applyRemovalPolicy(RemovalPolicy.DESTROY);
      new CfnOutput(this, `${id}-outputBucketLogsArn`, {value: this.logsBucket.bucketArn, exportName: deriveOutput(props, "BaseBucketLogsArn")});
    }


    // --- solution role ---
    this.role = new Role(this, `${id}-role`, {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
        new AccountPrincipal(props.env.account)
      ),
      roleName: deriveResourceName(props, "base"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
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
        ],
        resources: ["*"],
      }));
      this.role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:*"],
        resources: [`arn:aws:ssm:*:*:parameter${deriveParameterPrefix(props)}/*`],
      }));
    
    new StringParameter(this, `${id}-paramRoleArn`, {
      parameterName: deriveParameter(props, "BaseRoleArn"),
      stringValue: this.role.roleArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputRole`, {value: this.role.roleArn, exportName: deriveOutput(props, "BaseRoleArn")});


    // --- vpc ---

    if (props.vpcSpec === undefined){
      this.vpc = new Vpc(this, `${id}-vpc`, {
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
    else {
      this.vpc = Vpc.fromLookup(this, `${id}-vpc`, {
        vpcId: props.vpcSpec.id,
        vpcName: props.vpcSpec.name
      })
    }

    new StringParameter(this, `${id}-paramVpcName`, {
      parameterName: deriveParameter(props, "BaseVpcName"),
      stringValue: props.vpcSpec === undefined ? deriveResourceName(props, "base"): props.vpcSpec.name,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputVpcName`, {
      value: props.vpcSpec === undefined ? deriveResourceName(props, "base"): props.vpcSpec.name, 
      exportName: deriveOutput(props, "BaseVpcName")});

    new StringParameter(this, `${id}-paramVpcId`, {
      parameterName: deriveParameter(props, "BaseVpcId"),
      stringValue: this.vpc.vpcId,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputVpcId`, {
      value: this.vpc.vpcId, 
      exportName: deriveOutput(props, "BaseVpcId")});
  }
}
