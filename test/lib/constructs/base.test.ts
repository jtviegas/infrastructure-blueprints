import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, BaseConstructsProps, capitalizeFirstLetter, CommonStackProps, deriveAffix, deriveOutput, deriveParameter, deriveParameterPrefix, deriveResourceAffix, deriveResourceName, removeLeadingSlash, removeNonTextChars } from "../../../src";

const props: BaseConstructsProps = {
  organisation: "corp",
  department: "main",
  solution: "abc",
  env: { name: "dev", region: "eu-north-1", account: "123456" },
  stackName: "TestStack",
  keyAlias: "alias/CommonKey"
}

describe("BaseConstructsStack", () => {
  test("constains the required constructs", () => {
    const app = new cdk.App();
    const testStack = new cdk.Stack(app, "TestStack", props);

    const base = new BaseConstructs(testStack, "BaseConstructs", props)
    const template = Template.fromStack(testStack);
    console.log("%o", template.toJSON())

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: 'abc-eunorth1-base'
    });

    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: 'abc-eunorth1-base-logs'
    });

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: 'abc-eunorth1-base'
    });

    template.hasResourceProperties("AWS::EC2::VPC", {
      Tags: [ { Key: 'Name', Value: 'abc-eunorth1-base' } ]
    });

})
})



