import * as yargs from 'yargs';
import * as bunyan from 'bunyan';
const logger = bunyan.createLogger({ name: 'add-status' });

import * as util from '../util';

import { ScmManager } from './scm-manager';

let argv = yargs
    .option('scm', {demand: true })
    .option('repoUrl', {demand: true })
    .option('repoName', {demand: true })
    .option('commit', {demand: true })
    .option('status', {demand: true })
    .option('targetUrl', {demand: true})
    .option('inCluster', {demand: true})
    .option('namespace', {demand: true})
    .option('configPrefix', {demand: true})
    .argv;

const coreKubeClient = util.createKubeCoreClient(argv.inCluster === 'true', argv.namespace);
ScmManager.create(argv.configPrefix, coreKubeClient).then(async scmManager => {
    const scmByName = await scmManager.getScms();
    const scm = scmByName.get(argv.scm);
    let state: 'error' | 'failure' | 'pending' | 'success';
    switch (argv.status) {
        case 'Succeeded':
            state = 'success';
            break;
        case 'Failed':
            state = 'failure';
            break;
        case 'Error':
            state = 'error';
            break;
    }
    await scm.addCommitStatus(argv.repoUrl, argv.repoName, argv.commit, {
        targetUrl: argv.targetUrl,
        description: argv.description || 'Argo CI',
        state,
    });

    scmManager.dispose();
}).catch(err => logger.error(err));
