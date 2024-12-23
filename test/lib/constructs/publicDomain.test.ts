const util = require("util")
import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import {
  PublicDomainProps,
  PublicDomain,
  CommonStackProps
} from "../../../src";


describe("TestStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const baseProps: CommonStackProps = {
      crossRegionReferences: true,
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "us-east-1", account: "123456" }
    }
    const testStack = new cdk.Stack(app, "TestStack", baseProps);
    
    const props: PublicDomainProps = {
      ...baseProps,
      name: "tgedr.com",
      accountIdsGuest: ["123", "456"],
    }

    const publicSubdomain = new PublicDomain(testStack, "PublicDomain", props);
    const template = Template.fromStack(testStack);

    console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::Route53::HostedZone", {
      Name: 'tgedr.com.'
    });

    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: '*.tgedr.com',
      ValidationMethod: 'DNS'
    });

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: 'abc-useast1-tgedrcom-contributor'
    });

})
})