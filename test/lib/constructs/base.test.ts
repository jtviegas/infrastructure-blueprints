import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, BaseConstructsProps, capitalizeFirstLetter, deriveAffix, deriveOutput, deriveParameter, deriveParameterPrefix, deriveResourceAffix, deriveResourceName, removeLeadingSlash, removeNonTextChars } from "../../../src";


describe("base constructs", () => {
  test("constains the required constructs", () => {
    const app = new cdk.App();
    const testStack = new cdk.Stack(app, "TestStack");

    const props: BaseConstructsProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" },
      stackName: "TestStack",
      logsBucketOn: false
    }

    const base = new BaseConstructs(testStack, "TestStack-constructs", props)
    const template = Template.fromStack(testStack);
    //console.log("%o", template.toJSON())

    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
    });

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: 'abc-dev-eunorth1-base'
    });

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: 'abc-dev-eunorth1-base'
    });

    template.hasResourceProperties("AWS::EC2::VPC", {
      Tags: [ { Key: 'Name', Value: 'abc-dev-eunorth1-base' } ]
    });

})
})



