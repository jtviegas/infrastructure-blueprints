import * as cdk from "aws-cdk-lib";
const util = require("util")
import {
  EC2Client, GetManagedPrefixListEntriesCommand,
  DescribeManagedPrefixListsCommand
} from "@aws-sdk/client-ec2"; // ES Modules import
import { CLOUDFRONT_PREFIX_LIST } from "../../../src";


describe("commons utils", async () => {

  test.skip("DescribeManagedPrefixListsCommand work as expected", async () => {

    const client = new EC2Client({});
    const input = {
      Filters: [
        { 
          Name: "prefix-list-name",
          Values: ["com.amazonaws.global.cloudfront.origin-facing"],
        },
      ]
    };
    const command = new DescribeManagedPrefixListsCommand(input);
    const response = await client.send(command);
    //console.log(util.inspect(response))
  })

  test.skip("GetManagedPrefixListEntriesCommand work as expected", async () => {

    const client = new EC2Client({});
    const input = {
      PrefixListId: CLOUDFRONT_PREFIX_LIST
    };
    const command = new GetManagedPrefixListEntriesCommand(input);
    const response = await client.send(command);
    console.log(util.inspect(response))
  })

})



