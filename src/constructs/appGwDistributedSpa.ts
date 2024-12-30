import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { RestApiOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, IDistribution, OriginRequestPolicy, S3OriginAccessControl, Signing, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { AuthorizationType, Cors, IAuthorizer, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { deriveAffix, deriveParameter, deriveResourceName, lambdaSpec2Function, removeNonTextChars, spec2Authorizer, SSMParameterReader } from '../commons/utils';
import { IBaseConstructs } from './base';
import { CLOUDFRONT_PREFIX_LIST_NAME, DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { ApiResourceSpec, AuthorizerSpec, CommonStackProps, DockerImageSpec, LambdaResourceSpec } from '../commons/props';
import { PrefixListFinder } from '../commons/prefixListFinder';


export interface AppGwDistributedSpaProps extends CommonStackProps {
  readonly cloudfront_cidrs: string[];
  readonly domain?: string;
  readonly lambdas: LambdaResourceSpec[];
  readonly authorizers?: AuthorizerSpec[];
  readonly resources: ApiResourceSpec[];
  usagePlan?: {
    quota?: {
      limit: number,
      period: Period
    },
    throttle?: {
      rateLimit: number,
      burstLimit: number
    }
  },
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
  readonly functions: Map<string, IFunction> = new Map<string, IFunction>();
  readonly authorizers: Map<string, IAuthorizer> = new Map<string, IAuthorizer>();

  constructor(scope: Construct, id: string, baseConstructs: IBaseConstructs, props: AppGwDistributedSpaProps) {
    super(scope, id);

    if (baseConstructs.logsBucket === undefined) {
      throw Error("base constructs must provide logs bucket");
    }

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

    // ------- backend functions -------
    for (const lambda of props.lambdas) {
      this.functions.set(lambda.name, lambdaSpec2Function(this, id, baseConstructs, props, lambda));
    }

    // ------- authorizers -------
    if(props.authorizers !== undefined){
      for (const authorizer of props.authorizers) {
        this.authorizers.set(authorizer.name, spec2Authorizer(this, id, baseConstructs, this.functions, authorizer));
      }
    }

    // ------- app gateway -------
    this.api = new RestApi(this, `${id}-api`, {
      restApiName: `${deriveAffix(props)}-api`,
      description: "api gateway",
      defaultCorsPreflightOptions: { allowOrigins: Cors.ALL_ORIGINS },
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new LogGroupLogDestination(baseConstructs.logGroup),
        cacheDataEncrypted: false,
        cachingEnabled: false,
        clientCertificateId: undefined,
        dataTraceEnabled: true,
        loggingLevel: MethodLoggingLevel.INFO,
        stageName: "prod",
        tracingEnabled: true,
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
      name: `${deriveAffix(props)}-apiUsagePlan`,
      quota: {
        limit: props.usagePlan?.quota?.limit ? props.usagePlan?.quota?.limit : 100000,
        period: props.usagePlan?.quota?.period ? props.usagePlan?.quota?.period : Period.DAY
      },
      throttle: {
        rateLimit: props.usagePlan?.throttle?.rateLimit ? props.usagePlan?.throttle?.rateLimit : 32,
        burstLimit: props.usagePlan?.throttle?.burstLimit ? props.usagePlan?.throttle?.burstLimit : 8
      },
      apiStages: [{ stage: this.api.deploymentStage, api: this.api, }]
    });

    const api_resource = this.api.root.addResource('api');

    for (const resource of props.resources) {
      const parent_resource = (resource.name === undefined ? api_resource : api_resource.addResource(resource.name));
      for (const method of resource.methods) {

        parent_resource.addMethod(method.method,
          new LambdaIntegration(this.functions.get(method.lambda)!, {
            passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
          }), {
          apiKeyRequired: method.keyRequired,
          authorizer: method.authorizer !== undefined ? this.authorizers.get(method.authorizer) : undefined,
          authorizationType: method.authorizationType === undefined ? AuthorizationType.NONE : method.authorizationType,
          authorizationScopes: method.authorizationScopes === undefined ? [] : method.authorizationScopes,
        }
        );
      }
    }

    // ------- cloudfront distribution  -------

    let certificateDistribution = undefined;
    if (props.domain !== undefined) {
      const certificateArnDistribution = new SSMParameterReader(this, `${id}-paramReaderCertArnDist`, {
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
      defaultBehavior: { origin: s3SpaOrigin },
      certificate: certificateDistribution === undefined ? undefined : certificateDistribution,
      domainNames: props.domain === undefined ? undefined : [props.domain],
      additionalBehaviors: {
        '/api/*': {
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

    if (props.domain !== undefined) {
      const hostZoneIdDistribution = new SSMParameterReader(this, `${id}-paramReaderHzIdDist`, {
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
