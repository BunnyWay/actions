type BunnyClient = {
  base: string,
  token: string,
};

const createClient = (base: string, token: string): BunnyClient => { return ({ base, token }) };

const deployScript = (client: BunnyClient) => async (scriptId: string, code: string) => {
  const endpoint_save = `${client.base}/compute/script/${scriptId}/code`;
  const response = await fetch(endpoint_save, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "DeploymentKey": client.token,
    },
    body: JSON.stringify({ Code: code }),
  });

  if (!response.ok) {
    console.error(`Failed to update script: ${response.statusText}`);
    console.error(await response.text());
    throw new Error("");
  }

  const endpoint_publish = `${client.base}/compute/script/${scriptId}/publish`;

  const responsePublish = await fetch(endpoint_publish, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "DeploymentKey": client.token,
    },
  });

  if (!responsePublish.ok) {
    console.error(`Failed to publish script: ${response.statusText}`);
    console.error(await response.text());
    throw new Error("");
  }

  console.log("Script updated and published successfully");
}

export {
  BunnyClient,
  deployScript,
  createClient,
}
