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

    const props: AppGwDistributedSpaProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" },
      docker: {
        dockerfileDir: path.join(__dirname, "../../resources/docker/hellosrv")
      }
    }
    const base = new BaseConstructs(testStack, "baseconstructs", props)
    const service = new AppGwDistributedSpa(testStack, "service", props, base);
    const template = Template.fromStack(testStack);

    console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: 'abc-dev-eunorth1-bucket-spa'
    });

    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: 'abc-dev-eunorth1-backend',
      MemorySize: 10240
    });

    template.hasResourceProperties("AWS::ApiGateway::Resource", {
      PathPart: 'api',
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        HttpVersion: 'http2',
      }
    });

})
})