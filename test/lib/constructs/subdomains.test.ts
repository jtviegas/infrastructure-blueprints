const util = require("util")
import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import {BaseConstructs, DistributedService, DistributedServiceProps, BaseConstructsProps, CLOUDFRONT_PREFIX_LIST, 
  Subdomains, SubdomainsProps} from "../../../src";


describe("StateMachineStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();

    const baseProps: BaseConstructsProps = {
      crossRegionReferences: true,
      organisation: "corp",
      logsBucketOn: false,
      department: "main",
      solution: "abc",
      env: { name: "dev", region: "us-east-1", account: "123456" }
    }
    const testStack = new cdk.Stack(app, "TestStack", baseProps);
    const baseConstructs = new BaseConstructs(testStack, "TestStack-baseconstructs", baseProps)
    
    const props: SubdomainsProps = {
      ...baseProps,
      domain: {
        name: "jtviegas.com",
        private: false
      },
      subdomains: [
        { name: "ui.site.com", private: false, createCertificate: true, 
          vpc: baseConstructs.getVpcLookupAttributes()}, 
        { name: "lb.site.com", private: false, createCertificate: false, 
          vpc: baseConstructs.getVpcLookupAttributes()}
      ]
    }

    const subdomains = new Subdomains(testStack, "TestStack-subdomains", props);
    const template = Template.fromStack(testStack);

    //console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::Route53::HostedZone", {
      Name: 'ui.site.com.'
    });

    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: 'ui.site.com.jtviegas.com.',
      Type: 'NS'
    });

    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: 'ui.site.com',
      ValidationMethod: 'DNS'
    });

    template.hasResourceProperties("AWS::Route53::HostedZone", {
      Name: 'lb.site.com.'
    });

    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: 'lb.site.com.jtviegas.com.',
      Type: 'NS'
    });


})
})