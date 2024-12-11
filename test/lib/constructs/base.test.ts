import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, capitalizeFirstLetter, CommonStackProps, deriveAffix, deriveOutput, deriveParameter, deriveParameterPrefix, deriveResourceAffix, deriveResourceName, removeLeadingSlash, removeNonTextChars } from "../../../src";


describe("BaseConstructsStack", () => {
  test("constains the required constructs", () => {
    const app = new cdk.App();
    const testStack = new cdk.Stack(app, "TestStack");

    const props: CommonStackProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" },
      stackName: "TestStack",
    }

    const base = new BaseConstructs(testStack, "BaseConstructs", props)
    const template = Template.fromStack(testStack);
    // console.log("%o", template.toJSON())

    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
    });

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



