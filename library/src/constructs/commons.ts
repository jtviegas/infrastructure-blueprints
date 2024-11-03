import { StackProps } from "aws-cdk-lib";
import { capitalizeFirstLetter, removeNonTextChars } from "..";

export interface SysEnv {
  readonly name: string;
  readonly region: string;
  readonly account: string;
}

export interface CommonStackProps extends StackProps {
  readonly env: SysEnv;
  readonly solution: string;
  readonly organisation: string;
  readonly department: string;
}

export const deriveParameterPrefix = (props: CommonStackProps): string => {
  return `${props.solution}/${props.env.name}`
}

export const deriveParameter = (props: CommonStackProps, name: string): string => {
  const region = removeNonTextChars(props.env.region);
  const key = removeNonTextChars(name);
  return `${deriveParameterPrefix(props)}/${region}/${key}`
}

export const deriveOutput = (props: CommonStackProps, name: string): string => {
  const region = removeNonTextChars(props.env.region);
  const key = removeNonTextChars(name);
  return `${props.solution}-${props.env.name}-${region}-${key}`
}

export const deriveAffix = (props: CommonStackProps): string => {
  const region = capitalizeFirstLetter(removeNonTextChars(props.env.region))
  const env = capitalizeFirstLetter(props.env.name)
  const solution = capitalizeFirstLetter(props.solution)
  return `${solution}${env}${region}`
}

export const deriveResourceName = (props: CommonStackProps, name: string, surname: string = ""): string => {
  const affix = deriveAffix(props);
  return `${affix}${capitalizeFirstLetter(name)}${capitalizeFirstLetter(surname)}`
}


