import * as cdk from "aws-cdk-lib";
const util = require("util")
import { EC2Client, DescribeManagedPrefixListsCommand } from "@aws-sdk/client-ec2"; // ES Modules import


 describe("commons utils", async () => {
  test("methods work as expected", async () => {

    const client = new EC2Client({});
    const input = { // DescribeManagedPrefixListsRequest
      // DryRun: true || false,
      Filters: [ // FilterList
        { // Filter
          Name: "prefix-list-name",
          Values: [ "com.amazonaws.global.cloudfront.origin-facing" ],
        },
      ],
      // PrefixListIds: [
      //   "STRING_VALUE",
      // ],
    };
    const command = new DescribeManagedPrefixListsCommand(input);
    const response = await client.send(command);
    console.log(util.inspect(response))
})
})



