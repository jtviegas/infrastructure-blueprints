const util = require("util")
import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import {
 PublicSubdomainProps,
  PublicSubdomain,
  CommonStackProps
} from "../../../src";


describe("SubdomainsStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const baseProps: CommonStackProps = {
      crossRegionReferences: true,
      organisation: "corp",
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "us-east-1", account: "123456", domain: {
        name: "site.com"
      } }
    }
    const testStack = new cdk.Stack(app, "TestStack", baseProps);
    
    const props: PublicSubdomainProps = {
      ...baseProps,
      name: "ui.site.com"
    }

    const publicSubdomain = new PublicSubdomain(testStack, "PublicSubdomain", props);
    const template = Template.fromStack(testStack);

    //console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::Route53::HostedZone", {
      Name: 'ui.site.com.'
    });

    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: '/abc/useast1/uisitecom/hostedZoneId'
    });

    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: 'ui.site.com.',
      Type: 'NS'
    });

    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: 'ui.site.com',
      ValidationMethod: 'DNS'
    });

    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: '/abc/useast1/uisitecom/certificateArn'
    });

})
})