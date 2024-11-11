import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import {BaseConstructs, DistributedService, DistributedServiceProps, BaseConstructsProps, CLOUDFRONT_PREFIX_LIST} from "../../../src";
const util = require("util")

describe("StateMachineStack", () => {
  test("synthesizes the way we expect", () => {
    const app = new cdk.App();
    
    const baseProps: BaseConstructsProps = {
      organisation: "corp",
      department: "main",
      solution: "abc",
      logsBucketOn: true,
      env: { name: "dev", region: "eu-north-1", account: "123456" }
    }
    const testStack = new cdk.Stack(app, "TestStack", baseProps);
    const base = new BaseConstructs(testStack, "TestStack-baseconstructs", baseProps)

    const props: DistributedServiceProps = {
      ... baseProps,
      domain: {
        distribution: "ui.site.com",
        loadBalancer: "lb.site.com"
      },
      docker: {
        imageUri: "strm/helloworld-http"
      }
    }
    const service = new DistributedService(testStack, "TestStack-service", props, base);
    const template = Template.fromStack(testStack);

    //console.log(util.inspect(template.toJSON(), {showHidden: false, depth: null, colors: true}))

    template.hasResourceProperties("AWS::ECS::Cluster", {
      ClusterName: 'abc-dev-eunorth1-cluster',
    });

    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: [{Image: 'strm/helloworld-http'}],
      Family: 'AbcDevEunorth1'
    });

    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      SourcePrefixListId: CLOUDFRONT_PREFIX_LIST,
      FromPort: 0,
      ToPort: 65535
    });

    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 443,
      Protocol: 'HTTPS'
    });

    template.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: 'lb.site.com',
      ValidationMethod: 'DNS'
    });

    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: 'abc-dev-eunorth1-fargate-srv',
      Cluster: { Ref: 'TestStackserviceTestStackserviceclusterD4914B63' },
      DeploymentController: { Type: 'ECS' },
      LoadBalancers: [{ContainerName: 'abc-dev-eunorth1-image-srv',
        ContainerPort: 80}]
    });

    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Aliases: [ 'ui.site.com' ]
      }
    });


})
})