import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { RestApiOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, IDistribution, OriginRequestPolicy, S3OriginAccessControl, Signing, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { AccessLogFormat, Cors, LambdaIntegration, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { CommonStackProps, deriveAffix, deriveParameter, deriveResourceName, DockerImageSpec, removeNonTextChars, SSMParameterReader } from '../commons/utils';
import { IBaseConstructs } from './base';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';

/*
NOTES:
- don't forget to add the (parent) domain to the sys senv
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
- run the subdomain stack separately and before the service stack
*/

/*
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

*/

export interface AppGwDistributedSpaProps extends CommonStackProps {
  readonly docker: Partial<DockerImageSpec>;
  readonly cloudfront_cidrs: string[];
  readonly domain?: string;
}

export interface IAppGwDistributedSpa {
  readonly bucketSpa: IBucket;
  readonly api: RestApi;
  readonly distribution: IDistribution;
}

export class AppGwDistributedSpa extends Construct implements IAppGwDistributedSpa {

  readonly bucketSpa: IBucket;
  readonly api: RestApi;
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, baseConstructs: IBaseConstructs, props: AppGwDistributedSpaProps) {
    super(scope, id);

    if(baseConstructs.logsBucket === undefined){
      throw Error("base constructs must provide logs bucket");
    }

    // --- backend container image ---
    if((props.docker.dockerfileDir === undefined) && (props.docker.apiImage === undefined)){
      throw Error("must provide one of the docker arguments");
    }
    let apiImage: DockerImageAsset;
    if (props.docker.apiImage !== undefined){
      apiImage = props.docker.apiImage!;
    }
    else {
      apiImage = new DockerImageAsset(this, `${id}-apiImage`, {
        directory: props.docker.dockerfileDir!,
        platform: Platform.LINUX_AMD64,
      });
    }
    apiImage.repository.grantPullPush(baseConstructs.role);
    
     // ------- spa bucket -------
     this.bucketSpa = new Bucket(this, `${id}-bucketSpa`, {
      bucketName: deriveResourceName(props, "bucket-spa"),
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.KMS,
      encryptionKey: baseConstructs.key,
      enforceSSL: true,
      blockPublicAccess: new BlockPublicAccess({
        blockPublicPolicy: false
      }),
      publicReadAccess: true,
      cors: [
        {
          allowedMethods: [HttpMethods.GET],
          allowedOrigins: ['*'],
        }
      ]   
    });

    this.bucketSpa.addToResourcePolicy(
      new PolicyStatement({
        actions: ['s3:Get*', 's3:List*'],
        effect: Effect.ALLOW,
        resources: [this.bucketSpa.bucketArn],
        principals: [new AnyPrincipal()]
      }),
    )

    // Deploy a dummy webpage, it will be overwritten afterwards
    new BucketDeployment(this, `${id}-bucketSpaDeployment`, {
      sources: [Source.data('index.html', "<html><body>hello, this is a dummy SPA</body></html>")],
      destinationBucket: this.bucketSpa
    });

    // ------- backend function -------
    const functionBackend = new DockerImageFunction(this, `${id}-functionBackend`, {
      code: DockerImageCode.fromEcr(apiImage.repository, {tagOrDigest: apiImage.imageTag}),
      functionName: deriveResourceName(props, "backend"),
      memorySize: 10240,
      ephemeralStorageSize: Size.gibibytes(8),
      timeout: Duration.seconds(900),
      logGroup: baseConstructs.logGroup,
      role: baseConstructs.role,
      vpc: baseConstructs.vpc
    });

    // ------- app gateway -------
    this.api = new LambdaRestApi(this, `${id}-api`, {
      restApiName: `${deriveAffix(props)}-api`,
      handler: functionBackend,
      proxy: false,
      description: "api gateway",
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
      },
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(baseConstructs.logGroup),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        stageName: "prod",
        loggingLevel: MethodLoggingLevel.INFO,
      },
      policy: new PolicyDocument({
        // only allow access from the cloudfront distribution
        statements: [
          new PolicyStatement({
            principals: [new AnyPrincipal],
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            effect: Effect.ALLOW,
            conditions: {
              IpAddress: {
                "aws:SourceIp": props.cloudfront_cidrs
              }
            }
          })
        ]
      })
    });

    this.api.addUsagePlan(`${id}-usagePlan`, {
      name: `${deriveAffix(props)}-ApiUsagePlan`,
      quota: {
        limit: 24000,
        period: Period.DAY
      },
      throttle: {
        rateLimit: 10,
        burstLimit: 2
      },
      apiStages: [{ stage: this.api.deploymentStage, api: this.api }]
    });

    const api_resource = this.api.root.addResource('api');
    const api_method = api_resource.addMethod('GET', 
      new LambdaIntegration(functionBackend, {
        passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      }), {apiKeyRequired: false}
    );

    // ------- cloudfront distribution  -------
    
    let certificateDistribution = undefined;
    if(props.domain !== undefined){
      const certificateArnDistribution= new SSMParameterReader(this, `${id}-paramReaderCertArnDist`, {
        parameterName: deriveParameter(props, `${removeNonTextChars(props.domain)}/certificateArn`),
        region: DNS_GLOBAL_RESOURCES_REGION
      }).getParameterValue();
      certificateDistribution = Certificate.fromCertificateArn(this, `${id}-certificateDistribution`, certificateArnDistribution)
    }

    const s3SpaOriginAccessControl = new S3OriginAccessControl(this, 'MyOAC', {
      originAccessControlName: `${deriveAffix(props)}-spaOAC`, 
      signing: Signing.SIGV4_ALWAYS
    });

    const s3SpaOrigin = S3BucketOrigin.withOriginAccessControl(this.bucketSpa, s3SpaOriginAccessControl);
    const ApiSpaOrigin = new RestApiOrigin(this.api);

    this.distribution = new Distribution(this, `${id}-distribution`, {
      defaultBehavior: { origin:  s3SpaOrigin},
      certificate: certificateDistribution === undefined ? undefined : certificateDistribution,
      domainNames: props.domain === undefined ? undefined : [props.domain],
      additionalBehaviors: {
        '/api': {
          origin: ApiSpaOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: AllowedMethods.ALLOW_ALL,
        }
      },
      defaultRootObject: "index.html",
      enableIpv6: false,
      enableLogging: true,
      logIncludesCookies: true,
      logBucket: baseConstructs.logsBucket,
    });

    if(props.domain !== undefined){
      const hostZoneIdDistribution= new SSMParameterReader(this, `${id}-paramReaderHzIdDist`, {
        parameterName: deriveParameter(props, `${removeNonTextChars(props.domain)}/hostedZoneId`),
        region: DNS_GLOBAL_RESOURCES_REGION
      }).getParameterValue();
      const hostedZoneDistribution = PublicHostedZone.fromHostedZoneAttributes(this, `${id}-hzDistribution`, {
        hostedZoneId: hostZoneIdDistribution,
        zoneName: props.domain
      })
      const aRecordApp = new ARecord(this, `${id}-aRecord`, {
        zone: hostedZoneDistribution,
        target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      });
    }

  }
}
