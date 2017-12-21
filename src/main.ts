import * as yargs from 'yargs';
import * as shell from 'shelljs';

import * as app from './app';
import { GitHubScm } from './scm';

let argv = yargs
    .option('githubSecret', {describe: 'Github secret', demand: true })
    .option('githubUser', {describe: 'Github user name', demand: true })
    .option('githubPassword', {describe: 'Github user password', demand: true })
    .option('argoUiUrl', {describe: 'Argo UI URL', demand: true })
    .option('reposDir', {describe: 'Repositories temp directory' })
    .option('inCluster', {describe: 'Flag which indicates if app is running insite kube cluster or not' })
    .option('crdVersion', {describe: 'Version of Workflow CRD. Default is v1alpha1' })
    .option('namespace', {describe: 'Workflows creation namespace' })
    .option('argoCiImage', {describe: 'Argo CI Image name' })
    .argv;

const scm = { github: new GitHubScm(argv.githubSecret, argv.githubUser, argv.githubPassword) };
const server = app.createServer(scm, {
    repoDir: argv.repoDir || shell.tempdir(),
    inCluster: argv.inCluster === 'true',
    version: argv.crdVersion || 'v1alpha1',
    namespace: argv.namespace || 'default',
    argoUiUrl: argv.argoUiUrl,
    argoCiImage: argv.argoCiImage,
});

server.listen(8001);
