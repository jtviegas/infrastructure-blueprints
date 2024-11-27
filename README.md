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
![subdomains](assets/subdomains.png)

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
![DistributedService](assets/distributedService.png)

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
![AppGwDistributedService](assets/appGwDistributedService.png)

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
export interface ServiceStackProps extends AppGwDistributedServiceProps {
  readonly logsBucketOn: boolean;
}

  class ServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ServiceStackProps) {
      super(scope, id, props);
      const baseConstructs = new BaseConstructs(this, `${id}-baseConstructs`, props)
      const service = new AppGwDistributedService(this, `${id}-service`, props, baseConstructs);
    }
  }
  
  const app = new cdk.App();
  const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]
  
  const props: ServiceStackProps = {
    logsBucketOn: true,
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
      // dockerfileDir: path.join(__dirname, "../../resources/docker/streamlit-frontend")
    }
  }
  
  new ServiceStack(app, "ServiceStack", props);
```

## AppGwDistributedSpa
![AppGwDistributedSpa](assets/appGwDistributedSpa.png)

### constructor interface
```
export interface DockerImageSpec {
  apiImage: DockerImageAsset;
  dockerfileDir: string; // we assume Platform.LINUX_AMD64 by default
}

export interface AppGwDistributedSpaProps extends CommonStackProps {
  readonly docker: Partial<DockerImageSpec>;
  readonly cloudfront_cidrs: string[];
  readonly domain?: string;
}
```
### properties
```
export interface IAppGwDistributedSpa {
  readonly bucketSpa: IBucket;
  readonly api: RestApi;
  readonly distribution: IDistribution;
}
```
### usage example

- if you want the solution to be distributed with a custom domain:

  - add the (parent) domain to the sys senv
    ```
      ...
      "environment": {
        "dev": {
          "account": "041651352119",
          "region": "eu-north-1",
          "name": "dev",
          "domain": {
            "name": "site.com",
            "private": false
          }
        },
      ...
    ```
  - add `AppGwDistributedSpaProps` `domain` property to the constructor defining the subdomain where you want the solution to be accessible from
  - run the subdomain stack separately before, as we need the subdomain and its certificate already created once we deploy the spa stack
- define the stacks

  ```
  class SubdomainsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SubdomainsProps) {
      super(scope, id, props);
      const subdomains = new Subdomains(this, `${id}-subdomains`, props)
    }
  }

  interface SpaStackProps extends AppGwDistributedSpaProps {
    readonly logsBucketOn: boolean;
    readonly subdomains: SubdomainSpec[];
  }

  class SpaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SpaStackProps) {
      super(scope, id, props);

      const baseConstructs: IBaseConstructs = new BaseConstructs(this, `${id}-base`, props);
      const service = new AppGwDistributedSpa(this, `${id}-spa`, baseConstructs, props);

      const url: string =  `https://${service.distribution.distributionDomainName}`;
      new CfnOutput(this,  `${id}-outputDistributionUrl`, { value: url, 
        exportName: process.env.OUTPUT_DISTRIBUTION_URL});
      new CfnOutput(this,  `${id}-outputDistributionId`, { value: service.distribution.distributionId, 
        exportName: process.env.OUTPUT_DISTRIBUTION_ID});
      new CfnOutput(this,  `${id}-outputBucketSpa`, { value: service.bucketSpa.bucketName, 
        exportName: process.env.OUTPUT_BUCKET_SPA});
    }
  }
  ```
- create the cloudfront cidr's list
  ```
  ./helper.sh get_cloudfront_cidr
  ```
- deploy the stacks:
  ```
  const app = new cdk.App();
  const environment = (app.node.tryGetContext("environment"))[(process.env.ENVIRONMENT || 'dev')]

  const props: SpaStackProps = {
    logsBucketOn: true,
    cloudfront_cidrs: read_cidrs(path.join(__dirname, "../cloudfront_cidr.json")),
    crossRegionReferences: true,
    organisation: process.env.ORGANISATION!,
    department: process.env.DEPARTMENT!,
    solution: process.env.SOLUTION!,
    env: environment,
    tags: {
      organisation: process.env.ORGANISATION!,
      department: process.env.DEPARTMENT!,
      solution: process.env.SOLUTION!,
      environment: environment.name,
    },
    stackName: process.env.STACK!,
    docker: {
      dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
    },
    subdomains: [
      {
        name: "dev.site.com",
        createCertificate: true,
        private: false
      }
    ]
  }

  new SubdomainsStack(app, process.env.STACK_SUBDOMAINS!, 
    {
      ...props, 
      env: {...props.env, region: DNS_GLOBAL_RESOURCES_REGION},
      stackName: process.env.STACK_SUBDOMAINS!
  });
  new SpaStack(app, process.env.STACK!, {...props, domain: props.subdomains[0].name})
  ```





