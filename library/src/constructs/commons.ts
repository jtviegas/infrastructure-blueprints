import { StackProps } from "aws-cdk-lib";


export interface SysEnv {
  readonly name: string;
  readonly region: string;
  readonly account: string;
}

export interface BaseStackProperties extends StackProps {
  readonly env: SysEnv;
  readonly solution: string;
  readonly organisation: string;
  readonly domain: string;
  readonly parameterPrefix: string;
  readonly resourceNamePrefix: string;
}
