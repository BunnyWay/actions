import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as Bunny from './bunny';

export async function run() {
  try {
    // const githubToken = core.getInput('token', { required: true });
    const scriptId = core.getInput('script_id', { required: true });
    const accessKey = core.getInput('access_key', { required: true });

    const client = Bunny.createClient("https://api.bunny.net", accessKey);

    const file_path = core.getInput('file', { required: true });

    const fileContent = await fs.readFile(file_path, { encoding: "utf-8" });

    await Bunny.deployScript(client)(scriptId, fileContent);
  } catch (error: unknown) {
    console.error(error as Error);
    core.setFailed((error as Error).message);
  }
}
