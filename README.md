# infrastructure-blueprints
reusable solutions for infrastructure using aws-cdk

This repository publishes `@jtviegas/cdk-blueprints` to [npm registry](https://www.npmjs.com/package/@jtviegas/cdk-blueprints).

# usage

- install the library: `npm install @jtviegas/cdk-blueprints`

# constructs

## common properties interfaces

```
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
```

## BaseConstructs
![base](assets/base.png)

### constructor interface
```
export interface BaseConstructsProps extends CommonStackProps {
  readonly logsBucketOn?: boolean;
}
```
### properties
```
export interface IBaseConstructs {
  readonly key: IKey;
  readonly logGroup: ILogGroup;
  readonly logsBucket?: IBucket;
  readonly role: IRole;
  readonly vpc: IVpc;
  readonly getVpcLookupAttributes: Function;
}
```
### usage example
```
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
```
## Subdomains
![base](assets/subdomains.png)

### constructor interface
```
export interface SubdomainSpec {
  readonly name: string;
  readonly private?: boolean;
  readonly createCertificate?: boolean;
  readonly vpc?: VpcLookupAttributes
}

export interface SubdomainsProps extends CommonStackProps {
  readonly subdomains: SubdomainSpec[];
  readonly domain: {
    readonly name: string;
    readonly private?: boolean;
  }
}
```
### properties
```
export interface ISubdomains {
  readonly hostedZoneDomain: IHostedZone;
  readonly hostedZoneSubdomains: IHostedZone[]; 
}
```
### usage example
```
class SubdomainsStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SubdomainsProps, base: IBaseConstructs) {
    super(scope, id, props);

    // work out the subdomains vpc settings based on base constructs
    const subdomainspecs = []
    for(const subdomain of props.subdomains){
      subdomainspecs.push({...subdomain, vpc: base.getVpcLookupAttributes()})
    }
    const subdomainProps: SubdomainsProps ={
      ...props,
      subdomains: subdomainspecs
    }
    const subdomains = new Subdomains(this, `${id}-subdomains`, subdomainProps)
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const subdomainsProps: SubdomainsProps = {
  ...baseProps,
  env: {...environment, region: "us-east-1"},
  domain: {
    name: "site.com",
    private: false
  },
  subdomains: [
    { name: "ui.site.com", private: false, createCertificate: true}, 
    { name: "lb.site.com", private: false, createCertificate: false}
  ],
  stackName: "SubdomainsStack",
}

const subdomainsStack = new SubdomainsStack(app, "SubdomainsStack", subdomainsProps, baseStack.baseConstructs);

```


## DistributedService
![base](assets/distributedService.png)

### constructor interface
```
export interface DistributedServiceProps extends CommonStackProps {
  readonly domain: {
    readonly loadBalancer: string;
    readonly distribution: string;
  }
  readonly docker:{
    readonly imageUri?: string;
    readonly dockerfileDir?: string; // we assume Platform.LINUX_AMD64 by default
  }
  readonly capacity?: {
    readonly cpuUnits?: number; // default: 512
    readonly desiredCount?: number; // default: 1 
    readonly ephemeralStorageGiB?: number; default: 21
    readonly memoryLimitMiB?: number; // default: 1024
    readonly maxCountPercentageThreshold?: number; // default: 100
    readonly minCountPercentageThreshold?: number; // default: 0
  }
}
```
### properties
```
export interface IDistributedService {
  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly hostedZoneLoadBalancer: IHostedZone;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly distribution: Distribution;
}
```
### usage example
```
class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DistributedServiceProps, baseConstructs: IBaseConstructs) {
    super(scope, id, props);
    const service = new DistributedService(this, `${id}-service`, props, baseConstructs);
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const dsProps: DistributedServiceProps = {
  ...subdomainsProps,
  env: environment,
  domain: {
    distribution: "ui.site.com",
    loadBalancer: "lb.site.com"
  },
  docker: {
    imageUri: "strm/helloworld-http"
  },
  stackName: "ServiceStack",
}
new ServiceStack(app, "ServiceStack", dsProps, baseStack.baseConstructs)

```

## AppGwDistributedService
![base](assets/appGwDistributedService.png)

### constructor interface
```
export interface AppGwDistributedServiceProps extends CommonStackProps {
  readonly docker:{
    readonly imageUri?: string;
    readonly dockerfileDir?: string; // we assume Platform.LINUX_AMD64 by default
  }
  readonly capacity?: {
    readonly cpuUnits?: number; // default: 512
    readonly desiredCount?: number; // default: 1 
    readonly ephemeralStorageGiB?: number; default: 21
    readonly memoryLimitMiB?: number; // default: 1024
    readonly maxCountPercentageThreshold?: number; // default: 100
    readonly minCountPercentageThreshold?: number; // default: 0
  }
}
```
### properties
```
export interface IAppGwDistributedService {
  readonly cluster: Cluster;
  readonly taskDefinition: FargateTaskDefinition;
  readonly fargateService: ApplicationLoadBalancedFargateService;
  readonly api: RestApi;
  readonly baseConstructs: IBaseConstructs;
}
```
### usage example
```
class ServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppGwDistributedServiceProps) {
    super(scope, id, props);
    const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
    const service = new AppGwDistributedService(this, `${id}-service`, props, baseConstructs);
  }
}

const app = new cdk.App();
const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

const props: AppGwDistributedServiceProps = {
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
  stackName: "ServiceStack",
  docker: {
    imageUri: "strm/helloworld-http",
  }
}

new ServiceStack(app, "ServiceStack", props)
```



