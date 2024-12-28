import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, AppGwDistributedServiceProps, AppGwDistributedService, SpaSolutionScaffoldingProps, SpaSolutionScaffolding, SpaWholeScaffoldingProps, SpaWholeScaffolding } from "../../../src";
const util = require("util")

describe("SpaWholeScaffolding", () => {
  test("synthesizes the way we expect", () => {

    const app = new cdk.App();
    const props: SpaWholeScaffoldingProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456"},
      cloudfront_cidrs: ["1", "2"],
      domain: {
        name: "serious.site.com",
        hostedZoneId: "123456",
        certificateArn: "arn:aws:acm:us-east-1:123456:certificate/123456"
      }
    };

    const testStack = new cdk.Stack(app, "TestStack", props);
    const service = new SpaWholeScaffolding(testStack, "TestStack-service", props);
    const template = Template.fromStack(testStack);

    console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::EC2::VPC", {
      Tags: [ { Key: 'Name', Value: 'abc-eunorth1-base' } ]
    });

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: 'abc-eunorth1-bucketspa'
    });

    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
      Name: 'abc-eunorth1-apigw'
    });

    template.hasResourceProperties("AWS::ApiGateway::Stage", {
      StageName: 'prod'
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: 'api'
    });

    template.hasResourceProperties("AWS::ApiGateway::UsagePlan", {
      Quota: { Limit: 100000, Period: 'DAY' },
      Throttle: { BurstLimit: 8, RateLimit: 32 },
      UsagePlanName: 'abc-eunorth1-restapiusageplan'
    });

    template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: {
        Name: 'abc-eunorth1-s3spaoac',
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4'
      }
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: [ 'serious.site.com' ]
      }
    });
    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: 'serious.site.com.',
      Type: 'A'
    });
})
})