import { Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { RestApiOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, IDistribution, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { AccessLogFormat, Cors, LambdaIntegration, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { CommonStackProps, deriveAffix, deriveResourceName, DockerImageSpec } from '../commons/utils';
import { IBaseConstructs } from './base';



export interface AppGwDistributedSpaProps extends CommonStackProps {
  readonly docker: Partial<DockerImageSpec>;
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
      // handler: Handler.FROM_IMAGE,
      // runtime: Runtime.FROM_IMAGE,
      functionName: deriveResourceName(props, "backend"),
      memorySize: 10240,
      ephemeralStorageSize: Size.gibibytes(8),
      timeout: Duration.seconds(900),
      logGroup: baseConstructs.logGroup,
      role: baseConstructs.role,
    });


    // ------- app gateway -------
    this.api = new LambdaRestApi(this, `${id}-api`, {
      restApiName: `${deriveAffix(props)}-api`,
      handler: functionBackend,
      proxy: false,
      description: "API gateway",
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
      }
    });

    this.api.addUsagePlan(`${id}-usagePlan`, {
      name: `${deriveAffix(props)}-ApiUsagePlan`,
      quota: {
        limit: 100,
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
    const s3SpaOrigin = S3BucketOrigin.withOriginAccessControl(this.bucketSpa);
    const ApiSpaOrigin = new RestApiOrigin(this.api);

    this.distribution = new Distribution(this, `${id}-distribution`, {
      defaultBehavior: { origin:  s3SpaOrigin},
      additionalBehaviors: {
        '/api': {
          origin: ApiSpaOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: AllowedMethods.ALLOW_ALL
        }
      },
      defaultRootObject: "index.html",
      enableLogging: true,
      logIncludesCookies: true
    });

  }
}
