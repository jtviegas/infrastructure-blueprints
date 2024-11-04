import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { BaseConstructs, BaseConstructsProps, capitalizeFirstLetter, deriveAffix, deriveOutput, deriveParameter, deriveParameterPrefix, deriveResourceAffix, deriveResourceName, removeLeadingSlash, removeNonTextChars } from "../../src";


describe("base constructs", () => {
  test("constains the required constructs", () => {
    const app = new cdk.App();

    // // Since the StateMachineStack consumes resources from a separate stack
    // // (cross-stack references), we create a stack for our SNS topics to live
    // // in here. These topics can then be passed to the StateMachineStack later,
    // // creating a cross-stack reference.
    const testStack = new cdk.Stack(app, "TestStack");

    const props: BaseConstructsProps = {
      crossRegionReferences: true,
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "eu-north-1", account: "123456" },
      stackName: "TestStack",
      logsBucketOn: false
    }

    const base = new BaseConstructs(testStack, "TestStack-constructs", props)
    const template = Template.fromStack(testStack);
    console.log("%o", template.toJSON())

    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
    });

    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: 'abc-dev-eunorth1-base'
    });

})
})



