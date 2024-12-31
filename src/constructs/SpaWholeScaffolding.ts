import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { RestApiOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, S3OriginAccessControl, 
  Signing, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Cors, DomainName, IResource, LogGroupLogDestination, MethodLoggingLevel, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, IHostedZone, PublicHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';

import { removeNonTextChars, SSMParameterReader, toParameter, toResourceName } from '../commons/utils';
import { BaseConstructs, IBaseConstructs } from './base';
import { DNS_GLOBAL_RESOURCES_REGION } from '../commons/constants';
import { CommonStackProps } from '../commons/props';


export interface SpaWholeScaffoldingProps extends CommonStackProps {
  readonly cloudfront_cidrs: string[];
  readonly domain: {
    readonly name: string;
    readonly hostedZoneId: string;
    readonly certificateArn: string;
  },
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

export interface ISpaWholeScaffolding extends IBaseConstructs {
  readonly bucketSpa: IBucket;
  readonly resourceApi: IResource;
  readonly distribution: Distribution;
}

export class SpaWholeScaffolding extends BaseConstructs implements ISpaWholeScaffolding {

  readonly bucketSpa: IBucket;
  readonly resourceApi: IResource;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: SpaWholeScaffoldingProps) {
    super(scope, id, props);

    const hostedZone: IHostedZone = PublicHostedZone.fromHostedZoneAttributes(this, `hostedZoneDomain`, {
      hostedZoneId: props.domain.hostedZoneId,
      zoneName: props.domain.name
    });
    const certificate = Certificate.fromCertificateArn(this, `certificateDomain`, props.domain.certificateArn);

    // ------- spa bucket -------
    this.bucketSpa = new Bucket(this, `${id}BucketSpa`, {
      bucketName: toResourceName(props, "BucketSpa"),
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      encryption: BucketEncryption.KMS,
      encryptionKey: this.key,
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
        accessLogDestination: new LogGroupLogDestination(this.logGroup),
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
    const ApiSpaOrigin = new RestApiOrigin(restApi, {});

    this.distribution = new Distribution(this, `${id}Distribution`, {
      defaultBehavior: { origin: s3SpaOrigin },
      certificate: certificate,
      domainNames: [props.domain.name],
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
      logBucket: this.logsBucket,
    });
    const aRecordSubdomain = new ARecord(this, `${id}ARecordSubdomain`, {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

  }
}
