import { Duration, Size, StackProps } from "aws-cdk-lib";
import { AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";


export interface DockerImageSpec {
  readonly apiImage: DockerImageAsset;
  readonly dockerfileDir: string; // we assume Platform.LINUX_AMD64 by default
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

export interface SSMParameterReaderProps {
  parameterName: string;
  region: string;
}

export interface AuthorizerSpec {
  readonly name: string;
  readonly lambda: string;
  readonly resultsCacheTtl?: Duration;
  readonly identitySources?: string[];
};

export interface LambdaResourceSpec {
  readonly name: string;
  readonly image: Partial<DockerImageSpec>;
  readonly imageTag?: string;
  readonly memory?: number;
  readonly storage?: Size;
  readonly timeout?: Duration;
};

export interface ApiResourceMethodSpec {
  readonly method: string;
  readonly lambda: string;
  readonly keyRequired?: boolean;
  readonly authorizationScopes?: string[];
  readonly authorizationType?: AuthorizationType;
  readonly authorizer?: string;
};

export interface ApiResourceSpec {
  readonly name?: string;
  readonly methods: ApiResourceMethodSpec[];
};

