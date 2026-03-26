import * as core from "@actions/core";

export async function run() {
  const apiKey = core.getInput("api_key", { required: true });
  const appId = core.getInput("app_id", { required: true });
  const containerName = core.getInput("container", { required: true });
  const imageTag = core.getInput("image_tag", { required: true });
  const imageDigest = core.getInput("image_digest");

  try {
    const appConfig = await getAppConfiguration(apiKey, appId);
    const containers = appConfig.containerTemplates.filter(v => v.name === containerName);

    if (containers.length === 0) {
      throw new Error(`Could not find container named "${containerName}".`);
    }

    if (containers.length > 1) {
      throw new Error(`Found more than one container named "${containerName}".`);
    }

    const containerId = containers[0].id;
    if (imageDigest === '') {
      console.log(`Updating container "${containerName}" (${containerId}) with tag "${imageTag}"`);
    } else {
      console.log(`Updating container "${containerName}" (${containerId}) with tag "${imageTag}", digest "${imageDigest}"`);
    }

    patchAppContainer(apiKey, appId, containerId, imageTag, imageDigest);
  } catch (e) {
    if (typeof e === 'string' || e instanceof Error) {
      core.setFailed(e);
    } else {
      core.setFailed('Unexpected error');
    }
  }
}

async function getAppConfiguration(apiKey: string, appId: string): Promise<AppConfiguration> {
  return new Promise((resolve, reject) => {
    fetch(`https://api.bunny.net/mc/apps/${appId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'AccessKey': apiKey
      },
    })
      .then(response => {
        if (response.status === 400) {
          reject(`Could not obtain app configuration: Double-check your app_id.`);
          return;
        }

        if (response.status !== 200) {
          reject(`Could not obtain app configuration: HTTP status ${response.status}.`);
          return;
        }

        response.json()
          .then(obj => {
            resolve(obj);
          })
          .catch(e => {
            console.log(e);
            reject('Could not parse JSON response.');
          })
        ;
      })
      .catch(e => {
        console.log(e);
        reject('Could not obtain app configuration.');
      })
    ;
  });
}

type PatchBody = {
  id: string;
  imageTag: string;
  imageDigest?: string;
}

async function patchAppContainer(apiKey: string, appId: string, containerId: string, imageTag: string, imageDigest?: string): Promise<void> {
  const body : PatchBody = {
    id: containerId,
    imageTag: imageTag,
  };

  if (imageDigest !== undefined && imageDigest.length > 0) {
    body.imageDigest = imageDigest;
  }

  return new Promise((resolve, reject) => {
    fetch(`https://api.bunny.net/mc/apps/${appId}/containers/${containerId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': apiKey,
      },
      body: JSON.stringify(body),
    })
      .then(response => {
        if (response.status !== 200) {
          reject(`Could not save container configuration: HTTP status ${response.status}.`);
          return;
        }

        resolve();
      })
      .catch(e => {
        console.error(e);
        reject('Could not save container configuration.');
      })
    ;
  });
}

type AppConfiguration = {
  id: string;
  containerTemplates: Array<{
    id: string;
    name: string;
  }>;
}
