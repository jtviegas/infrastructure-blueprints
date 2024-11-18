import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import {BaseConstructs, DistributedService, DistributedServiceProps, BaseConstructsProps, CLOUDFRONT_PREFIX_LIST, AppGwDistributedServiceProps, AppGwDistributedService, AppGwDistributedSpa, AppGwDistributedSpaProps} from "../../../src";
const path = require("path")
const util = require("util")

describe("AppGwDistributedSpaStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();
    const testStack = new cdk.Stack(app, "TestStack");

    const baseProps: BaseConstructsProps = {
      logsBucketOn: true,
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456", domain: {name: "site.com", private: false} }
    }
    const props: AppGwDistributedSpaProps = {
      ...baseProps,
      docker: {
        dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
      },
      cloudfront_cidrs: ["10.0.0.0/24"],
      domain: "justit.site.com"
    }
    const base = new BaseConstructs(testStack, "baseconstructs", baseProps)
    const service = new AppGwDistributedSpa(testStack, "service", base, props);
    const template = Template.fromStack(testStack);

    console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: 'abc-dev-eunorth1-bucket-spa'
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: 'api',
    });

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: 'abc-dev-eunorth1-backend',
      MemorySize: 10240,
      Timeout: 900
    });

    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      SecurityGroupEgress:[
        {CidrIp: '0.0.0.0/0',
          Description: 'Allow all outbound traffic by default'}
      ]
    });

    template.hasResourceProperties("AWS::ApiGateway::RestApi", {
      Name: 'AbcDevEunorth1-api',
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        HttpVersion: 'http2',
      }
    });

    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Type: 'A'
    });

})
})