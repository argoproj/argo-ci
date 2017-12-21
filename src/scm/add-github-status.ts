import * as yargs from 'yargs';

import { GitHubScm } from './github';

let argv = yargs
    .option('githubUser', {describe: 'Github user name', demand: true })
    .option('githubPassword', {describe: 'Github user password', demand: true })
    .option('repoName', {demand: true })
    .option('commit', {demand: true })
    .option('status', {demand: true })
    .option('targetUrl', {demand: true})
    .argv;

const scm = new GitHubScm(argv.githubSecret, argv.githubUser, argv.githubPassword);

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
scm.addCommitStatus(argv.repoName, argv.commit, {
    targetUrl: argv.targetUrl,
    description: argv.description,
    state,
});
