import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { RestApiOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, S3OriginAccessControl, 
  Signing, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Cors, IResource, LogGroupLogDestination, MethodLoggingLevel, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { SSMParameterReader, toParameter, toResourceName } from '../commons/utils';
import { IBaseConstructs } from './base';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, IHostedZone, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CommonStackProps } from '../commons/props';


export interface SpaSolutionScaffoldingProps extends CommonStackProps {
  readonly cloudfront_cidrs: string[];
  readonly subdomain: string;
  readonly apiUsagePlan?: {
    quota?: {
      limit: number,
      period: Period
    },
    throttle?: {
      rateLimit: number,
      burstLimit: number
    }
  }
}

export interface ISpaSolutionScaffolding {
  readonly bucketSpa: IBucket;
  readonly resourceApi: IResource;
}

export class SpaSolutionScaffolding extends Construct implements ISpaSolutionScaffolding {

  readonly bucketSpa: IBucket;
  readonly resourceApi: IResource;

  constructor(scope: Construct, id: string, baseConstructs: IBaseConstructs, props: SpaSolutionScaffoldingProps) {
    super(scope, id);

    const certificateArn = new SSMParameterReader(this, `${id}ParamReaderCertArn`, {
      parameterName: toParameter(props, props.subdomain, "certificateArn"),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const certificate = Certificate.fromCertificateArn(this, `${id}Certificate`, certificateArn)

    // ------- spa bucket -------
    this.bucketSpa = new Bucket(this, `${id}BucketSpa`, {
      bucketName: toResourceName(props, "BucketSpa"),
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
    new BucketDeployment(this, `${id}SpaDeployment`, {
      sources: [Source.data('index.html', "<html><body>hello, this is a dummy SPA</body></html>")],
      destinationBucket: this.bucketSpa
    });

    // ------- app gateway -------
    const restApi: RestApi = new RestApi(this, `${id}RestApi`, {
      restApiName: toResourceName(props, "apigw"),
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

    restApi.addUsagePlan(`${id}RestApiUsagePlan`, {
      name: toResourceName(props, "RestApiUsagePlan"),
      quota: {
        limit: props.apiUsagePlan?.quota?.limit ? props.apiUsagePlan?.quota?.limit : 100000,
        period: props.apiUsagePlan?.quota?.period ? props.apiUsagePlan?.quota?.period : Period.DAY
      },
      throttle: {
        rateLimit: props.apiUsagePlan?.throttle?.rateLimit ? props.apiUsagePlan?.throttle?.rateLimit : 32,
        burstLimit: props.apiUsagePlan?.throttle?.burstLimit ? props.apiUsagePlan?.throttle?.burstLimit : 8
      },
      apiStages: [{ stage: restApi.deploymentStage, api: restApi }]
    });

    this.resourceApi = restApi.root.addResource('api');


    // ------- cloudfront distribution  -------

    const s3SpaOriginAccessControl = new S3OriginAccessControl(this, `${id}S3SpaOAC`, {
      originAccessControlName: toResourceName(props, "S3SpaOAC"),
      signing: Signing.SIGV4_ALWAYS
    });
    const s3SpaOrigin = S3BucketOrigin.withOriginAccessControl(this.bucketSpa, s3SpaOriginAccessControl);
    const ApiSpaOrigin = new RestApiOrigin(restApi);

    const distribution: Distribution = new Distribution(this, `${id}Distribution`, {
      defaultBehavior: { origin: s3SpaOrigin },
      certificate: certificate,
      domainNames: [props.subdomain],
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

    const hostZoneId = new SSMParameterReader(this, `${id}ParamReaderHostedZoneId`, {
      parameterName: toParameter(props, props.subdomain, "hostedZoneId"),
      region: DNS_GLOBAL_RESOURCES_REGION
    }).getParameterValue();
    const hostedZone: IHostedZone = PublicHostedZone.fromHostedZoneAttributes(this, `${id}HostedZone`, {
      hostedZoneId: hostZoneId,
      zoneName: props.subdomain
    })
    const aRecordSubdomain = new ARecord(this, `${id}ARecordSubdomain`, {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
    });

  }
}
