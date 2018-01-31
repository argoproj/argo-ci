import * as yargs from 'yargs';
import * as bunyan from 'bunyan';
const logger = bunyan.createLogger({ name: 'add-status' });

import * as util from '../util';

import { ConfigManager } from '../config-manager';

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
ConfigManager.create(argv.configPrefix, coreKubeClient).then(async configManager => {
    const scmByName = await configManager.getScms();
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

    configManager.dispose();
    process.exit(0);
}).catch(err => {
    process.exit(1);
    logger.error(err);
});
