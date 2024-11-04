import { FromCloudFormation } from "aws-cdk-lib/core/lib/helpers-internal";
import { DnsStack } from "./stacks/distributedLoadBalancedCustomDomainServer/dns";
import { SolutionStack } from "./stacks/distributedLoadBalancedCustomDomainServer/solution";
import { SubdomainsStack } from "./stacks/subdomains";

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

export {SolutionStack, SolutionStackProps} from "./stacks/distributedLoadBalancedCustomDomainServer/solution"

export function removeNonTextChars(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s]/g, '');
}

export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export {SubdomainsStack, SubdomainsStackProps, SubdomainSpec} from "./stacks/subdomains"



