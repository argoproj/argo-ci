import * as shell from 'shelljs';
import * as chai from 'chai';
import * as http from 'http';
chai.use(require('chai-http'));

import * as app from '../../app/app';
import * as util from '../../app/util';
import { ConfigManager } from '../../app/config-manager';

export interface TestEnv {
    apiServer;
    configManager: ConfigManager;
}

export const TEST_NAMESPACE = 'argo-ci-test';
export const TEST_CONTROLLER_INSTANCE_ID = 'argo-ci-test';

let server: http.Server;
export let env: TestEnv;
export let apiAgent: ChaiHttp.Agent;
export let coreKubeClient: any;

async function deleteAllKubeObjects(type: string) {
    const list = await coreKubeClient.ns(TEST_NAMESPACE)[type].get();
    await Promise.all(list.items.map(item => coreKubeClient.ns(TEST_NAMESPACE)[type].delete(item.metadata.name)));
}

export async function prepareTestNamespace() {
    const namespaces = await coreKubeClient.namespaces.get();
    if (namespaces.items.findIndex(item => item.metadata.name === TEST_NAMESPACE) === -1) {
        await coreKubeClient.namespaces.post({ body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: TEST_NAMESPACE } }});
    }
    await deleteAllKubeObjects('configmap');
}

before(async () => {
    const servers = await app.createServers({
        repoDir: shell.tempdir(),
        inCluster: false,
        version: 'v1alpha1',
        namespace: TEST_NAMESPACE,
        argoCiImage: 'argoproj/argoci:latest',
        configPrefix: 'argo-ci',
        controllerInstanceId: TEST_CONTROLLER_INSTANCE_ID,
    });
    coreKubeClient = util.createKubeCoreClient(false, TEST_NAMESPACE);
    await prepareTestNamespace();
    env = { apiServer: servers.apiServer, configManager: servers.configManager };
    server = http.createServer(env.apiServer);
    apiAgent = chai.request(server);
});

after(async () => {
    env.configManager.dispose();
    server.close();
});
