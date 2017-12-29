import * as yargs from 'yargs';
import * as shell from 'shelljs';

import * as app from './app';

let argv = yargs
    .option('argoUiUrl', {describe: 'Argo UI URL', demand: true })
    .option('reposDir', {describe: 'Repositories temp directory' })
    .option('inCluster', {describe: 'Flag which indicates if app is running insite kube cluster or not' })
    .option('crdVersion', {describe: 'Version of Workflow CRD. Default is v1alpha1' })
    .option('namespace', {describe: 'Workflows creation namespace' })
    .option('argoCiImage', {describe: 'Argo CI Image name' })
    .option('configPrefix', {describe: 'Configuration name prefix' })
    .argv;

app.createServers({
    argoUiUrl: argv.argoUiUrl,
    repoDir: argv.repoDir || shell.tempdir(),
    inCluster: argv.inCluster === 'true',
    version: argv.crdVersion || 'v1alpha1',
    namespace: argv.namespace || 'default',
    argoCiImage: argv.argoCiImage || 'argoproj/argoci:latest',
    configPrefix: argv.configPrefix || 'argo-ci',
}).then(servers => {
    servers.webHookServer.listen(8001);
    servers.apiServer.listen(8002);
});
