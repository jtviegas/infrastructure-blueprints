export { SysEnv
  , CommonStackProps 
  , deriveParameterPrefix
  , deriveParameter
  , deriveOutput
  , deriveAffix
  , deriveResourceName
} from "./constructs/commons";

export { VpcSpec
  , BaseStackProps
  , BaseStack
 } from "./stacks/base"

export function removeNonTextChars(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s]/g, '');
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}




