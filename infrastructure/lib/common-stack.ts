import * as cdk from 'aws-cdk-lib';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { IVpc, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AccountPrincipal, CompositePrincipal, Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket, IBucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CommonProps } from './props-stack';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';


export interface CommonStackOutput {
  readonly role: Role;
  readonly vpc: Vpc;
  readonly key: Key;
  readonly bucketLogs: Bucket;
  readonly logGroup: LogGroup;
}

export class CommonStack extends cdk.Stack {
  readonly output: CommonStackOutput;

  constructor(scope: Construct, id: string, props: CommonProps) {
    super(scope, id, props);

    // --- common resources ---
    const kmsKey = new Key(this, `${id}-kmsKey`);
    new StringParameter(this, `${id}-paramKmsKeyArn`, {
      parameterName: `${props.parameterPrefix}/${props.outputKmsKeyArn}`,
      stringValue: kmsKey.keyArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputKmsKey`, {value: kmsKey.keyArn, exportName: props.outputKmsKeyArn});

    const logGroup = new LogGroup(this, `${id}-logGroup`, 
      { 
        logGroupName: `${props.domain}${props.solution}logGroup`, 
        removalPolicy: RemovalPolicy.DESTROY,
    });
    new StringParameter(this, `${id}-paramLogGroupArn`, {
      parameterName: `${props.parameterPrefix}/${props.outputLogGroupArn}`,
      stringValue: logGroup.logGroupArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputLogGroup`, {value: logGroup.logGroupArn, exportName: props.outputLogGroupArn});
    
    const teamAccount = new AccountPrincipal(props.env.account)

    // --- logs bucket ---
    const bucketLogs = new Bucket(this, `${id}-bucketLogs`, {
      bucketName: `${props.resourceNamePrefix}-bucket-logs`,
      versioned: false, // Versioning is not enabled since no data should be stored for more than 1 day
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1), // Automatically delete objects after 1 day
        },
      ],
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
    });
    new StringParameter(this, `${id}-paramBucketLogsArn`, {
      parameterName: `${props.parameterPrefix}/${props.outputBucketLogsArn}`,
      stringValue: bucketLogs.bucketArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputBucketLogs`, {value: bucketLogs.bucketArn, exportName: props.outputBucketLogsArn});

    // --- solution role ---

    const roleSolution = new Role(this, `${id}-roleSolution`, {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("ecs-tasks.amazonaws.com"),
        teamAccount
      ),
      roleName: `${props.resourceNamePrefix}`,
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
        resources: [`arn:aws:ssm:*:*:parameter${props.parameterPrefix}/*`],
      }));
    
    new StringParameter(this, `${id}-paramRoleArn`, {
      parameterName: `${props.parameterPrefix}/${props.outputRoleArn}`,
      stringValue: roleSolution.roleArn,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputRole`, {value: roleSolution.roleArn, exportName: props.outputRoleArn});

    // --- network ---

    const vpc = new Vpc(this, `${id}-vpc`, {
      vpcName: `${props.resourceNamePrefix}-vpc`,
      subnetConfiguration: [
        {
          name: `${props.resourceNamePrefix}-privateSubnet`,
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: `${props.resourceNamePrefix}-publicSubnet`,
          subnetType: SubnetType.PUBLIC,
        }
      ]
    });

    new StringParameter(this, `${id}-paramVpcName`, {
      parameterName: `${props.parameterPrefix}/${props.outputVpcName}`,
      stringValue: `${props.resourceNamePrefix}-vpc`,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputVpc`, {value: `${props.resourceNamePrefix}-vpc`, exportName: props.outputVpcName});

    new StringParameter(this, `${id}-paramVpcId`, {
      parameterName: `${props.parameterPrefix}/${props.outputVpcId}`,
      stringValue: vpc.vpcId,
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);
    new CfnOutput(this, `${id}-outputVpcId`, {value: vpc.vpcId, exportName: props.outputVpcId});

    this.output = {
      bucketLogs: bucketLogs,
      key: kmsKey,
      logGroup: logGroup,
      role: roleSolution,
      vpc: vpc
    }
  }
}
