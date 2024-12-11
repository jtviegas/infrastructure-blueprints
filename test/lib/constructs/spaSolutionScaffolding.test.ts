import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, AppGwDistributedServiceProps, AppGwDistributedService, SpaSolutionScaffoldingProps, SpaSolutionScaffolding } from "../../../src";
const util = require("util")

describe("SpaSolutionScaffolding", () => {
  test("synthesizes the way we expect", () => {

    const app = new cdk.App();
    const props: SpaSolutionScaffoldingProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456", domain: {"name": "jtviegas.com"}},
      cloudfront_cidrs: ["1", "2"],
      subdomain: "serious.site.com"
    };

    const testStack = new cdk.Stack(app, "TestStack", props);
    const base = new BaseConstructs(testStack, "TestStack-baseconstructs", props);
    const service = new SpaSolutionScaffolding(testStack, "TestStack-service", base, props);
    const template = Template.fromStack(testStack);

    // console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

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