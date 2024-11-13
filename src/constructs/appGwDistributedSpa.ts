import { CfnOutput, Duration, RemovalPolicy, Size } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { AccessLogFormat, Cors, LambdaIntegration, LambdaRestApi, LogGroupLogDestination, MethodLoggingLevel, PassthroughBehavior, Period, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { CommonStackProps, deriveAffix, deriveOutput, deriveParameter, deriveResourceName, IBaseConstructs } from '..';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, IBucket } from 'aws-cdk-lib/aws-s3';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Code, Handler, Runtime, Function } from 'aws-cdk-lib/aws-lambda';
import { IRepository, Repository } from 'aws-cdk-lib/aws-ecr';
import { RestApiOrigin, S3StaticWebsiteOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { AllowedMethods, CachePolicy, Distribution, IDistribution, OriginRequestPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { ParameterDataType, ParameterTier, StringParameter } from 'aws-cdk-lib/aws-ssm';


export interface AppGwDistributedSpaProps extends CommonStackProps {
  readonly docker:{
    readonly imageRepository?: string;
    readonly dockerfileDir?: string; // we assume Platform.LINUX_AMD64 by default
  }
}

export interface IAppGwDistributedSpa {
  readonly baseConstructs: IBaseConstructs;
  readonly bucketSpa: IBucket;
  readonly api: RestApi;
  readonly distribution: IDistribution;
}

export class AppGwDistributedSpa extends Construct implements IAppGwDistributedSpa {

  readonly baseConstructs: IBaseConstructs;
  readonly bucketSpa: IBucket;
  readonly api: RestApi;
  readonly distribution: IDistribution;

  constructor(scope: Construct, id: string, props: AppGwDistributedSpaProps, baseConstructs: IBaseConstructs) {
    super(scope, id);

    this.baseConstructs = baseConstructs;

    // // --- backend container image ---
    if((props.docker.dockerfileDir === undefined) && (props.docker.imageRepository === undefined)){
      throw Error("must provide one of the docker arguments");
    }
    let dockerImageRepository: IRepository;
    if(props.docker.dockerfileDir !== undefined){
      const imageAsset: DockerImageAsset = new DockerImageAsset(this, `${id}-imageAsset`, {
        directory: props.docker.dockerfileDir,
        platform: Platform.LINUX_AMD64,
      });
      imageAsset.repository.grantPullPush(baseConstructs.role)
      dockerImageRepository = imageAsset.repository
    }
    else {
      dockerImageRepository = Repository.fromRepositoryName(this, `${id}-imageRepository`, props.docker.imageRepository!)
    }

     // ------- spa bucket -------
     this.bucketSpa = new Bucket(this, `${id}-bucketSpa`, {
      bucketName: deriveResourceName(props, "bucket-spa"),
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.KMS,
      encryptionKey: baseConstructs.key,
      enforceSSL: true,
      /*
      websiteIndexDocument: 'index.html',
      */
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
    const functionBackend = new Function(this, `${id}-functionBackend`, {
      code: Code.fromEcrImage(dockerImageRepository),
      handler: Handler.FROM_IMAGE,
      runtime: Runtime.FROM_IMAGE,
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
    const s3SpaOrigin = new S3StaticWebsiteOrigin(this.bucketSpa);
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

    const url =  `https://${this.distribution.distributionDomainName}`;

    new StringParameter(this, `${id}-paramUrl`, {
      parameterName: deriveParameter(props, "url"),
      stringValue: url ,
      description: 'solution url',
      tier: ParameterTier.STANDARD,
      dataType: ParameterDataType.TEXT
    }).applyRemovalPolicy(RemovalPolicy.DESTROY);

    new CfnOutput(this,  `${id}-outputUrl`, { value: url, exportName: deriveOutput(props, "url")});

  }
}
