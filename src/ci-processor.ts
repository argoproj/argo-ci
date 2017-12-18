import * as promisify from 'promisify-node';
import * as path from 'path';
import * as shell from 'shelljs';
import * as yaml from 'js-yaml';
import * as AsyncLock from 'async-lock';
import * as Api from 'kubernetes-client';
import * as bunyan from 'bunyan';

import * as common from './common';
import * as util from './util';

const fs = promisify('fs');
const logger = bunyan.createLogger({ name: 'ci-processor' });

export class CiProcessor {

    private lock = new AsyncLock();

    constructor(private reposPath: string, private externalUiUrl: string, private crdKubeClient: Api.CustomResourceDefinitions) {
    }

    public async processGitEvent(scm: common.Scm, scmEvent: common.ScmEvent) {
        try {
            logger.debug('Processing scm event', scmEvent);
            await this.doProcessGitEvent(scm, scmEvent);
        } catch (e) {
            logger.error(`Failed to process scm event %s`, scmEvent, e);
            this.addCommitStatus(scm, scmEvent, {targetUrl: null, description: 'Argo CI workflow', state: 'failure'});
        }
    }

    public async doProcessGitEvent(scm: common.Scm, scmEvent: common.ScmEvent) {
        const ciWorkflow = await this.asyncLock(scmEvent.repository.cloneUrl, () => this.loadCiWorkflow(scmEvent.repository.cloneUrl, scmEvent.headCommitSha));
        if (ciWorkflow.spec.arguments && ciWorkflow.spec.arguments.parameters) {
            const revisionParam = ciWorkflow.spec.arguments.parameters.find(param => param.name === 'revision');
            const repoParam = ciWorkflow.spec.arguments.parameters.find(param => param.name === 'repo');
            if (revisionParam) {
                revisionParam.value = scmEvent.headCommitSha;
            }
            if (repoParam) {
                repoParam.value = scmEvent.repository.cloneUrl;
            }
        }
        if (ciWorkflow) {
            const res = await this.crdKubeClient.ns['workflows'].post({ body: ciWorkflow });
            this.addCommitStatus(scm, scmEvent, {
                targetUrl: `${this.externalUiUrl}/timeline/${res.metadata.namespace}/${res.metadata.name}`,
                description: 'Argo CI workflow',
                state: 'pending',
            });
        }
    }

    private async addCommitStatus(scm: common.Scm, event: common.ScmEvent, status: common.CommitStatus) {
        try {
            await scm.addCommitStatus(event, status);
        } catch (e) {
            logger.error('Unable to update commit status', e);
        }
    }

    private asyncLock<T>(key: string, action: () => Promise<T>): Promise<T> {
        return this.lock.acquire(key, () => action());
    }

    private async ensureRepoInitialized(url: string) {
        const repoPath = path.join(this.reposPath, url.replace(/\//g, '_'));
        if (!await util.fileExists(repoPath)) {
            await fs.mkdir(repoPath);
        }
        try {
            await util.sh(`git status`, repoPath);
        } catch (e) {
            await util.sh(`git init && git config core.sparseCheckout true && echo '.argo-ci/' > .git/info/sparse-checkout && git remote add origin '${url}'`, repoPath);
        }
        logger.debug(`Updating repository '${url}'`);
        await util.sh('git fetch origin', repoPath);
        return repoPath;
    }

    private async loadCiWorkflow(repoCloneUrl: string, tag: string): Promise<any> {
        const repoPath = await this.ensureRepoInitialized(repoCloneUrl);
        await util.sh(`git checkout ${tag}`, repoPath);
        const templatePath = `${repoPath}/.argo-ci/ci.yaml`;
        if (await util.fileExists(templatePath)) {
            return yaml.safeLoad(await fs.readFile(templatePath, 'utf8'));
        }
        logger.warn(`Repository '${repoCloneUrl}#${tag}' does not have .argo-ci/ci.yaml`);
        return null;
    }
}
