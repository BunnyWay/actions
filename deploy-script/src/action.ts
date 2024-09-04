import * as core from "@actions/core";
import * as fs from "fs/promises";
import * as Bunny from "./bunny";

export async function run() {
  try {
    // const githubToken = core.getInput('token', { required: true });
    const scriptId = core.getInput("script_id", { required: true });
    const deployKey = core.getInput("deploy_key", { required: false });
    const base = core.getInput("base", { required: false });

    let token: Bunny.Token;

    if (deployKey == "") {
      token = Bunny.newOIDCToken(await core.getIDToken());
    } else {
      token = Bunny.newDeployKey(deployKey);
    }

    const client = Bunny.createClient(base, token);

    const file_path = core.getInput("file", { required: true });

    const fileContent = await fs.readFile(file_path, { encoding: "utf-8" });

    await Bunny.deployScript(client)(scriptId, fileContent);
  } catch (error: unknown) {
    console.error(error as Error);
    core.setFailed((error as Error).message);
  }
}
