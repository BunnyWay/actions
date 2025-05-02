import * as core from "@actions/core";

export async function run() {
  const apiKey = core.getInput("api_key", { required: true });
  const appId = core.getInput("app_id", { required: true });
  const container = core.getInput("container", { required: true });
  const imageTag = core.getInput("image_tag", { required: true });

  try {
    const token = await exchangeApiKeyForToken(apiKey);
    const appConfig = await getAppConfiguration(token, appId);

    let replaced = false;
    appConfig.containerTemplates.forEach((value, index) => {
      if (value.name !== container) {
        return;
      }
      appConfig.containerTemplates[index].imageTag = imageTag;
      // If imageDigest is set, we need to remove it, because it seems to
      // take presedence over imageTag.
      delete appConfig.containerTemplates[index].imageDigest;
      replaced = true;
    });

    if (replaced === false) {
      throw new Error(`Could not find container "${container}".`);
    }

    await saveAppConfiguration(token, appId, appConfig);
  } catch (e) {
    if (typeof e === 'string' || e instanceof Error) {
      core.setFailed(e);
    } else {
      core.setFailed('Unexpected error');
    }
  }
}

async function exchangeApiKeyForToken(apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fetch('https://api.bunny.net/apikey/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': apiKey,
      },
      body: JSON.stringify({ AccessKey: apiKey }),
    })
      .then(response => {
        if (response.status === 401) {
          reject('Invalid api_key.');
          return;
        }

        if (response.status !== 200) {
          reject(`Could not obtain access token: HTTP status ${response.status}.`);
          return;
        }

        response.json()
          .then(obj => {
            resolve(obj.Token);
          })
          .catch(e => {
            console.log(e);
            reject('Could not parse JSON response.');
          })
        ;
      })
      .catch(e => {
        console.log(e);
        reject('Could not obtain access token.');
      });
  });
}

async function getAppConfiguration(token: string, appId: string): Promise<AppConfiguration> {
  return new Promise((resolve, reject) => {
    fetch(`https://api-mc.opsbunny.net/v1/namespaces/default/applications/${appId}/configuration`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': token
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

async function saveAppConfiguration(token: string, appId: string, appConfig: AppConfiguration): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch('https://api-mc.opsbunny.net/v1/namespaces/default/applications', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify(appConfig),
    })
      .then(response => {
        if (response.status !== 200) {
          reject(`Could not save app configuration: HTTP status ${response.status}.`);
          return;
        }

        resolve();
      })
      .catch(e => {
        console.log(e);
        reject('Could not save app configuration.');
      })
    ;
  });
}

type AppConfiguration = {
  id: string;
  containerTemplates: Array<{
    name: string;
    imageTag: string;
    imageDigest?: string;
  }>;
}
