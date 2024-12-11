import * as CustomResource from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { Arn, Stack, Duration } from "aws-cdk-lib";
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as fs from 'fs';
import { Code, DockerImageCode, DockerImageFunction, IFunction } from 'aws-cdk-lib/aws-lambda';
import { IBaseConstructs } from '../constructs/base';
import { IAuthorizer, RequestAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { AuthorizerSpec, CommonStackProps, LambdaResourceSpec, SSMParameterReaderProps } from './props';

export function removeNonTextChars(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s]/g, '');
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const deriveParameterPrefix = (props: CommonStackProps): string => {
  return `/${props.solution}/${props.env.name}`
}

export const deriveParameter = (props: CommonStackProps, name: string): string => {
  const key = removeNonTextChars(name);
  return `${deriveParameterPrefix(props)}/${key}`
}

export const toParameter = (props: CommonStackProps, ...name: string[]): string => {
  const prefix: string = deriveParameterPrefix(props);
  let result: string = prefix;
  for(const n of name){
    result += `/${removeNonTextChars(n)}`
  }
  return result
}

export const toResourceName = (props: CommonStackProps, ...name: string[]): string => {
  const prefix: string = deriveResourceAffix(props);
  let result: string = prefix;
  for(const n of name){
    result += `-${removeNonTextChars(n).toLowerCase()}`
  }
  return result
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
  return `${props.solution}-${region}`
}

export const deriveResourceName = (props: CommonStackProps, name: string, surname: string = ""): string => {
  const affix = deriveResourceAffix(props);
  return `${affix}-${name}${surname? "-" + surname : ""}`
}

export function removeLeadingSlash(value: string): string {
  return value.slice(0, 1) == '/' ? value.slice(1) : value;
}

export function read_cidrs(file: string): string[] {
  const result: string[] = [];
  const entries = JSON.parse(fs.readFileSync(file).toString())
  for(const entry of entries){
    result.push(entry.Cidr)
  }
  return result
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

export function spec2Authorizer(scope: Construct, id: string, baseConstructs: IBaseConstructs
  , functions: Map<string,IFunction>, spec: AuthorizerSpec): IAuthorizer {
  return new RequestAuthorizer(scope, `${id}-authorizer-${spec.name}`, {
    handler: functions.get(spec.lambda)!,
    resultsCacheTtl: spec.resultsCacheTtl === undefined ? Duration.hours(0) : spec.resultsCacheTtl,
    identitySources: spec.identitySources === undefined ? [] : spec.identitySources,
    assumeRole: baseConstructs.role,
    authorizerName: spec.name
  });
}

// export function lambdaSpec2DockerImageAsset(scope: Construct, id: string, spec: LambdaResourceSpec): DockerImageAsset {
//   if (spec.image.apiImage !== undefined){
//     return spec.image.apiImage!;
//   }
//   else {
//     Code.fromImageAsset(directory, props?)()
//     return new DockerImageAsset(scope, `${id}-image-${spec.name}`, {
//       directory: spec.image.dockerfileDir!,
//       platform: Platform.LINUX_AMD64,
//     });
//   }
// }

export function lambdaSpec2Function(scope: Construct, id: string, baseConstructs: IBaseConstructs, 
  props: CommonStackProps, spec: LambdaResourceSpec): IFunction {
  let result: DockerImageFunction;

  result = new DockerImageFunction(scope, `${id}-function-${spec.name}`, {
    code: DockerImageCode.fromImageAsset(spec.image.dockerfileDir, 
      {
      assetName: spec.name,
      platform: Platform.LINUX_AMD64,
      buildArgs: spec.image.buildArgs !== undefined ? spec.image.buildArgs : undefined
    }),
    functionName: deriveResourceName(props, spec.name),
    memorySize: spec.memory,
    ephemeralStorageSize: spec.storage,
    timeout: spec.timeout,
    logGroup: baseConstructs.logGroup,
    role: baseConstructs.role,
    vpc: baseConstructs.vpc
  });
  return result;
}
