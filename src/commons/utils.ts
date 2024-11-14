import * as CustomResource from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { StackProps, Arn, Stack } from "aws-cdk-lib";
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';

export function removeNonTextChars(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s]/g, '');
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export interface DockerImageSpec {
  apiImage: DockerImageAsset;
  dockerfileDir: string; // we assume Platform.LINUX_AMD64 by default
}

export interface VpcLookupAttributes {
  readonly vpcId: string;
  readonly vpcName: string;
}

export interface SysEnv {
  readonly name: string;
  readonly region: string;
  readonly account: string;
  readonly domain?: {
    name: string;
    private: boolean;
  },
  readonly vpc?: VpcLookupAttributes;
}

export interface CommonStackProps extends StackProps {
  readonly env: SysEnv;
  readonly organisation: string;
  readonly department: string;
  readonly solution: string;
}

export const deriveParameterPrefix = (props: CommonStackProps): string => {
  return `/${props.solution}/${props.env.name}`
}

export const deriveParameter = (props: CommonStackProps, name: string): string => {
  const key = removeNonTextChars(name);
  return `${deriveParameterPrefix(props)}/${key}`
}

export const deriveOutput = (props: CommonStackProps, name: string): string => {
  const key = removeNonTextChars(name);
  return `${props.solution}-${props.env.name}-${key}`
}

export const deriveAffix = (props: CommonStackProps): string => {
  const region = capitalizeFirstLetter(removeNonTextChars(props.env.region))
  const env = capitalizeFirstLetter(props.env.name)
  const solution = capitalizeFirstLetter(props.solution)
  return `${solution}${env}${region}`
}

export const deriveResourceAffix = (props: CommonStackProps): string => {
  const region = removeNonTextChars(props.env.region)
  return `${props.solution}-${props.env.name}-${region}`
}

export const deriveResourceName = (props: CommonStackProps, name: string, surname: string = ""): string => {
  const affix = deriveResourceAffix(props);
  return `${affix}-${name}${surname? "-" + surname : ""}`
}

export function removeLeadingSlash(value: string): string {
  return value.slice(0, 1) == '/' ? value.slice(1) : value;
}

export interface SSMParameterReaderProps {
  parameterName: string;
  region: string;
}


export class SSMParameterReader extends CustomResource.AwsCustomResource {
  constructor(scope: Construct, name: string, props: SSMParameterReaderProps) {
    const { parameterName, region } = props;

    const ssmAwsSdkCall: CustomResource.AwsSdkCall = {
      service: 'SSM',
      action: 'getParameter',
      parameters: {
        Name: parameterName,
      },
      region,
      physicalResourceId: CustomResource.PhysicalResourceId.of(Date.now().toString()),

    };

    const ssmCrPolicy = CustomResource.AwsCustomResourcePolicy.fromSdkCalls({
      resources: [
        Arn.format(
          {
            service: 'ssm',
            region: props.region,
            resource: 'parameter',
            resourceName: removeLeadingSlash(parameterName),
          },
          Stack.of(scope),
        ),
      ],
    });

    super(scope, name, { onUpdate: ssmAwsSdkCall, policy: ssmCrPolicy });
  }

  public getParameterValue(): string {
    return this.getResponseField('Parameter.Value').toString();
  }
}