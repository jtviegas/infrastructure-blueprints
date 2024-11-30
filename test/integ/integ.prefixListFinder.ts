import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import { PrefixListFinderProps, PrefixListFinder, CommonStackProps } from "../../src";
import { Construct } from "constructs";
import { App, Stack } from "aws-cdk-lib";
import { ActualResult, ExpectedResult, IntegTest } from "@aws-cdk/integ-tests-alpha";
const util = require("util")


interface StackUnderTestProps extends CommonStackProps, PrefixListFinderProps {
}

const props: StackUnderTestProps = {
  organisation: "nn",
  department: "dsss",
  solution: "stackUnderTest-base",
  env: { "name": "dev",
        "region": "eu-north-1",
        "account": "041651352119",
        "domain": {
          "name": "jtviegas.com",
          "private": false
        }
       },
  stackName: "StackUnderTest",
  prefixListName: "com.amazonaws.global.cloudfront.origin-facing"
};

class StackUnderTest extends Stack {
  readonly finder: PrefixListFinder;
  constructor(scope: Construct, id: string, props: StackUnderTestProps) {
    super(scope, id, props);
    this.finder = new PrefixListFinder(this, "finder", props)
  }
} ;

const app = new App();
const stackUnderTest = new StackUnderTest(app, props.stackName!, props)

const integ = new IntegTest(app, 'IntegTest', {
  testCases: [stackUnderTest],
  cdkCommandOptions: {
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [props.env.region],
});

//console.log(util.inspect(stackUnderTest.finder.getPrefixListId()));



