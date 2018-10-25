import * as yargs from 'yargs';
import * as shell from 'shelljs';

import * as app from './app';
import { logger } from './util';

let argv = yargs
    .option('reposDir', {describe: 'Repositories temp directory' })
    .option('inCluster', {describe: 'Flag which indicates if app is running insite kube cluster or not' })
    .option('crdVersion', {describe: 'Version of Workflow CRD. Default is v1alpha1' })
    .option('namespace', {describe: 'Workflows creation namespace' })
    .option('argoCiImage', {describe: 'Argo CI Image name' })
    .option('configPrefix', {describe: 'Configuration name prefix' })
    .option('controllerInstanceId', {describe: 'Argo workflow controller instance id. Used to separate workflows in a cluster with multiple controllers.' })
    .argv;

app.createServers({
    repoDir: argv.repoDir || shell.tempdir(),
    inCluster: argv.inCluster === 'true',
    version: argv.crdVersion || 'v1alpha1',
    workflowsNamespace: argv.workflowsNamespace || 'default',
    namespace: argv.namespace || 'default',
    argoCiImage: argv.argoCiImage || 'argoproj/argoci:latest',
    configPrefix: argv.configPrefix || 'argo-ci',
    controllerInstanceId: argv.controllerInstanceId || '',
}).then(servers => {
    servers.webHookServer.listen(8001);
    servers.apiServer.listen(8002);
}).catch(e => {
    logger.error(e);
});
